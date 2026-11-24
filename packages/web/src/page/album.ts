import type { AlbumId } from "@bafle/domain/Catalog/Album";
import type { Album } from "@bafle/domain/Catalog/FullAlbum";
import { clsx } from "clsx";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "../message.ts";
import type { AlbumData } from "../model.ts";
import { albumCoverView } from "../view/artwork.ts";
import {
  PAGE_IDS,
  PAGE_SECTIONS_CLASS,
  PAGE_TITLE_CLASS,
  QUIET_LINE_CLASS,
  SECTION_HEADING_CLASS,
  pageAttributes,
  pageTitleIdOf,
  pageTitleView,
} from "../view/layout.ts";
import { pageDataView } from "../view/pageData.ts";
import { BLOCK_CLASS, trackListPlaceholderView } from "../view/placeholder.ts";
import {
  explicitMarkerView,
  maybeTrackSectionView,
  type TrackListContext,
} from "../view/trackList.ts";
import { wayBackView } from "../view/wayBack.ts";

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

/** The cover beside the album's name, at the head of the page. */
const HEAD_CLASS = "flex max-w-3xl items-end gap-5 md:gap-7";

const COVER_CLASS = "w-28 shrink-0 sm:w-40 md:w-48";

/**
 * The page before the catalog has answered: a block for the cover beside
 * lines for the title, the artist and the facts, then rows under the list's
 * title, which never depends on the catalog.
 */
const placeholderView = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [],
    [
      h.div(
        [h.AriaHidden(true), h.Class(HEAD_CLASS)],
        [
          h.div([h.Class(clsx(BLOCK_CLASS, COVER_CLASS, "aspect-square rounded-xl"))]),
          h.div(
            [h.Class("min-w-0 flex-1")],
            [
              h.div([h.Class(clsx(BLOCK_CLASS, "h-9 w-4/5 rounded"))]),
              h.div([h.Class(clsx(BLOCK_CLASS, "mt-3 h-6 w-2/5 rounded"))]),
              h.div([h.Class(clsx(BLOCK_CLASS, "mt-3 h-4 w-32 rounded"))]),
            ],
          ),
        ],
      ),
      h.div(
        [h.Class(PAGE_SECTIONS_CLASS)],
        [
          h.section(
            [h.Class("max-w-3xl")],
            [h.h2([h.Class(SECTION_HEADING_CLASS)], [SONGS]), trackListPlaceholderView(h)],
          ),
        ],
      ),
    ],
  );

const songCount = (album: Album): string =>
  album.tracks.length === 1 ? "1 song" : `${album.tracks.length} songs`;

/** The year an album came out, and how many songs it has: only what the catalog knows. */
const factsView = (album: Album, h: HtmlBuilder<Message>): Html =>
  h.p(
    [h.Class("mt-2 text-sm text-muted tabular-nums")],
    Option.match(Option.fromNullishOr(album.releaseDate), {
      onNone: () => [songCount(album)],
      onSome: (releaseDate) => [
        h.time([h.Datetime(releaseDate)], [releaseDate.slice(0, 4)]),
        ` · ${songCount(album)}`,
      ],
    }),
  );

const headView = (album: Album, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class(HEAD_CLASS)],
    [
      h.div([h.Class(COVER_CLASS)], [albumCoverView(album.id, Option.fromNullishOr(album.cover), h)]),
      h.div(
        [h.Class("min-w-0")],
        [
          h.h1(
            [h.Id(pageTitleIdOf(PAGE_ID)), h.Class(PAGE_TITLE_CLASS)],
            [album.title, album.explicit ? explicitMarkerView(h) : h.empty],
          ),
          h.p([h.Class("mt-1 text-lg text-muted")], [album.artist.name]),
          factsView(album, h),
        ],
      ),
    ],
  );

/**
 * The album, and its songs in the album's order, numbered. Each row plays,
 * and the album is then the queue.
 */
const foundView = (album: Album, context: TrackListContext, h: HtmlBuilder<Message>): Html =>
  h.div(
    [],
    [
      headView(album, h),
      Option.match(
        maybeTrackSectionView("album-songs", SONGS, "Ranked", album.tracks, context, h),
        {
          onNone: () =>
            h.p([h.Class(QUIET_LINE_CLASS)], ["The catalog lists no songs for this album."]),
          onSome: (songs) => h.div([h.Class(PAGE_SECTIONS_CLASS)], [songs]),
        },
      ),
    ],
  );

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
): Html =>
  h.keyed("div")(albumId, pageAttributes(PAGE_ID, context.presence, h), [
    wayBackView(hasWayBack, h),
    h.div(
      [h.AriaBusy(AsyncData.isPending(album)), h.Class("mt-4")],
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
