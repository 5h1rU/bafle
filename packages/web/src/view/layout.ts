import { clsx } from "clsx";
import type { Attribute, Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "../message.ts";
import type { AppRoute } from "../route.ts";

// VIEW

export const PAGE_SECTIONS_CLASS = "mt-8 flex flex-col gap-10";

export const SECTION_HEADING_CLASS = "text-xl font-semibold tracking-tight";

export const QUIET_LINE_CLASS = "mt-8 text-muted";

/**
 * The id of each page. Several pages are in the document at once, the one on
 * screen and those kept behind it, so each has an id of its own.
 */
export const PAGE_IDS: Readonly<Record<AppRoute["_tag"], string>> = {
  Home: "home-page",
  New: "new-page",
  Genres: "genres-page",
  Radio: "radio-page",
  Search: "search-page",
  Track: "track-page",
  Album: "album-page",
  Artist: "artist-page",
  Playlist: "playlist-page",
  Genre: "genre-page",
  Station: "station-page",
  NotFound: "not-found-page",
};

/** The pages by their ids: a scroll is a page's when it comes from one of these. */
export const isPageId = (id: string): boolean => Object.values(PAGE_IDS).includes(id);

/** The navigation's own id: the focus goes to it when it is brought out again. */
export const NAVIGATION_ID = "main-navigation";

export const pageIdOf = (route: AppRoute): string => PAGE_IDS[route._tag];

export const pageTitleIdOf = (pageId: string): string => `${pageId}-title`;

/**
 * The data attribute that marks a row with its track, link or not, so the
 * focus can be given back to it.
 */
export const TRACK_ROW_ATTRIBUTE = "track-row";

/** The kinds of thing that have a tile, and a page of their own that the tile leads to. */
export type TileKind = "Album" | "Artist" | "Playlist" | "Genre" | "Station";

/**
 * The data attribute that marks a tile with what it shows, so the focus can
 * be given back to it.
 */
// NOTE: a kind of tile has an attribute of its own because the catalog's ids
// are only told apart within a kind: Search shelves artists, albums and
// playlists on one page, and an artist can have the id an album has.
export const TILE_ATTRIBUTES: Readonly<Record<TileKind, string>> = {
  Album: "album-tile",
  Artist: "artist-tile",
  Playlist: "playlist-tile",
  Genre: "genre-tile",
  Station: "station-tile",
};

/**
 * Whether a page is the one on screen, or kept behind it. A kept page stays
 * in the document, laid out and scrolled as the listener left it, so that
 * coming back to it rebuilds nothing: it is only hidden. `Uncovered` is a
 * kept page that is seen all the same: the one behind the expanded player,
 * while the player's sheet is on its way off the screen. It is drawn as it
 * was left, and is not yet a page to act on.
 */
export type Presence = "OnScreen" | "Uncovered" | "Kept";

/**
 * What every page's root element carries. The root is the scrolling box, so
 * it takes keyboard focus and is named by the page's title: arrow keys and
 * Space scroll it. A kept page is `inert`: out of the accessibility tree and
 * the tab order, and unable to hold focus. Once the player is there, every
 * page ends with room for its island, for scrolling and for the focus alike:
 * the last row is never under it. On a narrow screen the navigation floats
 * over the foot of the page too, so every page ends with room for it as well.
 */
/**
 * Where a page's content starts. Most pages keep it in from the screen's
 * edges and down from its top; a page whose head is a picture from edge to
 * edge (an album's) lays its own content out, to the edge.
 */
export type PageEdges = "Margins" | "ToEdge";

const PAGE_EDGES_CLASS: Readonly<Record<PageEdges, string>> = {
  Margins: "px-5 pt-8 md:px-10 md:pt-10",
  // NOTE: a page whose head reaches the edges has a bar over its top once it
  // is scrolled, and what is scrolled into view comes to rest under that bar.
  ToEdge: "scroll-pt-album-bar",
};

/**
 * What a page says of its own box, beyond what every page's is: where its
 * content starts, and the name its own width is asked by, for a page whose
 * layout goes by that width and not the screen's (Search's: `search-wide`).
 */
export type PageLook = Readonly<{ edges?: PageEdges; container?: "search" }>;

export const pageAttributes = (
  pageId: string,
  presence: Presence,
  h: HtmlBuilder<Message>,
  { edges = "Margins", container }: PageLook = {},
): ReadonlyArray<Attribute<Message>> => [
  h.Id(pageId),
  h.Role("region"),
  h.AriaLabelledBy(pageTitleIdOf(pageId)),
  h.Tabindex(0),
  h.Inert(presence !== "OnScreen"),
  h.Class(
    clsx(
      // NOTE: a page scrolls up and down only. A tile's record comes out past
      // the page's edge at the end of a row, and must not make the page one
      // that can be pushed sideways.
      //
      // The room at the page's foot, for the navigation and the island over
      // it, has a name (`--page-foot`): a page that has to know how much of
      // its box is left for what it shows reads it (an album's songs, page/album.ts).
      "relative h-full overflow-x-hidden overflow-y-auto [--page-foot:calc(6rem+env(safe-area-inset-bottom))] pb-[var(--page-foot)] scroll-pb-24 group-data-player/shell:scroll-pb-40 group-data-player/shell:[--page-foot:calc(10rem+env(safe-area-inset-bottom))] md:scroll-pb-0 md:[--page-foot:3rem] md:group-data-player/shell:scroll-pb-28 md:group-data-player/shell:[--page-foot:7rem] focus-ring-inset",
      PAGE_EDGES_CLASS[edges],
      { "@container/search": container === "search" },
    ),
  ),
];

/**
 * The scroll margin is at least the page's top padding, so that scrolling a
 * title into view is scrolling its page to the top.
 */
export const PAGE_TITLE_CLASS = "scroll-mt-10 text-3xl font-bold tracking-tight";

export const pageTitleView = (pageId: string, title: string, h: HtmlBuilder<Message>): Html =>
  h.h1([h.Id(pageTitleIdOf(pageId)), h.Class(PAGE_TITLE_CLASS)], [title]);

/**
 * The place a page takes in the shell, whether or not the page is there.
 * Every place is always in the document, in the same order, so a page is
 * patched where it stands and never rebuilt because another came or went.
 * The places lie on top of each other; only the one on screen is drawn.
 */
export const pagePlaceView = (
  presence: Presence,
  page: ReadonlyArray<Html>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div([h.Class(clsx("absolute inset-0", { invisible: presence === "Kept" }))], page);
