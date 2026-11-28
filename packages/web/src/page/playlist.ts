import type { Playlist } from "@bafle/domain/Catalog/FullPlaylist";
import type { PlaylistId } from "@bafle/domain/Catalog/Playlist";
import * as Option from "effect/Option";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "../message.ts";
import type { PlaylistData } from "../model.ts";
import { headPictureOf } from "../view/artwork.ts";
import { PAGE_IDS, PAGE_SECTIONS_CLASS } from "../view/layout.ts";
import {
  type DetailKind,
  GONE,
  detailHeadPlaceholderView,
  detailHeadView,
  detailPageView,
  detailTitleOf,
  sectionsView,
  songCount,
} from "../view/page.ts";
import {
  type TrackListContext,
  type TrackSection,
  maybeTrackSectionView,
  trackSectionPlaceholderView,
} from "../view/trackList.ts";

// VIEW

const KIND: DetailKind = {
  pageId: PAGE_IDS.Playlist,
  name: "Playlist",
  notAvailable: "This playlist is not available",
  gone: GONE,
};

/** Its songs, in its own order: they are what the page is. */
const SONGS: TrackSection = {
  id: "playlist-songs",
  title: "Songs",
  order: "Unranked",
  spread: "Single",
};

/** What a playlist's page is called: the playlist's title once the catalog has told it. */
export const titleOf = (playlist: PlaylistData): string =>
  detailTitleOf(KIND, playlist, (found) => found.title);

/**
 * The page before the catalog has answered: a block for the picture beside
 * lines for the title, the curator and the song count, then rows under the
 * list's title, which never depends on the catalog.
 */
const placeholderView = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [],
    [
      detailHeadPlaceholderView({ shape: "Square", hasFacts: true }, h),
      h.div([h.Class(PAGE_SECTIONS_CLASS)], [trackSectionPlaceholderView(SONGS, h)]),
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
      detailHeadView(
        {
          kind: KIND,
          picture: headPictureOf(
            "Playlist",
            playlist.id,
            Option.fromNullishOr(playlist.picture),
            h,
          ),
          title: playlist.title,
          facts: { whose: playlist.curator, count: songCount(playlist.tracks.length) },
        },
        h,
      ),
      sectionsView(
        [maybeTrackSectionView(SONGS, playlist.tracks, context, h)],
        "The catalog lists no songs for this playlist.",
        h,
      ),
    ],
  );

/**
 * The page is a list, so it is kept behind a page reached from it, as a
 * section is: `context.presence` says whether it is on screen.
 */
export const view = (
  playlistId: PlaylistId,
  playlist: PlaylistData,
  context: TrackListContext,
  h: HtmlBuilder<Message>,
): Html =>
  detailPageView(
    { kind: KIND, key: playlistId, presence: context.presence, data: playlist },
    () => placeholderView(h),
    (found) => foundView(found, context, h),
    h,
  );
