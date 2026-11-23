import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Command, Dom } from "foldkit";
import { load, pushUrl, replaceUrl } from "foldkit/navigation";
import { Catalog, type CatalogClient } from "./catalog.ts";
import { Message } from "./message.ts";
import { searchRouter } from "./route.ts";
import { PAGE_ID } from "./view/layout.ts";

// COMMAND

export const SEARCH_FIELD_ID = "search-field";

/** How long the listener must stop typing before Search asks the catalog. */
export const TYPING_PAUSE = Duration.millis(300);

export const NavigateInternal = Command.define("NavigateInternal", {
  args: { url: Schema.String },
  messages: [Message.CompletedNavigateInternal],
  execute: ({ url }) => pushUrl(url).pipe(Effect.as(Message.CompletedNavigateInternal())),
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

export const WaitForTypingPause = Command.define("WaitForTypingPause", {
  args: { pauseId: Schema.String },
  messages: [Message.CompletedWaitForTypingPause],
  execute: ({ pauseId }) =>
    Effect.sleep(TYPING_PAUSE).pipe(Effect.as(Message.CompletedWaitForTypingPause({ pauseId }))),
});

export const FocusSearchField = Command.define("FocusSearchField", {
  messages: [Message.CompletedFocusSearchField],
  execute: Dom.focus(`#${SEARCH_FIELD_ID}`).pipe(
    Effect.ignore,
    Effect.as(Message.CompletedFocusSearchField()),
  ),
});

/** After Try again its button is gone: focus goes to the page it acted on, not back to the top. */
export const FocusPage = Command.define("FocusPage", {
  messages: [Message.CompletedFocusPage],
  execute: Dom.focus(`#${PAGE_ID}`).pipe(Effect.ignore, Effect.as(Message.CompletedFocusPage())),
});

/** A query to the catalog, still missing the id its reply will be recognised by. */
export type Request = (requestId: string) => Command.Command<Message, never, CatalogClient>;

const toMessage = (message: typeof Catalog.Message.Type): Message =>
  Message.GotCatalogMessage({ message });

export const askHomeFeed: Request = (requestId) =>
  Command.mapMessage(Catalog.HomeFeed({ input: {}, requestId }), toMessage);

export const askNewMusic: Request = (requestId) =>
  Command.mapMessage(Catalog.NewMusic({ input: {}, requestId }), toMessage);

export const askCatalogSearch =
  (term: string): Request =>
  (requestId) =>
    Command.mapMessage(Catalog.CatalogSearch({ input: { term }, requestId }), toMessage);
