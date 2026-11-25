import type { Genre } from "@bafle/domain/Catalog/FullGenre";
import type { GenreId } from "@bafle/domain/Catalog/Genre";
import { clsx } from "clsx";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "../message.ts";
import type { GenreData } from "../model.ts";
import { genrePictureView } from "../view/artwork.ts";
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
import {
  BLOCK_CLASS,
  shelfPlaceholderView,
  trackListPlaceholderView,
} from "../view/placeholder.ts";
import {
  albumTile,
  artistTile,
  maybeShelfView,
  playlistTile,
  type TilesOpening,
} from "../view/shelf.ts";
import { maybeTrackSectionView, type TrackListContext } from "../view/trackList.ts";
import { wayBackView } from "../view/wayBack.ts";

// VIEW

const PAGE_ID = PAGE_IDS.Genre;
const TITLE = "Genre";
const TOP_SONGS = "Top songs";
const TOP_ALBUMS = "Top albums";
const TOP_ARTISTS = "Top artists";
const TOP_PLAYLISTS = "Top playlists";
const NOT_AVAILABLE = "This genre is not available";

/** What a genre's page is called: the genre's name once the catalog has told it. */
export const titleOf = (genre: GenreData): string =>
  Option.match(AsyncData.getData(genre), {
    onNone: () => TITLE,
    onSome: Option.match({ onNone: () => NOT_AVAILABLE, onSome: (found) => found.name }),
  });

/** The picture beside the genre's name, at the head of the page. */
const HEAD_CLASS = "flex max-w-3xl items-center gap-5 md:gap-7";

const PICTURE_CLASS = "w-28 shrink-0 sm:w-40 md:w-48";

/**
 * The page before the catalog has answered: a block for the picture beside
 * a line for the name, then rows and tiles under the titles of the list and
 * the shelves, which never depend on the catalog.
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
            [h.div([h.Class(clsx(BLOCK_CLASS, "h-9 w-3/5 rounded"))])],
          ),
        ],
      ),
      h.div(
        [h.Class(PAGE_SECTIONS_CLASS)],
        [
          h.section(
            [h.Class("max-w-3xl")],
            [h.h2([h.Class(SECTION_HEADING_CLASS)], [TOP_SONGS]), trackListPlaceholderView(h)],
          ),
          shelfPlaceholderView(TOP_ALBUMS, "Square", h),
          shelfPlaceholderView(TOP_ARTISTS, "Round", h),
          shelfPlaceholderView(TOP_PLAYLISTS, "Square", h),
        ],
      ),
    ],
  );

const headView = (genre: Genre, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class(HEAD_CLASS)],
    [
      h.div(
        [h.Class(PICTURE_CLASS)],
        [genrePictureView(genre.id, Option.fromNullishOr(genre.picture), h)],
      ),
      h.div(
        [h.Class("min-w-0")],
        [h.h1([h.Id(pageTitleIdOf(PAGE_ID)), h.Class(PAGE_TITLE_CLASS)], [genre.name])],
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
      headView(genre, h),
      Array.match(
        Array.getSomes([
          maybeTrackSectionView(
            "genre-top-songs",
            TOP_SONGS,
            "Ranked",
            "Columns",
            genre.topTracks,
            context,
            h,
          ),
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
        ]),
        {
          onEmpty: () =>
            h.p([h.Class(QUIET_LINE_CLASS)], ["The catalog lists nothing popular in this genre right now."]),
          onNonEmpty: (sections) => h.div([h.Class(PAGE_SECTIONS_CLASS)], sections),
        },
      ),
    ],
  );

/**
 * The catalog has no such genre. That will not change, so there is nothing
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
 * The page's title while there is no genre to take it from. Loading, the
 * placeholders stand for it on screen and it is only said; after a failure
 * it heads the message.
 */
const untitledView = (genre: GenreData, h: HtmlBuilder<Message>): Html =>
  AsyncData.matchData(genre, {
    onEmpty: () => h.h1([h.Id(pageTitleIdOf(PAGE_ID)), h.Class("sr-only")], [TITLE]),
    onFailure: () => pageTitleView(PAGE_ID, TITLE, h),
    onData: () => h.empty,
  });

/**
 * The root is keyed by the genre: another genre is another page, which
 * starts at its top with its own pictures. The page is a list and shelves,
 * so it is kept behind a page reached from it, as a section is:
 * `context.presence` says whether it is on screen.
 */
export const view = (
  genreId: GenreId,
  genre: GenreData,
  hasWayBack: boolean,
  context: TrackListContext,
  opening: TilesOpening,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed("div")(genreId, pageAttributes(PAGE_ID, context.presence, h), [
    wayBackView(hasWayBack, h),
    h.div(
      [h.AriaBusy(AsyncData.isPending(genre)), h.Class("mt-4")],
      [
        untitledView(genre, h),
        pageDataView(
          genre,
          TITLE,
          () => placeholderView(h),
          Option.match({
            onNone: () => notAvailableView(h),
            onSome: (found) => foundView(found, context, opening, h),
          }),
          h,
        ),
      ],
    ),
  ]);
