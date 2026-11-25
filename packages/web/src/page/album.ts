import type { AlbumId } from "@bafle/domain/Catalog/Album";
import type { Album } from "@bafle/domain/Catalog/FullAlbum";
import { clsx } from "clsx";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";
import { Message } from "../message.ts";
import type { AlbumData } from "../model.ts";
import { albumCoverView, albumHeadFlightAttributes, artworkView } from "../view/artwork.ts";
import {
  PAGE_IDS,
  type Presence,
  SECTION_HEADING_CLASS,
  pageAttributes,
  pageTitleIdOf,
  pageTitleView,
} from "../view/layout.ts";
import { pageDataView } from "../view/pageData.ts";
import { BLOCK_CLASS, trackListPlaceholderView } from "../view/placeholder.ts";
import {
  explicitMarkerView,
  trackListView,
  type TrackListContext,
} from "../view/trackList.ts";
import { wayBackControlView } from "../view/wayBack.ts";

import "./album.css";

// VIEW

const PAGE_ID = PAGE_IDS.Album;
const TITLE = "Album";
const SONGS = "Songs";
const NOT_AVAILABLE = "This album is not available";

/** What an album's page is called: the album's title once the catalog has told it. */
export const titleOf = (album: AlbumData): string =>
  Option.match(AsyncData.getData(album), {
    onNone: () => TITLE,
    onSome: Option.match({ onNone: () => NOT_AVAILABLE, onSome: (found) => found.title }),
  });

const placeholderView = (h: HtmlBuilder<Message>): Html =>
  h.div([], [
    h.div([h.Class("album-hero album-placeholder"), h.AriaHidden(true)], [
      h.div([h.Class("album-caption")], [
        h.div([h.Class(clsx(BLOCK_CLASS, "h-12 w-3/4 rounded"))]),
        h.div([h.Class(clsx(BLOCK_CLASS, "mt-3 h-5 w-1/3 rounded"))]),
      ]),
    ]),
    h.section([h.Class("album-songs")], [
      h.h2([h.Class(SECTION_HEADING_CLASS)], [SONGS]),
      trackListPlaceholderView(h),
    ]),
  ]);

const songCount = (album: Album): string =>
  album.tracks.length === 1 ? "1 song" : `${album.tracks.length} songs`;

/** The year an album came out, and how many songs it has: only what the catalog knows. */
const factsView = (album: Album, h: HtmlBuilder<Message>): Html =>
  h.p(
    [h.Class("album-facts")],
    Option.match(Option.fromNullishOr(album.releaseDate), {
      onNone: () => [songCount(album)],
      onSome: (releaseDate) => [
        h.time([h.Datetime(releaseDate)], [releaseDate.slice(0, 4)]),
        ` · ${songCount(album)}`,
      ],
    }),
  );

const headView = (album: Album, presence: Presence, h: HtmlBuilder<Message>): Html =>
  h.header([h.Class("album-hero catalog-art"), ...albumHeadFlightAttributes(album.id, presence, h)], [
    albumCoverView(Option.fromNullishOr(album.cover), h),
    h.div([h.Class("album-caption")], [
      h.h1([h.Id(pageTitleIdOf(PAGE_ID))], [
        album.title,
        album.explicit ? explicitMarkerView(h) : h.empty,
      ]),
      h.p([h.Class("album-artist")], [album.artist.name]),
      factsView(album, h),
    ]),
  ]);

const toolbarView = (album: Album, h: HtmlBuilder<Message>): Html =>
  h.div([h.Class("album-toolbar")], [
    h.div([h.AriaHidden(true), h.Class("album-compact")], [
      artworkView(Option.fromNullishOr(album.cover), "Square", "small", h),
      h.div([h.Class("min-w-0")], [
        h.p([h.Class("album-compact-title truncate")], [album.title]),
        h.p([h.Class("album-compact-artist truncate")], [album.artist.name]),
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
        h.p([h.Class("album-songs text-muted")], ["The catalog lists no songs for this album."]),
      onNonEmpty: (tracks) =>
        h.section([h.Class("album-songs")], [
          // NOTE: there is no control here to play the album. Any row does
          // it: pressed, it plays its song and the songs under it are what
          // comes next (playback rule 1).
          h.h2([h.Id("album-songs"), h.Class(SECTION_HEADING_CLASS)], [SONGS]),
          ...trackListView("album-songs", "Ranked", tracks, { ...context, albumArtistId: album.artist.id }, h),
        ]),
    }),
  ]);

/**
 * The catalog has no such album. That will not change, so there is nothing
 * to try again: the page says so, under its way back.
 */
const notAvailableView = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class("max-w-md")],
    [
      pageTitleView(PAGE_ID, NOT_AVAILABLE, h),
      h.p(
        [h.Class("mt-4 text-muted")],
        ["The catalog no longer has it, or the link to it is wrong."],
      ),
    ],
  );

/**
 * The page's title while there is no album to take it from. Loading, the
 * placeholders stand for it on screen and it is only said; after a failure
 * it heads the message.
 */
const untitledView = (album: AlbumData, h: HtmlBuilder<Message>): Html =>
  AsyncData.matchData(album, {
    onEmpty: () => h.h1([h.Id(pageTitleIdOf(PAGE_ID)), h.Class("sr-only")], [TITLE]),
    onFailure: () => pageTitleView(PAGE_ID, TITLE, h),
    onData: () => h.empty,
  });

/**
 * The root is keyed by the album: another album is another page, which
 * starts at its top with its own pictures. The page is a list, so it is kept
 * behind a page reached from it, as a section is: `context.presence` says
 * whether it is on screen.
 */
export const view = (
  albumId: AlbumId,
  album: AlbumData,
  hasWayBack: boolean,
  context: TrackListContext,
  h: HtmlBuilder<Message>,
): Html => {
  const hasAlbum = Option.isSome(Option.flatten(AsyncData.getData(album)));
  const overlay = hasAlbum || AsyncData.isPending(album);
  return h.keyed("div")(albumId, pageAttributes(PAGE_ID, context.presence, h), [
    h.div([h.Class(clsx("album-return", { "album-overlay": overlay }))], [wayBackControlView(hasWayBack, h)]),
    h.div(
      [h.AriaBusy(AsyncData.isPending(album)), h.Class(clsx({ "album-unavailable": !overlay }))],
      [
        untitledView(album, h),
        pageDataView(
          album,
          TITLE,
          () => placeholderView(h),
          Option.match({
            onNone: () => notAvailableView(h),
            onSome: (found) => foundView(found, context, h),
          }),
          h,
        ),
      ],
    ),
  ]);
};
