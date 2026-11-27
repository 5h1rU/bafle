import type { AlbumId, AlbumSummary } from "@bafle/domain/Catalog/Album";
import type { ArtistId, ArtistSummary } from "@bafle/domain/Catalog/Artist";
import type { Artwork } from "@bafle/domain/Catalog/Artwork";
import type { GenreId, GenreSummary } from "@bafle/domain/Catalog/Genre";
import type { PlaylistId, PlaylistSummary } from "@bafle/domain/Catalog/Playlist";
import type { StationId, StationSummary } from "@bafle/domain/Catalog/Station";
import { clsx } from "clsx";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "../message.ts";
import { GRID_TILES_AT_ONCE, TILES_AT_ONCE } from "./firstPictures.ts";
import {
  albumRouter,
  artistRouter,
  genreRouter,
  playlistRouter,
  stationRouter,
} from "../route.ts";
import {
  albumCoverTransitionStyle,
  artistPictureTransitionStyle,
  type ArtworkShape,
  artworkView,
  artworkFlightRules,
  flightAttributes,
  genrePictureTransitionStyle,
  type PictureLoading,
  playlistPictureTransitionStyle,
  stationPictureTransitionStyle,
} from "./artwork.ts";
import {
  ALBUM_TILE_ATTRIBUTE,
  ARTIST_TILE_ATTRIBUTE,
  GENRE_TILE_ATTRIBUTE,
  PLAYLIST_TILE_ATTRIBUTE,
  type Presence,
  SECTION_HEADING_CLASS,
  STATION_TILE_ATTRIBUTE,
} from "./layout.ts";
import { turningRowIdOf, turningView } from "./turning.ts";

// MODEL

/**
 * One thing on a shelf, whatever it is: a picture over two lines of text,
 * and the way to its page.
 */
export type Tile = Readonly<{
  id: string;
  title: string;
  /** The second line. A tile with nothing more to say than its title has none, and is one line shorter. */
  subtitle: string;
  maybeArtwork: Option.Option<Artwork>;
  /** Where the tile leads: the page of what it shows. */
  href: string;
  /** Whether that page is on its way: the tile was chosen, and the page it is on is held until then. */
  isOpening: boolean;
  /** The data attribute that marks tiles of its kind, so the focus can be given back to it. */
  attribute: string;
  /** What its picture carries to travel to the page the tile leads to. */
  flightStyle: Readonly<Record<string, string>>;
}>;

/** Whether an album chosen from a shelf is on its way to the screen. */
export type IsAlbumOpening = (albumId: AlbumId) => boolean;

/** Whether an artist chosen from a shelf is on their way to the screen. */
export type IsArtistOpening = (artistId: ArtistId) => boolean;

/** Whether a playlist chosen from a shelf is on its way to the screen. */
export type IsPlaylistOpening = (playlistId: PlaylistId) => boolean;

/** Whether a genre chosen from its tile is on its way to the screen. */
export type IsGenreOpening = (genreId: GenreId) => boolean;

/** Whether a station chosen from a shelf is on its way to the screen. */
export type IsStationOpening = (stationId: StationId) => boolean;

/** What a page that shelves every kind reads to say which of its tiles is opening. */
export type TilesOpening = Readonly<{
  isAlbumOpening: IsAlbumOpening;
  isArtistOpening: IsArtistOpening;
  isPlaylistOpening: IsPlaylistOpening;
}>;

/**
 * An album's tile is the way to its page, and its picture is the one that
 * goes there: on the page on screen it carries the name the page's cover
 * carries, so the browser moves the one picture between the two.
 */
export const albumTile =
  (isOpening: IsAlbumOpening, presence: Presence) =>
  (album: AlbumSummary): Tile => ({
    id: album.id,
    title: album.title,
    subtitle: album.artist.name,
    maybeArtwork: Option.fromNullishOr(album.cover),
    href: albumRouter({ albumId: album.id }),
    isOpening: isOpening(album.id),
    attribute: ALBUM_TILE_ATTRIBUTE,
    flightStyle: albumCoverTransitionStyle(album.id, presence),
  });

/** A playlist's tile is the way to its page, as an album's is, and its picture goes there the same way. */
export const playlistTile =
  (isOpening: IsPlaylistOpening, presence: Presence) =>
  (playlist: PlaylistSummary): Tile => ({
    id: playlist.id,
    title: playlist.title,
    subtitle: playlist.curator,
    maybeArtwork: Option.fromNullishOr(playlist.picture),
    href: playlistRouter({ playlistId: playlist.id }),
    isOpening: isOpening(playlist.id),
    attribute: PLAYLIST_TILE_ATTRIBUTE,
    flightStyle: playlistPictureTransitionStyle(playlist.id, presence),
  });

/** An artist's tile is the way to their page, as an album's is, and their picture goes there the same way. */
export const artistTile =
  (isOpening: IsArtistOpening, presence: Presence) =>
  (artist: ArtistSummary): Tile => ({
    id: artist.id,
    title: artist.name,
    subtitle: "Artist",
    maybeArtwork: Option.fromNullishOr(artist.picture),
    href: artistRouter({ artistId: artist.id }),
    isOpening: isOpening(artist.id),
    attribute: ARTIST_TILE_ATTRIBUTE,
    flightStyle: artistPictureTransitionStyle(artist.id, presence),
  });

/**
 * A genre's tile is the way to its page, as an album's is, and its picture
 * goes there the same way. Its name is all there is to say of it.
 */
export const genreTile =
  (isOpening: IsGenreOpening, presence: Presence) =>
  (genre: GenreSummary): Tile => ({
    id: genre.id,
    title: genre.name,
    subtitle: "",
    maybeArtwork: Option.fromNullishOr(genre.picture),
    href: genreRouter({ genreId: genre.id }),
    isOpening: isOpening(genre.id),
    attribute: GENRE_TILE_ATTRIBUTE,
    flightStyle: genrePictureTransitionStyle(genre.id, presence),
  });

/**
 * A station's tile is the way to its page, as an album's is, and its picture
 * goes there the same way. The shelf it stands on is named after its genre,
 * so its title is all there is to say of it.
 */
export const stationTile =
  (isOpening: IsStationOpening, presence: Presence) =>
  (station: StationSummary): Tile => ({
    id: station.id,
    title: station.title,
    subtitle: "",
    maybeArtwork: Option.fromNullishOr(station.picture),
    href: stationRouter({ stationId: station.id }),
    isOpening: isOpening(station.id),
    attribute: STATION_TILE_ATTRIBUTE,
    flightStyle: stationPictureTransitionStyle(station.id, presence),
  });

// VIEW

// NOTE: the row cuts off what it does not show, sideways and upwards alike,
// so it starts a little above its tiles: the room a focused tile's outline needs.
//
// A swipe along the row comes to rest on a tile: the row snaps, with a tile
// standing at its leading edge where the page's own margin is. Without it a
// flick leaves the row wherever it ran out, half a tile in.
export const SHELF_ROW_CLASS =
  "-mx-5 mt-3 flex snap-x snap-mandatory scroll-px-5 gap-5 overflow-x-auto overscroll-x-contain px-5 pt-1 pb-4 md:-mx-10 md:scroll-px-10 md:px-10";

export const SHELF_TILE_CLASS = "w-36 shrink-0 snap-start sm:w-40";

/**
 * How a shelf's tiles are laid out. `Row` is the shelf of every section and
 * every page: tiles of one size on a row that goes on sideways. `ThreeAcross`
 * is how Search shelves the albums it found: three tiles to the row's width,
 * on a row that goes on sideways, and where Search's page is wide a grid
 * that fills it, as many across as there is room for. Whichever it is, the
 * shelf is the same shelf: the same tiles, links, records and names.
 */
export type ShelfLayout = "Row" | "ThreeAcross";

const SHELF_LAYOUTS: Readonly<Record<ShelfLayout, Readonly<{ row: string; tile: string }>>> = {
  Row: { row: SHELF_ROW_CLASS, tile: SHELF_TILE_CLASS },
  // NOTE: how many columns the grid has goes by the least a tile can be, so
  // a dozen albums are small tiles in two rows; columns left empty are not
  // kept, so three albums share the whole width between them. A tile is
  // never larger than the design's, however few there are. The page is
  // wide by its own width (`search` names it as a container), not the
  // screen's: the queue opens beside it.
  ThreeAcross: {
    row: "-mx-5 mt-3 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto overscroll-x-contain px-5 pt-1 pb-4 md:-mx-10 md:scroll-px-10 md:px-10 @min-[40rem]/search:mx-0 @min-[40rem]/search:grid @min-[40rem]/search:snap-none @min-[40rem]/search:grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))] @min-[40rem]/search:gap-4.5 @min-[40rem]/search:overflow-visible @min-[40rem]/search:px-0",
    tile: "min-w-0 shrink-0 grow-0 basis-[calc((100%-1.5rem)/3)] snap-start @min-[40rem]/search:max-w-93",
  },
};

/**
 * Where a row of tiles stands on its page: at its head, on screen as the
 * page arrives, or below something else, where the listener scrolls to it.
 */
export type ShelfPlace = "AtHead" | "Below";

// NOTE: a phone's row shows three tiles and a desktop's twice that. Four is
// what every screen shows of the row at a page's head, or nearly: asking for
// more at once would set pictures no one sees yet against the ones they do.
// The reply for the page is held until these are ready (`firstPicturesOf`).

/**
 * When a tile's picture is asked for. The first of the row at a page's head
 * are what the page opens with, so they do not wait to learn they are on
 * screen; every other waits until the listener is near it.
 */
const tileLoading = (place: ShelfPlace, index: number): PictureLoading =>
  place === "AtHead" && index < TILES_AT_ONCE ? "AtOnce" : "WhenNear";

/**
 * What a tile shows. A tile whose page is on its way says so with its own
 * picture: the sleeve moves a little aside and its record comes part of the
 * way out from behind it and turns, for as long as the page takes, and goes
 * back in when the page opens (`tile-record` in shelf.css).
 */
// NOTE: the record is there whether or not it shows, behind the picture, so
// that it comes out and goes back by degrees, and so that the picture is
// the same element before, during and after. It is no part of the piece
// that carries the picture's name in a view transition: the picture travels
// to the head of its page, and the record stays on the shelf it leaves.
const tileContentView = (
  tile: Tile,
  shape: ArtworkShape,
  loading: PictureLoading,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => [
  h.div(
    [
      ...(tile.isOpening ? [h.DataAttribute("opening", "")] : []),
      h.Class("tile-art relative"),
    ],
    [
      h.span([h.AriaHidden(true), h.Class("tile-record")], []),
      h.div(
        [h.Class("tile-sleeve catalog-art relative"), ...flightAttributes(tile.flightStyle, h)],
        [artworkView(tile.maybeArtwork, shape, "medium", h, loading)],
      ),
    ],
  ),
  h.p([h.Class("mt-3 truncate text-sm font-medium")], [tile.title]),
  tile.subtitle === ""
    ? h.empty
    : h.p([h.Class("truncate text-sm text-muted")], [tile.subtitle]),
];

const TILE_LINK_CLASS =
  "block touch-manipulation rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const tileView = (
  tile: Tile,
  shape: ArtworkShape,
  className: string,
  loading: PictureLoading,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed("li")(
    tile.id,
    [h.Class(className)],
    [
      h.a(
        [
          h.Href(tile.href),
          h.AriaBusy(tile.isOpening),
          h.DataAttribute(tile.attribute, tile.id),
          h.Class(TILE_LINK_CLASS),
        ],
        tileContentView(tile, shape, loading, h),
      ),
    ],
  );

/**
 * A titled row of tiles that scrolls sideways. Every tile is a link, so the
 * row is scrolled by the focus going from one to the next and takes none
 * itself. The title names the row and nothing else. Where there is a
 * pointer the row is turned by its two arrows (`turningView`).
 */
const shelfView = (
  id: string,
  title: string,
  shape: ArtworkShape,
  tiles: Array.NonEmptyReadonlyArray<Tile>,
  place: ShelfPlace,
  layout: ShelfLayout,
  h: HtmlBuilder<Message>,
): Html => {
  const look = SHELF_LAYOUTS[layout];

  return shelfSectionView(id, title, shape, tiles, place, look, h);
};

const shelfSectionView = (
  id: string,
  title: string,
  shape: ArtworkShape,
  tiles: Array.NonEmptyReadonlyArray<Tile>,
  place: ShelfPlace,
  look: Readonly<{ row: string; tile: string }>,
  h: HtmlBuilder<Message>,
): Html =>
  h.section(
    [],
    [
      artworkFlightRules(tiles.flatMap((tile) => tile.flightStyle.viewTransitionName ?? []), h),
      h.h2([h.Id(id), h.Class(SECTION_HEADING_CLASS)], [title]),
      turningView(
        id,
        "Tiles",
        h.ul(
          [
            h.Id(turningRowIdOf(id)),
            h.Role("list"),
            h.AriaLabelledBy(id),
            h.Class(
              clsx(
                look.row,
                "turning-row rounded-lg focus-visible:outline-2 focus-visible:outline-accent",
              ),
            ),
          ],
          Array.map(tiles, (tile, index) =>
            tileView(tile, shape, look.tile, tileLoading(place, index), h),
          ),
        ),
        h,
      ),
    ],
  );

/**
 * A shelf, or nothing when there is nothing to put on it: a title over an
 * empty row says less than no row. A page says which of its shelves it opens
 * with, if any; a shelf it does not speak for stands below something else.
 */
export const maybeShelfView = (
  id: string,
  title: string,
  shape: ArtworkShape,
  tiles: ReadonlyArray<Tile>,
  h: HtmlBuilder<Message>,
  place: ShelfPlace = "Below",
  layout: ShelfLayout = "Row",
): Option.Option<Html> =>
  Array.match(tiles, {
    onEmpty: () => Option.none(),
    onNonEmpty: (shelved) => Option.some(shelfView(id, title, shape, shelved, place, layout, h)),
  });

/**
 * Tiles that fill the page's width and wrap, for a page that shows all of
 * one kind and has no row to scroll: as many columns as there is room for,
 * two on a narrow screen.
 */
export const TILE_GRID_CLASS = "mt-8 grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-5";

export const TILE_GRID_TILE_CLASS = "min-w-0";

/**
 * Every tile of a page at once, in a grid. The grid is named by what names
 * the page, since it is all the page shows. Nothing to show is no grid.
 */
export const maybeTileGridView = (
  labelledBy: string,
  shape: ArtworkShape,
  tiles: ReadonlyArray<Tile>,
  h: HtmlBuilder<Message>,
): Option.Option<Html> =>
  Array.match(tiles, {
    onEmpty: () => Option.none(),
    onNonEmpty: (shown) =>
      Option.some(
        h.div(
          [],
          [
            artworkFlightRules(shown.flatMap((tile) => tile.flightStyle.viewTransitionName ?? []), h),
            h.ul(
              [h.Role("list"), h.AriaLabelledBy(labelledBy), h.Class(TILE_GRID_CLASS)],
              // The grid is all its page shows, so it is always at the page's head.
              Array.map(shown, (tile, index) =>
                tileView(tile, shape, TILE_GRID_TILE_CLASS, index < GRID_TILES_AT_ONCE ? "AtOnce" : "WhenNear", h),
              ),
            ),
          ],
        ),
      ),
  });
