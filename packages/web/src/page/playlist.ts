import type { Playlist } from "@bafle/domain/Catalog/FullPlaylist";
import type { PlaylistId } from "@bafle/domain/Catalog/Playlist";
import { clsx } from "clsx";
import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "../message.ts";
import type { PlaylistData } from "../model.ts";
import { playlistPictureView } from "../view/artwork.ts";
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
import { maybeTrackSectionView, type TrackListContext } from "../view/trackList.ts";
import { wayBackView } from "../view/wayBack.ts";

// VIEW

const PAGE_ID = PAGE_IDS.Playlist;
const TITLE = "Playlist";
const SONGS = "Songs";
const NOT_AVAILABLE = "This playlist is not available";

/** What a playlist's page is called: the playlist's title once the catalog has told it. */
export const titleOf = (playlist: PlaylistData): string =>
  Option.match(AsyncData.getData(playlist), {
    onNone: () => TITLE,
    onSome: Option.match({ onNone: () => NOT_AVAILABLE, onSome: (found) => found.title }),
  });

/** The picture beside the playlist's name, at the head of the page. */
const HEAD_CLASS = "flex max-w-3xl items-end gap-5 md:gap-7";

const PICTURE_CLASS = "w-28 shrink-0 sm:w-40 md:w-48";

/**
 * The page before the catalog has answered: a block for the picture beside
 * lines for the title, the curator and the song count, then rows under the
 * list's title, which never depends on the catalog.
 */
const placeholderView = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [],
    [
      h.div(
        [h.AriaHidden(true), h.Class(HEAD_CLASS)],
        [
          h.div([h.Class(clsx(BLOCK_CLASS, PICTURE_CLASS, "aspect-square rounded-xl"))]),
          h.div(
            [h.Class("min-w-0 flex-1")],
            [
              h.div([h.Class(clsx(BLOCK_CLASS, "h-9 w-4/5 rounded"))]),
              h.div([h.Class(clsx(BLOCK_CLASS, "mt-3 h-6 w-2/5 rounded"))]),
              h.div([h.Class(clsx(BLOCK_CLASS, "mt-3 h-4 w-20 rounded"))]),
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

const songCount = (playlist: Playlist): string =>
  playlist.tracks.length === 1 ? "1 song" : `${playlist.tracks.length} songs`;

const headView = (playlist: Playlist, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class(HEAD_CLASS)],
    [
      h.div(
        [h.Class(PICTURE_CLASS)],
        [playlistPictureView(playlist.id, Option.fromNullishOr(playlist.picture), h)],
      ),
      h.div(
        [h.Class("min-w-0")],
        [
          h.h1([h.Id(pageTitleIdOf(PAGE_ID)), h.Class(PAGE_TITLE_CLASS)], [playlist.title]),
          h.p([h.Class("mt-1 text-lg text-muted")], [playlist.curator]),
          h.p([h.Class("mt-2 text-sm text-muted tabular-nums")], [songCount(playlist)]),
        ],
      ),
    ],
  );

/**
 * The playlist, and its songs in the playlist's order. Each row plays, and
 * the playlist is then the queue.
 */
const foundView = (playlist: Playlist, context: TrackListContext, h: HtmlBuilder<Message>): Html =>
  h.div(
    [],
    [
      headView(playlist, h),
      Option.match(
        maybeTrackSectionView("playlist-songs", SONGS, "Unranked", playlist.tracks, context, h),
        {
          onNone: () =>
            h.p([h.Class(QUIET_LINE_CLASS)], ["The catalog lists no songs for this playlist."]),
          onSome: (songs) => h.div([h.Class(PAGE_SECTIONS_CLASS)], [songs]),
        },
      ),
    ],
  );

/**
 * The catalog has no such playlist. That will not change, so there is
 * nothing to try again: the page says so, under its way back.
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
 * The page's title while there is no playlist to take it from. Loading, the
 * placeholders stand for it on screen and it is only said; after a failure
 * it heads the message.
 */
const untitledView = (playlist: PlaylistData, h: HtmlBuilder<Message>): Html =>
  AsyncData.matchData(playlist, {
    onEmpty: () => h.h1([h.Id(pageTitleIdOf(PAGE_ID)), h.Class("sr-only")], [TITLE]),
    onFailure: () => pageTitleView(PAGE_ID, TITLE, h),
    onData: () => h.empty,
  });

/**
 * The root is keyed by the playlist: another playlist is another page, which
 * starts at its top with its own pictures. The page is a list, so it is kept
 * behind a page reached from it, as a section is: `context.presence` says
 * whether it is on screen.
 */
export const view = (
  playlistId: PlaylistId,
  playlist: PlaylistData,
  hasWayBack: boolean,
  context: TrackListContext,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed("div")(playlistId, pageAttributes(PAGE_ID, context.presence, h), [
    wayBackView(hasWayBack, h),
    h.div(
      [h.AriaBusy(AsyncData.isPending(playlist)), h.Class("mt-4")],
      [
        untitledView(playlist, h),
        pageDataView(
          playlist,
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
