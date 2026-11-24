import { TrackId } from "@bafle/domain/Catalog/Track";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Schema from "effect/Schema";
import { Command, Dom } from "foldkit";
import { back, load, pushUrl, replaceUrl } from "foldkit/navigation";
import { Catalog, type CatalogClient, REPLY_TIMEOUT } from "./catalog.ts";
import { Message } from "./message.ts";
import { searchRouter, trackRouter } from "./route.ts";
import { pageTitleIdOf, TRACK_ROW_ATTRIBUTE } from "./view/layout.ts";

// COMMAND

export const SEARCH_FIELD_ID = "search-field";

/** How long the listener must stop typing before Search asks the catalog. */
export const TYPING_PAUSE = Duration.millis(300);

/**
 * The URL follows the screen: this runs when a page chosen by a link takes
 * the screen, never when the link is pressed, so every entry it adds to the
 * history is for a page that was shown.
 */
export const NavigateInternal = Command.define("NavigateInternal", {
  args: { url: Schema.String },
  messages: [Message.CompletedNavigateInternal],
  execute: ({ url }) => pushUrl(url).pipe(Effect.as(Message.CompletedNavigateInternal())),
});

/** The browser's own Back: the history gains no entry, and the page left behind is still ahead. */
export const NavigateBack = Command.define("NavigateBack", {
  messages: [Message.CompletedNavigateBack],
  execute: back().pipe(Effect.as(Message.CompletedNavigateBack())),
});

export const LoadExternal = Command.define("LoadExternal", {
  args: { href: Schema.String },
  messages: [Message.CompletedLoadExternal],
  execute: ({ href }) => load(href).pipe(Effect.as(Message.CompletedLoadExternal())),
});

/** Typing rewrites the current history entry, so Back never walks a term back letter by letter. */
export const ReplaceSearchTerm = Command.define("ReplaceSearchTerm", {
  args: { maybeTerm: Schema.Option(Schema.String) },
  messages: [Message.CompletedReplaceSearchTerm],
  execute: ({ maybeTerm }) =>
    replaceUrl(searchRouter({ maybeTerm })).pipe(Effect.as(Message.CompletedReplaceSearchTerm())),
});

/**
 * The expanded player went on to another track: the entry it was opened
 * with is rewritten for the track it shows now. No entry is added, so Back
 * closes the player however many tracks went by.
 */
export const ReplaceTrackUrl = Command.define("ReplaceTrackUrl", {
  args: { trackId: TrackId },
  messages: [Message.CompletedReplaceTrackUrl],
  execute: ({ trackId }) =>
    replaceUrl(trackRouter({ trackId })).pipe(Effect.as(Message.CompletedReplaceTrackUrl())),
});

export const WaitForTypingPause = Command.define("WaitForTypingPause", {
  args: { pauseId: Schema.String },
  messages: [Message.CompletedWaitForTypingPause],
  execute: ({ pauseId }) =>
    Effect.sleep(TYPING_PAUSE).pipe(Effect.as(Message.CompletedWaitForTypingPause({ pauseId }))),
});

/** Without scrolling: a page the listener comes back to stays where they left it. */
export const FocusSearchField = Command.define("FocusSearchField", {
  messages: [Message.CompletedFocusSearchField],
  execute: Dom.focus(`#${SEARCH_FIELD_ID}`, { preventScroll: true }).pipe(
    Effect.ignore,
    Effect.as(Message.CompletedFocusSearchField()),
  ),
});

/**
 * Focus goes to a page when what held it is gone: the Try again that was
 * pressed, or the row that opened a track and is now behind its page.
 */
export const FocusPage = Command.define("FocusPage", {
  args: { pageId: Schema.String },
  messages: [Message.CompletedFocusPage],
  execute: ({ pageId }) =>
    Dom.focus(`#${pageId}`).pipe(Effect.ignore, Effect.as(Message.CompletedFocusPage())),
});

/**
 * Focus goes to a track's row without scrolling: back from the track, where
 * the list is as the listener left it, or when what held the focus in the row
 * is gone. A list that no longer has the row gives the focus to its page.
 */
export const FocusTrackRow = Command.define("FocusTrackRow", {
  args: { pageId: Schema.String, trackId: TrackId },
  messages: [Message.CompletedFocusTrackRow],
  execute: ({ pageId, trackId }) =>
    // A page lists a track once.
    Dom.focus(`#${pageId} [data-${TRACK_ROW_ATTRIBUTE}="${trackId}"]`, { preventScroll: true }).pipe(
      Effect.catch(() => Dom.focus(`#${pageId}`, { preventScroll: true })),
      Effect.ignore,
      Effect.as(Message.CompletedFocusTrackRow()),
    ),
});

export const ScrollPageToTop = Command.define("ScrollPageToTop", {
  args: { pageId: Schema.String },
  messages: [Message.CompletedScrollPageToTop],
  execute: ({ pageId }) =>
    Dom.scrollIntoView(`#${pageTitleIdOf(pageId)}`, { block: "start" }).pipe(
      Effect.ignore,
      Effect.as(Message.CompletedScrollPageToTop()),
    ),
});

/** A query to the catalog, still missing the id its reply will be recognised by. */
export type Request = (requestId: string) => Command.Command<Message, never, CatalogClient>;

type CatalogMessage = typeof Catalog.Message.Type;

const toMessage = (message: CatalogMessage): Message => Message.GotCatalogMessage({ message });

/** No answer in time is all the app can say of it: the same failure as a reply lost on the way. */
const UNANSWERED: Readonly<{ _tag: "Unknown" }> = { _tag: "Unknown" };

/**
 * A query gives up after `REPLY_TIMEOUT` and reports the failure it would
 * report for a lost reply, so nothing waits forever on a server that hangs.
 * The request itself is interrupted when the time runs out.
 */
const asking = (
  query: Command.Command<CatalogMessage, never, CatalogClient>,
  unanswered: CatalogMessage,
): Command.Command<Message, never, CatalogClient> =>
  pipe(
    query,
    Command.mapEffect(
      Effect.timeoutOrElse({
        duration: REPLY_TIMEOUT,
        orElse: () => Effect.succeed(unanswered),
      }),
    ),
    Command.mapMessage(toMessage),
  );

export const askHomeFeed: Request = (requestId) =>
  asking(
    Catalog.HomeFeed({ input: {}, requestId }),
    Catalog.Message.FailedHomeFeed({ requestId, failure: UNANSWERED }),
  );

export const askNewMusic: Request = (requestId) =>
  asking(
    Catalog.NewMusic({ input: {}, requestId }),
    Catalog.Message.FailedNewMusic({ requestId, failure: UNANSWERED }),
  );

export const askCatalogSearch =
  (term: string): Request =>
  (requestId) =>
    asking(
      Catalog.CatalogSearch({ input: { term }, requestId }),
      Catalog.Message.FailedCatalogSearch({ requestId, failure: UNANSWERED }),
    );

export const askTrackDetail =
  (trackId: TrackId): Request =>
  (requestId) =>
    asking(
      Catalog.TrackDetail({ input: { trackId }, requestId }),
      Catalog.Message.FailedTrackDetail({ requestId, failure: UNANSWERED }),
    );
