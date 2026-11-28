import { AlbumId } from "@bafle/domain/Catalog/Album";
import { ArtistId } from "@bafle/domain/Catalog/Artist";
import { GenreId } from "@bafle/domain/Catalog/Genre";
import { PlaylistId } from "@bafle/domain/Catalog/Playlist";
import { StationId } from "@bafle/domain/Catalog/Station";
import { TrackId } from "@bafle/domain/Catalog/Track";
import * as Array from "effect/Array";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { flow, pipe } from "effect/Function";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Command, Dom, Render } from "foldkit";
import { back, load, pushUrl, replaceUrl } from "foldkit/navigation";
import { Catalog, type CatalogClient, REPLY_TIMEOUT, unanswered } from "./catalog.ts";
import { Message } from "./message.ts";
import type { ListedSection } from "./model.ts";
import { searchRouter, trackRouter } from "./route.ts";
import { asWait } from "./timing.ts";
import { type Span, TurnWay, turnedFrom } from "./turn.ts";
import { firstPicturesOf } from "./view/firstPictures.ts";
import {
  NAVIGATION_ID,
  PAGE_IDS,
  TILE_ATTRIBUTES,
  TRACK_ROW_ATTRIBUTE,
  pageTitleIdOf,
} from "./view/layout.ts";

// COMMAND

export const SEARCH_FIELD_ID = "search-field";

/** The data attribute that marks the box Search's field is drawn in: the field, its magnifier and the control that empties it. */
export const SEARCH_FIELD_BOX_ATTRIBUTE = "search-field-box";

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
    Dom.focus(`#${pageId} [data-${TRACK_ROW_ATTRIBUTE}="${trackId}"]`, {
      preventScroll: true,
    }).pipe(
      Effect.catch(() => Dom.focus(`#${pageId}`, { preventScroll: true })),
      Effect.ignore,
      Effect.as(Message.CompletedFocusTrackRow()),
    ),
});

/**
 * Focus goes to an album's tile without scrolling: back from the album, on
 * the shelf it was chosen from. A page that no longer has the tile gives the
 * focus to itself.
 */
export const FocusAlbumTile = Command.define("FocusAlbumTile", {
  args: { pageId: Schema.String, albumId: AlbumId },
  messages: [Message.CompletedFocusAlbumTile],
  execute: ({ pageId, albumId }) =>
    // A page shelves an album once.
    Dom.focus(`#${pageId} [data-${TILE_ATTRIBUTES.Album}="${albumId}"]`, {
      preventScroll: true,
    }).pipe(
      Effect.catch(() => Dom.focus(`#${pageId}`, { preventScroll: true })),
      Effect.ignore,
      Effect.as(Message.CompletedFocusAlbumTile()),
    ),
});

/** Focus goes to an artist's tile, as it goes to an album's: back from the artist, without scrolling. */
export const FocusArtistTile = Command.define("FocusArtistTile", {
  args: { pageId: Schema.String, artistId: ArtistId },
  messages: [Message.CompletedFocusArtistTile],
  execute: ({ pageId, artistId }) =>
    // A page shelves an artist once.
    Dom.focus(`#${pageId} [data-${TILE_ATTRIBUTES.Artist}="${artistId}"]`, {
      preventScroll: true,
    }).pipe(
      Effect.catch(() => Dom.focus(`#${pageId}`, { preventScroll: true })),
      Effect.ignore,
      Effect.as(Message.CompletedFocusArtistTile()),
    ),
});

/** Focus goes to a playlist's tile, as it goes to an album's: back from the playlist, without scrolling. */
export const FocusPlaylistTile = Command.define("FocusPlaylistTile", {
  args: { pageId: Schema.String, playlistId: PlaylistId },
  messages: [Message.CompletedFocusPlaylistTile],
  execute: ({ pageId, playlistId }) =>
    // A page shelves a playlist once.
    Dom.focus(`#${pageId} [data-${TILE_ATTRIBUTES.Playlist}="${playlistId}"]`, {
      preventScroll: true,
    }).pipe(
      Effect.catch(() => Dom.focus(`#${pageId}`, { preventScroll: true })),
      Effect.ignore,
      Effect.as(Message.CompletedFocusPlaylistTile()),
    ),
});

/** Focus goes to a genre's tile, as it goes to an album's: back from the genre, without scrolling. */
export const FocusGenreTile = Command.define("FocusGenreTile", {
  args: { pageId: Schema.String, genreId: GenreId },
  messages: [Message.CompletedFocusGenreTile],
  execute: ({ pageId, genreId }) =>
    // A page shows a genre's tile once.
    Dom.focus(`#${pageId} [data-${TILE_ATTRIBUTES.Genre}="${genreId}"]`, {
      preventScroll: true,
    }).pipe(
      Effect.catch(() => Dom.focus(`#${pageId}`, { preventScroll: true })),
      Effect.ignore,
      Effect.as(Message.CompletedFocusGenreTile()),
    ),
});

/** Focus goes to a station's tile, as it goes to an album's: back from the station, without scrolling. */
export const FocusStationTile = Command.define("FocusStationTile", {
  args: { pageId: Schema.String, stationId: StationId },
  messages: [Message.CompletedFocusStationTile],
  execute: ({ pageId, stationId }) =>
    // A page shelves a station once.
    Dom.focus(`#${pageId} [data-${TILE_ATTRIBUTES.Station}="${stationId}"]`, {
      preventScroll: true,
    }).pipe(
      Effect.catch(() => Dom.focus(`#${pageId}`, { preventScroll: true })),
      Effect.ignore,
      Effect.as(Message.CompletedFocusStationTile()),
    ),
});

/**
 * Focus goes to the navigation when its circle was pressed: the circle is
 * gone, and the item for where the listener is stands in its place. On a
 * page that is no section, the first item does.
 */
export const FocusNavigation = Command.define("FocusNavigation", {
  messages: [Message.CompletedFocusNavigation],
  execute: Dom.focus(`#${NAVIGATION_ID} a[aria-current]`, { preventScroll: true }).pipe(
    Effect.catch(() => Dom.focus(`#${NAVIGATION_ID} a`, { preventScroll: true })),
    Effect.ignore,
    Effect.as(Message.CompletedFocusNavigation()),
  ),
});

/**
 * How far down the page gone back to stands, once it is drawn: it is the
 * document that keeps a page scrolled as the listener left it, and the
 * navigation has to stand as it stood beside it.
 */
// NOTE: after the paint, so that the page is the one on screen and the focus
// given back to a row on it has brought that row into view.
export const MeasureReturnedPage = Command.define("MeasureReturnedPage", {
  args: { pageId: Schema.String },
  messages: [Message.MeasuredReturnedPage],
  execute: ({ pageId }) =>
    Effect.gen(function* () {
      yield* Render.afterPaint;
      return yield* Effect.sync(() => {
        const page = document.getElementById(pageId);
        if (page === null) {
          return Message.MeasuredReturnedPage({ top: 0 });
        }
        const furthest = Math.max(0, page.scrollHeight - page.clientHeight);
        return Message.MeasuredReturnedPage({
          top: Math.min(furthest, Math.max(0, page.scrollTop)),
        });
      });
    }),
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

/** Marks the colour a `theme-color` carries for the page's own ground. */
const CANVAS_ATTRIBUTE = "data-canvas";

/**
 * Give the bar a phone draws over the installed app the ground of the app's
 * pages. The document says the bar's colour (`theme-color` in index.html),
 * one for each colour scheme, and opens with the ground of the mark it opens
 * on, which is another tone than a page's. Each also carries the page's
 * ground, and takes it here, once: when the mark gives way to the first
 * page. The colours stay in the document, beside the mark's own.
 */
export const PaintSystemBar = Command.define("PaintSystemBar", {
  messages: [Message.CompletedPaintSystemBar],
  execute: Effect.sync(() => {
    document.querySelectorAll(`meta[name="theme-color"][${CANVAS_ATTRIBUTE}]`).forEach((colour) => {
      colour.setAttribute("content", colour.getAttribute(CANVAS_ATTRIBUTE) ?? "");
    });
  }).pipe(Effect.ignore, Effect.as(Message.CompletedPaintSystemBar())),
});

/**
 * Bring the screen back to its top, and Search with it. A phone moves the
 * whole page up to keep a field that is being typed in clear of its
 * keyboard: with Search's field in the middle of the screen the page is
 * moved, and when the field then goes up to the page's head it goes off the
 * top of what is seen. The screen is brought back as the field travels, so
 * the two are one movement, and at once for a listener who asked for less
 * motion.
 */
export const ShowSearchFromTop = Command.define("ShowSearchFromTop", {
  messages: [Message.CompletedShowSearchFromTop],
  execute: Effect.sync(() => {
    const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    window.scrollTo({ top: 0, left: 0, behavior });
    document.getElementById(PAGE_IDS.Search)?.scrollTo({ top: 0, behavior });
  }).pipe(Effect.ignore, Effect.as(Message.CompletedShowSearchFromTop())),
});

/**
 * Take the focus from Search's field, so a phone puts its keyboard away and
 * what was found is seen whole.
 */
export const LetGoOfSearchField = Command.define("LetGoOfSearchField", {
  messages: [Message.CompletedLetGoOfSearchField],
  execute: Effect.sync(() => document.getElementById(SEARCH_FIELD_ID)?.blur()).pipe(
    Effect.ignore,
    Effect.as(Message.CompletedLetGoOfSearchField()),
  ),
});

/** How far in from its edges a row keeps what it snaps to: the page's own margin. */
const insetOf = (value: string): number => {
  const inset = Number.parseFloat(value);
  return Number.isNaN(inset) ? 0 : inset;
};

/**
 * Turn a row that goes on sideways a screenful, as one of its arrows asks:
 * the row is scrolled to where `turnedFrom` says, a piece at its leading
 * edge, and at once for a listener who asked for less motion. A row with no
 * more that way, or one that has left the document, stays as it is.
 */
export const TurnRow = Command.define("TurnRow", {
  args: { rowId: Schema.String, way: TurnWay },
  messages: [Message.CompletedTurnRow],
  execute: ({ rowId, way }) =>
    Effect.sync(() => {
      const row = document.getElementById(rowId);
      if (row === null) {
        return;
      }
      const style = getComputedStyle(row);
      const lead = insetOf(style.scrollPaddingInlineStart);
      const edge = row.getBoundingClientRect().left - row.scrollLeft;
      const pieces = Array.map(Array.fromIterable(row.children), (piece): Span => {
        const box = piece.getBoundingClientRect();
        return { from: box.left - edge, to: box.right - edge };
      });
      const seen: Span = {
        from: row.scrollLeft + lead,
        to: row.scrollLeft + row.clientWidth - insetOf(style.scrollPaddingInlineEnd),
      };
      const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

      Option.match(turnedFrom(way, pieces, seen), {
        onNone: () => undefined,
        onSome: (from) => row.scrollTo({ left: from - lead, behavior }),
      });
    }).pipe(Effect.ignore, Effect.as(Message.CompletedTurnRow())),
});

/** A query to the catalog, still missing the id its reply will be recognised by. */
export type Request = (requestId: string) => Command.Command<Message, never, CatalogClient>;

type CatalogMessage = typeof Catalog.Message.Type;

const toMessage = (message: CatalogMessage): Message => Message.GotCatalogMessage({ message });

/**
 * How long a reply is held back for the pictures its page opens with. A
 * picture that takes longer is drawn when it comes, as any other picture.
 */
export const PICTURE_WAIT = Duration.millis(300);

/** How the wait for a page's first pictures ended: with all of them ready, or with its time up. */
type PicturesWait = "Ready" | "RanOut";

/** One picture, loaded and decoded, so that drawing it is only painting it. */
const decodePicture = (url: string): Promise<void> => {
  const image = new Image();
  image.src = url;
  // NOTE: a picture that fails to load is no reason to hold the page: it
  // will be drawn as a failed picture is, wherever the page puts it.
  return typeof image.decode === "function"
    ? image.decode().catch(() => undefined)
    : Promise.resolve();
};

/**
 * The pictures are ready, or the wait is over. The page then takes the
 * screen with them already painted: a picture newly put in the document is
 * otherwise drawn as an empty box for a frame or more while it decodes, even
 * when its bytes are already here.
 */
// NOTE: the wait is measured (`asWait`), with how it ended: `PICTURE_WAIT`
// is a guess at what a phone needs, and how often it runs out is what says
// whether the guess is a good one.
export const preparePictures = (urls: ReadonlyArray<string>): Effect.Effect<void> =>
  urls.length === 0
    ? Effect.void
    : pipe(
        Effect.promise(() => Promise.all(urls.map(decodePicture))),
        Effect.as<PicturesWait>("Ready"),
        Effect.timeoutOrElse({
          duration: PICTURE_WAIT,
          orElse: () => Effect.succeed<PicturesWait>("RanOut"),
        }),
        Effect.flatMap((ended) => Effect.annotateCurrentSpan({ pictures: urls.length, ended })),
        asWait("pictures"),
      );

/**
 * A query gives up after `REPLY_TIMEOUT` and reports the failure it would
 * report for a lost reply, so nothing waits forever on a server that hangs.
 * The request itself is interrupted when the time runs out. A reply that
 * comes in time is held back until the pictures its page opens with are
 * ready, for `PICTURE_WAIT` at most (`firstPicturesOf`): until then the
 * Model still says the page is on its way, and the screen is held as it is.
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
    // The two waits a page is held for are measured apart, so that a page
    // slow to open says which it was: the catalog, or the pictures.
    Command.mapEffect(
      flow(
        Effect.tap((message) => Effect.annotateCurrentSpan("reply", message._tag)),
        asWait("catalog"),
      ),
    ),
    Command.mapEffect(Effect.tap((message) => preparePictures(firstPicturesOf(message)))),
    Command.mapMessage(toMessage),
  );

/** The query for a section's list, with the failure it settles as when nobody answers. */
type Asked = readonly [Command.Command<CatalogMessage, never, CatalogClient>, CatalogMessage];

const sectionQueries: Readonly<Record<ListedSection, (requestId: string) => Asked>> = {
  Home: (requestId) => [Catalog.HomeFeed({ input: {}, requestId }), unanswered.HomeFeed(requestId)],
  New: (requestId) => [Catalog.NewMusic({ input: {}, requestId }), unanswered.NewMusic(requestId)],
  Genres: (requestId) => [
    Catalog.GenreList({ input: {}, requestId }),
    unanswered.GenreList(requestId),
  ],
  Radio: (requestId) => [
    Catalog.StationList({ input: {}, requestId }),
    unanswered.StationList(requestId),
  ],
};

const askSection =
  (section: ListedSection): Request =>
  (requestId) =>
    asking(...sectionQueries[section](requestId));

export const askHomeFeed: Request = askSection("Home");

export const askNewMusic: Request = askSection("New");

/**
 * Whether the listener has asked their browser to use as little data as it
 * can. Only some browsers say, and one that does not is taken to have no
 * such wish.
 */
const isSavingData = (): boolean => {
  if (typeof navigator === "undefined" || !("connection" in navigator)) {
    return false;
  }
  const connection: unknown = navigator.connection;
  return (
    typeof connection === "object" &&
    connection !== null &&
    "saveData" in connection &&
    connection.saveData === true
  );
};

/**
 * A section asked for ahead of the listener, so that it is held by the time
 * they choose it. It is the section's own query, and its reply is held back
 * for the pictures the section opens with as any reply is, which is what
 * brings those pictures ahead of the listener too.
 *
 * It is not sent for a listener who has asked their browser to save data:
 * nothing they did asked for it. It then settles as a query nobody answered,
 * which, asked ahead, is said nowhere.
 */
export const askSectionAhead =
  (section: ListedSection): Request =>
  (requestId) => {
    const [query, unanswered] = sectionQueries[section](requestId);
    return asking(
      pipe(
        query,
        Command.mapEffect((sent) =>
          Effect.suspend(() => (isSavingData() ? Effect.succeed(unanswered) : sent)),
        ),
      ),
      unanswered,
    );
  };

export const askCatalogSearch =
  (term: string): Request =>
  (requestId) =>
    asking(
      Catalog.CatalogSearch({ input: { term }, requestId }),
      unanswered.CatalogSearch(requestId),
    );

export const askTrackDetail =
  (trackId: TrackId): Request =>
  (requestId) =>
    asking(
      Catalog.TrackDetail({ input: { trackId }, requestId }),
      unanswered.TrackDetail(requestId),
    );

export const askAlbumDetail =
  (albumId: AlbumId): Request =>
  (requestId) =>
    asking(
      Catalog.AlbumDetail({ input: { albumId }, requestId }),
      unanswered.AlbumDetail(requestId),
    );

export const askArtistDetail =
  (artistId: ArtistId): Request =>
  (requestId) =>
    asking(
      Catalog.ArtistDetail({ input: { artistId }, requestId }),
      unanswered.ArtistDetail(requestId),
    );

export const askPlaylistDetail =
  (playlistId: PlaylistId): Request =>
  (requestId) =>
    asking(
      Catalog.PlaylistDetail({ input: { playlistId }, requestId }),
      unanswered.PlaylistDetail(requestId),
    );

export const askGenreList: Request = askSection("Genres");

export const askGenreDetail =
  (genreId: GenreId): Request =>
  (requestId) =>
    asking(
      Catalog.GenreDetail({ input: { genreId }, requestId }),
      unanswered.GenreDetail(requestId),
    );

export const askStationList: Request = askSection("Radio");

export const askStationDetail =
  (stationId: StationId): Request =>
  (requestId) =>
    asking(
      Catalog.StationDetail({ input: { stationId }, requestId }),
      unanswered.StationDetail(requestId),
    );
