import type { ArtistId } from "@bafle/domain/Catalog/Artist";
import type { Artist } from "@bafle/domain/Catalog/FullArtist";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "../message.ts";
import type { ArtistData } from "../model.ts";
import { headPictureOf } from "../view/artwork.ts";
import { PAGE_IDS, PAGE_SECTIONS_CLASS } from "../view/layout.ts";
import {
  type DetailKind,
  detailHeadPlaceholderView,
  detailHeadView,
  detailPageView,
  detailTitleOf,
  sectionsView,
} from "../view/page.ts";
import { shelfPlaceholderView } from "../view/placeholder.ts";
import { type IsAlbumOpening, albumTile, maybeShelfView } from "../view/shelf.ts";
import {
  type TrackListContext,
  type TrackSection,
  maybeTrackSectionView,
  trackSectionPlaceholderView,
} from "../view/trackList.ts";

// VIEW

const KIND: DetailKind = {
  pageId: PAGE_IDS.Artist,
  name: "Artist",
  notAvailable: "This artist is not available",
  gone: "The catalog no longer has them, or the link to them is wrong.",
};

const ALBUMS = "Albums";

/** Their most played songs, in order: a chart, laid out as every chart is. */
const TOP_SONGS: TrackSection = {
  id: "artist-top-songs",
  title: "Top songs",
  order: "Ranked",
  spread: "Columns",
};

/** What an artist's page is called: the artist's name once the catalog has told it. */
export const titleOf = (artist: ArtistData): string =>
  detailTitleOf(KIND, artist, (found) => found.name);

/**
 * The page before the catalog has answered: a round block for the picture
 * beside a line for the name, then rows and tiles under the titles of the
 * list and the shelf, which never depend on the catalog.
 */
const placeholderView = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [],
    [
      detailHeadPlaceholderView({ shape: "Round", hasFacts: false }, h),
      h.div(
        [h.Class(PAGE_SECTIONS_CLASS)],
        [trackSectionPlaceholderView(TOP_SONGS, h), shelfPlaceholderView(ALBUMS, "Square", h)],
      ),
    ],
  );

/**
 * The artist, their most played songs in order, numbered, and their albums
 * on a shelf. Each row plays, and those songs are then the queue; each tile
 * leads to its album's page.
 */
const foundView = (
  artist: Artist,
  context: TrackListContext,
  isAlbumOpening: IsAlbumOpening,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [],
    [
      detailHeadView(
        {
          kind: KIND,
          picture: headPictureOf("Artist", artist.id, Option.fromNullishOr(artist.picture), h),
          title: artist.name,
        },
        h,
      ),
      sectionsView(
        [
          maybeTrackSectionView(TOP_SONGS, artist.topTracks, context, h),
          maybeShelfView(
            "artist-albums",
            ALBUMS,
            "Square",
            Array.map(artist.albums, albumTile(isAlbumOpening, context.presence)),
            h,
          ),
        ],
        "The catalog lists no songs or albums for this artist.",
        h,
      ),
    ],
  );

/**
 * The page is a list and a shelf, so it is kept behind a page reached from
 * it, as a section is: `context.presence` says whether it is on screen.
 */
export const view = (
  artistId: ArtistId,
  artist: ArtistData,
  context: TrackListContext,
  isAlbumOpening: IsAlbumOpening,
  h: HtmlBuilder<Message>,
): Html =>
  detailPageView(
    { kind: KIND, key: artistId, presence: context.presence, data: artist },
    () => placeholderView(h),
    (found) => foundView(found, context, isAlbumOpening, h),
    h,
  );
