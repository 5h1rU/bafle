import type { Genre } from "@bafle/domain/Catalog/FullGenre";
import type { GenreId } from "@bafle/domain/Catalog/Genre";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "../message.ts";
import type { GenreData } from "../model.ts";
import { headPictureOf } from "../view/artwork.ts";
import { PAGE_IDS, PAGE_SECTIONS_CLASS } from "../view/layout.ts";
import {
  type DetailKind,
  detailHeadPlaceholderView,
  detailHeadView,
  detailPageView,
  detailTitleOf,
  GONE,
  sectionsView,
} from "../view/page.ts";
import { shelfPlaceholderView } from "../view/placeholder.ts";
import {
  albumTile,
  artistTile,
  maybeShelfView,
  playlistTile,
  type TilesOpening,
} from "../view/shelf.ts";
import {
  maybeTrackSectionView,
  type TrackListContext,
  type TrackSection,
  trackSectionPlaceholderView,
} from "../view/trackList.ts";

// VIEW

const KIND: DetailKind = {
  pageId: PAGE_IDS.Genre,
  name: "Genre",
  notAvailable: "This genre is not available",
  gone: GONE,
};

const TOP_ALBUMS = "Top albums";
const TOP_ARTISTS = "Top artists";
const TOP_PLAYLISTS = "Top playlists";

/** What is played most in the genre, in order: a chart, laid out as every chart is. */
const TOP_SONGS: TrackSection = {
  id: "genre-top-songs",
  title: "Top songs",
  order: "Ranked",
  spread: "Columns",
};

/** What a genre's page is called: the genre's name once the catalog has told it. */
export const titleOf = (genre: GenreData): string =>
  detailTitleOf(KIND, genre, (found) => found.name);

/**
 * The page before the catalog has answered: a block for the picture beside
 * a line for the name, then rows and tiles under the titles of the list and
 * the shelves, which never depend on the catalog.
 */
const placeholderView = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [],
    [
      detailHeadPlaceholderView({ shape: "Square", hasFacts: false }, h),
      h.div(
        [h.Class(PAGE_SECTIONS_CLASS)],
        [
          trackSectionPlaceholderView(TOP_SONGS, h),
          shelfPlaceholderView(TOP_ALBUMS, "Square", h),
          shelfPlaceholderView(TOP_ARTISTS, "Round", h),
          shelfPlaceholderView(TOP_PLAYLISTS, "Square", h),
        ],
      ),
    ],
  );

/**
 * The genre, and what is played most in it: its songs in order, numbered,
 * then its albums, its artists and its playlists, each on a shelf. Each row
 * plays, and those songs are then the queue; each tile leads to the page of
 * what it shows. A kind with nothing popular has no shelf.
 */
const foundView = (
  genre: Genre,
  context: TrackListContext,
  { isAlbumOpening, isArtistOpening, isPlaylistOpening }: TilesOpening,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [],
    [
      detailHeadView(
        {
          kind: KIND,
          picture: headPictureOf("Genre", genre.id, Option.fromNullishOr(genre.picture), h),
          title: genre.name,
        },
        h,
      ),
      sectionsView(
        [
          maybeTrackSectionView(TOP_SONGS, genre.topTracks, context, h),
          maybeShelfView(
            "genre-top-albums",
            TOP_ALBUMS,
            "Square",
            Array.map(genre.albums, albumTile(isAlbumOpening, context.presence)),
            h,
          ),
          maybeShelfView(
            "genre-top-artists",
            TOP_ARTISTS,
            "Round",
            Array.map(genre.artists, artistTile(isArtistOpening, context.presence)),
            h,
          ),
          maybeShelfView(
            "genre-top-playlists",
            TOP_PLAYLISTS,
            "Square",
            Array.map(genre.playlists, playlistTile(isPlaylistOpening, context.presence)),
            h,
          ),
        ],
        "The catalog lists nothing popular in this genre right now.",
        h,
      ),
    ],
  );

/**
 * The page is a list and shelves, so it is kept behind a page reached from
 * it, as a section is: `context.presence` says whether it is on screen.
 */
export const view = (
  genreId: GenreId,
  genre: GenreData,
  context: TrackListContext,
  opening: TilesOpening,
  h: HtmlBuilder<Message>,
): Html =>
  detailPageView(
    { kind: KIND, key: genreId, presence: context.presence, data: genre },
    () => placeholderView(h),
    (found) => foundView(found, context, opening, h),
    h,
  );
