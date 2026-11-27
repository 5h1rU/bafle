import type { AlbumId } from "@bafle/domain/Catalog/Album";
import type { Album } from "@bafle/domain/Catalog/FullAlbum";
import { clsx } from "clsx";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";
import { Message } from "../message.ts";
import type { AlbumData } from "../model.ts";
import {
  albumCoverView,
  albumHeadFlightAttributes,
  artworkView,
  VEIL_CLASS,
} from "../view/artwork.ts";
import { PAGE_IDS, type Presence, SECTION_HEADING_CLASS, pageTitleIdOf } from "../view/layout.ts";
import {
  type DetailKind,
  detailPageView,
  detailTitleOf,
  GONE,
  songCount,
} from "../view/page.ts";
import { BLOCK_CLASS } from "../view/placeholder.ts";
import {
  explicitMarkerView,
  type TrackList,
  type TrackListContext,
  trackListPlaceholderView,
  trackListView,
} from "../view/trackList.ts";

// VIEW

const KIND: DetailKind = {
  pageId: PAGE_IDS.Album,
  name: "Album",
  notAvailable: "This album is not available",
  gone: GONE,
};

const SONGS = "Songs";

/**
 * The album's songs, in the album's order. They have one cover between them,
 * the one at the page's head, so a row leads with its number.
 */
const SONGS_LIST: TrackList = {
  labelledBy: "album-songs",
  order: "Ranked",
  spread: "Single",
  lead: "Number",
};

/** What an album's page is called: the album's title once the catalog has told it. */
export const titleOf = (album: AlbumData): string =>
  detailTitleOf(KIND, album, (found) => found.title);

/**
 * The head: the cover from edge to edge, with the album's words over its
 * foot. `album-hero` is what the style sheet follows the scroll by and draws
 * back to the bar (album.css).
 */
// NOTE: over every scroll timeline the head is under the bar from the start,
// and the bar is clear until the head has drawn back to it. Without them the
// cover slides over the bar and uncovers it as it leaves.
const HERO_CLASS =
  "album-hero relative isolate grid min-h-[clamp(19rem,103.5vw,35rem)] items-end overflow-hidden md:min-h-[clamp(20rem,46svh,34rem)] not-scroll-timelines:z-3";

/**
 * What the head stands on. Found, it is the night the veil ends in, in both
 * themes: the cover draws back over it as the page is scrolled, and the white
 * words stand on it.
 */
const HERO_GROUNDS = {
  Found: "bg-night text-on-night",
  Waiting: "bg-panel text-on-night",
} as const;

// NOTE: the words stand over the foot of the cover, clear of the bar the
// head draws back to. `album-caption` is what the style sheet moves as the
// page is scrolled (album.css).
const CAPTION_CLASS =
  "album-caption z-1 px-album-gutter pt-[calc(var(--spacing-album-bar)+1.5rem)] pb-6 wrap-anywhere md:pb-8";

const HEAD_TITLE_CLASS =
  "max-w-[26ch] text-[clamp(2.65rem,14.4vw,4.75rem)]/[1.02] font-bold tracking-[-0.059em] text-balance";

/**
 * The bar the head draws back to: as high as a bar of the system's, over the
 * top of the page, with a ground and a line of its own (`before:`) that the
 * style sheet brings in when the head has arrived.
 */
// NOTE: no inset for the top of the screen is added. The page is drawn under
// the screen's top already, in a browser and installed alike, and a browser
// that draws its own bar over the page can report that inset to a page that
// is not under it: the bar was then twice its height.
const BAR_CLASS =
  "album-toolbar pointer-events-none sticky top-0 z-3 -mb-album-bar flex h-album-bar items-center gap-3 px-album-gutter before:absolute before:inset-0 before:-z-1 before:border-b before:border-line before:bg-panel not-scroll-timelines:z-2";

/** What the bar says: the cover as a thumbnail that leaves it a little room above and below, at its near end, and the album's name. */
const BAR_WORDS_CLASS = "album-compact flex min-w-0 items-center gap-2.5 *:first:w-8 *:first:flex-none";

/**
 * The songs' place on the page.
 */
// NOTE: every album's songs are at least as tall as what the screen has left
// under the bar and over the room at the page's foot, however few they are.
// The head draws back to the bar by the scroll, and a page too short to be
// scrolled that far would be left with its head part of the way there for
// good: its cover on its way to the bar, and the bar's title half come.
//
// That is as far as a short album scrolls, and no further: its first song
// comes to rest right under the bar. The room at the page's foot
// (`--page-foot`, view/layout.ts) is the page's own and comes after the
// songs, so it is taken off here. Left in, an album was scrolled that much
// past its head's end: a short one had a screen's worth of nothing under its
// last song, and one of a single song went up under the bar and out of sight.
//
// One pixel more than that: the head's height is a share of the screen's
// width and seldom a whole number of pixels, a page scrolls by whole ones,
// and the bar takes over only at the very end of the way
// (`album-bar-takes-over`). A page that fell a part of a pixel short of it
// never showed its bar.
const SONGS_CLASS =
  "mx-auto min-h-[calc(100dvh-var(--spacing-album-bar)-var(--page-foot,0px)+1px)] max-w-5xl px-album-gutter pt-2";

/** The list's title, as high as the bar the head draws back to: the two meet as the page is scrolled. */
const SONGS_HEADING_CLASS = clsx(SECTION_HEADING_CLASS, "flex min-h-12 items-center");

const placeholderView = (h: HtmlBuilder<Message>): Html =>
  h.div([], [
    h.div([h.Class(clsx(HERO_CLASS, HERO_GROUNDS.Waiting)), h.AriaHidden(true)], [
      h.div([h.Class(CAPTION_CLASS)], [
        h.div([h.Class(clsx(BLOCK_CLASS, "h-12 w-3/4 rounded"))]),
        h.div([h.Class(clsx(BLOCK_CLASS, "mt-3 h-5 w-1/3 rounded"))]),
      ]),
    ]),
    h.section([h.Class(SONGS_CLASS)], [
      h.h2([h.Class(SONGS_HEADING_CLASS)], [SONGS]),
      trackListPlaceholderView(SONGS_LIST.spread, h),
    ]),
  ]);

/** The year an album came out, and how many songs it has: only what the catalog knows. */
const factsView = (album: Album, h: HtmlBuilder<Message>): Html =>
  h.p(
    [h.Class("mt-[0.3rem] text-sm/[1.5] text-on-night/87")],
    Option.match(Option.fromNullishOr(album.releaseDate), {
      onNone: () => [songCount(album.tracks.length)],
      onSome: (releaseDate) => [
        h.time([h.Datetime(releaseDate)], [releaseDate.slice(0, 4)]),
        ` · ${songCount(album.tracks.length)}`,
      ],
    }),
  );

const headView = (album: Album, presence: Presence, h: HtmlBuilder<Message>): Html =>
  h.header(
    [
      h.Class(clsx(HERO_CLASS, HERO_GROUNDS.Found, "catalog-art", VEIL_CLASS)),
      ...albumHeadFlightAttributes(album.id, presence, h),
    ],
    [
    albumCoverView(Option.fromNullishOr(album.cover), h),
    h.div([h.Class(CAPTION_CLASS)], [
      h.h1([h.Id(pageTitleIdOf(KIND.pageId)), h.Class(HEAD_TITLE_CLASS)], [
        album.title,
        album.explicit ? explicitMarkerView(h) : h.empty,
      ]),
      h.p(
        [h.Class("mt-[0.2rem] text-[clamp(1.25rem,5.7vw,1.65rem)]/[1.25] font-demi tracking-tight")],
        [album.artist.name],
      ),
      factsView(album, h),
    ]),
    ],
  );

const toolbarView = (album: Album, h: HtmlBuilder<Message>): Html =>
  h.div([h.Class(BAR_CLASS)], [
    h.div([h.AriaHidden(true), h.Class(BAR_WORDS_CLASS)], [
      artworkView(Option.fromNullishOr(album.cover), "Square", "small", h),
      h.div([h.Class("min-w-0")], [
        h.p([h.Class("truncate text-15/[1.2] font-[650] tracking-[-0.015em]")], [album.title]),
        h.p([h.Class("truncate text-xs/[1.25] text-muted")], [album.artist.name]),
      ]),
    ]),
  ]);

const foundView = (
  album: Album,
  context: TrackListContext,
  h: HtmlBuilder<Message>,
): Html =>
  h.div([h.Class("album-detail")], [
    toolbarView(album, h),
    headView(album, context.presence, h),
    Array.match(album.tracks, {
      onEmpty: () =>
        h.p([h.Class(clsx(SONGS_CLASS, "text-muted"))], ["The catalog lists no songs for this album."]),
      onNonEmpty: (tracks) =>
        h.section([h.Class(SONGS_CLASS)], [
          // NOTE: there is no control here to play the album. Any row does
          // it: pressed, it plays its song and the songs under it are what
          // comes next (playback rule 1).
          h.h2([h.Id(SONGS_LIST.labelledBy), h.Class(SONGS_HEADING_CLASS)], [SONGS]),
          ...trackListView(SONGS_LIST, tracks, { ...context, albumArtistId: album.artist.id }, h),
        ]),
    }),
  ]);

/**
 * The page is a list, so it is kept behind a page reached from it, as a
 * section is: `context.presence` says whether it is on screen. Its head
 * reaches the screen's edges, so the page lays its own content out; with no
 * album there is no head, and what the page says instead starts where any
 * page's title does.
 */
export const view = (
  albumId: AlbumId,
  album: AlbumData,
  context: TrackListContext,
  h: HtmlBuilder<Message>,
): Html => {
  const hasAlbum = Option.isSome(Option.flatten(AsyncData.getData(album)));
  const hasHead = hasAlbum || AsyncData.isPending(album);

  return detailPageView(
    {
      kind: KIND,
      key: albumId,
      presence: context.presence,
      data: album,
      edges: "ToEdge",
      bodyClass: hasHead ? "" : "px-album-gutter pt-8 pb-4 md:pt-10",
    },
    () => placeholderView(h),
    (found) => foundView(found, context, h),
    h,
  );
};
