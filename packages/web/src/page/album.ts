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

// NOTE: the words stand over the foot of the cover, clear of the bar the
// head draws back to. `album-caption` is what the style sheet moves as the
// page is scrolled (album.css).
const CAPTION_CLASS =
  "album-caption z-1 px-(--album-gutter) pt-[calc(var(--album-bar-height)+1.5rem)] pb-6 wrap-anywhere md:pb-8";

const HEAD_TITLE_CLASS =
  "max-w-[26ch] text-[clamp(2.65rem,14.4vw,4.75rem)]/[1.02] font-bold tracking-[-0.059em] text-balance";

/** The songs' place on the page. How tall it is at the least is the style sheet's (`album-songs` in album.css). */
const SONGS_CLASS = "album-songs mx-auto max-w-5xl px-(--album-gutter) pt-2";

/** The list's title, as high as the bar the head draws back to: the two meet as the page is scrolled. */
const SONGS_HEADING_CLASS = clsx(SECTION_HEADING_CLASS, "flex min-h-12 items-center");

const placeholderView = (h: HtmlBuilder<Message>): Html =>
  h.div([], [
    h.div([h.Class("album-hero album-placeholder"), h.AriaHidden(true)], [
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
  h.header([h.Class(clsx("album-hero catalog-art", VEIL_CLASS)), ...albumHeadFlightAttributes(album.id, presence, h)], [
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
  ]);

const toolbarView = (album: Album, h: HtmlBuilder<Message>): Html =>
  h.div([h.Class("album-toolbar")], [
    h.div([h.AriaHidden(true), h.Class("album-compact flex min-w-0 items-center gap-2.5")], [
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
      bodyClass: hasHead ? "" : "px-(--album-gutter) pt-8 pb-4 md:pt-10",
    },
    () => placeholderView(h),
    (found) => foundView(found, context, h),
    h,
  );
};
