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
import { albumRouter, artistRouter, genreRouter, playlistRouter, stationRouter } from "../route.ts";
import {
  type ArtworkShape,
  type PictureLoading,
  artworkFlightRules,
  artworkView,
  flightAttributes,
  pictureFlightStyle,
} from "./artwork.ts";
import { type Presence, SECTION_HEADING_CLASS, TILE_ATTRIBUTES, type TileKind } from "./layout.ts";
import { TURNING_ROW_CLASS, type TurningOf, turningRowIdOf, turningView } from "./turning.ts";

// MODEL

/**
 * One thing on a shelf, whatever it is: a picture over two lines of text,
 * and the way to its page.
 */
export type Tile = Readonly<{
  id: string;
  kind: TileKind;
  title: string;
  /** The second line. A tile with nothing more to say than its title has none, and is one line shorter. */
  subtitle: string;
  maybeArtwork: Option.Option<Artwork>;
  /** Where the tile leads: the page of what it shows. */
  href: string;
  /** Whether that page is on its way: the tile was chosen, and the page it is on is held until then. */
  isOpening: boolean;
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
 * A tile is the way to the page of what it shows, and its picture is the one
 * that goes there: on the page on screen it carries the name the page's
 * picture carries, so the browser moves the one picture between the two.
 * What a tile says of its thing is the kind's own, below.
 */
const tileOf = (
  kind: TileKind,
  presence: Presence,
  thing: Readonly<{
    id: string;
    title: string;
    subtitle: string;
    picture: Artwork | null;
    href: string;
    isOpening: boolean;
  }>,
): Tile => ({
  id: thing.id,
  kind,
  title: thing.title,
  subtitle: thing.subtitle,
  maybeArtwork: Option.fromNullishOr(thing.picture),
  href: thing.href,
  isOpening: thing.isOpening,
  flightStyle: pictureFlightStyle(kind, thing.id, presence),
});

export const albumTile =
  (isOpening: IsAlbumOpening, presence: Presence) =>
  (album: AlbumSummary): Tile =>
    tileOf("Album", presence, {
      id: album.id,
      title: album.title,
      subtitle: album.artist.name,
      picture: album.cover,
      href: albumRouter({ albumId: album.id }),
      isOpening: isOpening(album.id),
    });

export const playlistTile =
  (isOpening: IsPlaylistOpening, presence: Presence) =>
  (playlist: PlaylistSummary): Tile =>
    tileOf("Playlist", presence, {
      id: playlist.id,
      title: playlist.title,
      subtitle: playlist.curator,
      picture: playlist.picture,
      href: playlistRouter({ playlistId: playlist.id }),
      isOpening: isOpening(playlist.id),
    });

export const artistTile =
  (isOpening: IsArtistOpening, presence: Presence) =>
  (artist: ArtistSummary): Tile =>
    tileOf("Artist", presence, {
      id: artist.id,
      title: artist.name,
      subtitle: "Artist",
      picture: artist.picture,
      href: artistRouter({ artistId: artist.id }),
      isOpening: isOpening(artist.id),
    });

/** A genre's name is all there is to say of it. */
export const genreTile =
  (isOpening: IsGenreOpening, presence: Presence) =>
  (genre: GenreSummary): Tile =>
    tileOf("Genre", presence, {
      id: genre.id,
      title: genre.name,
      subtitle: "",
      picture: genre.picture,
      href: genreRouter({ genreId: genre.id }),
      isOpening: isOpening(genre.id),
    });

/** The shelf a station stands on is named after its genre, so its title is all there is to say of it. */
export const stationTile =
  (isOpening: IsStationOpening, presence: Presence) =>
  (station: StationSummary): Tile =>
    tileOf("Station", presence, {
      id: station.id,
      title: station.title,
      subtitle: "",
      picture: station.picture,
      href: stationRouter({ stationId: station.id }),
      isOpening: isOpening(station.id),
    });

// VIEW

// NOTE: the row cuts off what it does not show, sideways and upwards alike,
// so it starts a little above its tiles: the room a focused tile's outline needs.
//
// A swipe along the row comes to rest on a tile: the row snaps, with a tile
// standing at its leading edge where the page's own margin is. Without it a
// flick leaves the row wherever it ran out, half a tile in.
export const SHELF_ROW_CLASS =
  "-mx-5 mt-3 flex snap-x snap-mandatory scroll-px-5 gap-5 overscroll-x-contain px-5 pt-1 pb-4 md:-mx-10 md:scroll-px-10 md:px-10";

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
    row: "-mx-5 mt-3 flex snap-x snap-mandatory scroll-px-5 gap-3 overscroll-x-contain px-5 pt-1 pb-4 md:-mx-10 md:scroll-px-10 md:px-10 search-wide:mx-0 search-wide:grid search-wide:snap-none search-wide:grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))] search-wide:gap-4.5 search-wide:overflow-visible search-wide:px-0",
    tile: "min-w-0 shrink-0 grow-0 basis-[calc((100%-1.5rem)/3)] snap-start search-wide:max-w-93",
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

// A SLEEVE AND ITS RECORD

// The picture of a thing whose page can be on its way is a sleeve, and behind
// it is its record. Chosen, the sleeve moves a little aside and the record
// comes part of the way out and turns, for as long as the page takes: the
// picture itself says that it is being fetched, and nothing is laid over it.
// When the page opens, the picture travels to the page's head and the record
// is left behind with the shelf. Under reduced motion the record is out and
// still.

/**
 * What the record stands behind. A tile's record is as large as its tile and
 * comes a third of the way out. A card (the artist a search found) is far
 * wider than it is high and stands hard against the page's edge, or the
 * songs beside it, so its record is no larger than a tile's and comes out
 * only into the room the card makes by moving aside, and a little past it.
 */
export type SleeveKind = "Tile" | "Card";

// NOTE: clear, and not hidden, while it is behind its sleeve. A page kept
// behind the one on screen is hidden as a whole, and a piece of it that said
// it was visible would be seen through it: the record of the tile just chosen
// would stand over the page it opened. Clear, it goes with its page. Going
// back in, it is made clear only once it is behind the sleeve: that is the
// wait on its opacity, which coming out has none of.
const RECORD_CLASS =
  "absolute rounded-full bg-vinyl after:absolute after:inset-0 after:rounded-full after:bg-vinyl-light motion-safe:transition-[translate,opacity] motion-safe:duration-[420ms,0s] motion-safe:ease-settle";

const RECORD_PLACES: Readonly<Record<SleeveKind, Readonly<{ behind: string; out: string }>>> = {
  Tile: {
    behind: "inset-[4%] opacity-0 motion-safe:delay-[0s,420ms]",
    out: "inset-[4%] translate-x-[34%] opacity-100 motion-safe:after:animate-record-turns",
  },
  Card: {
    behind:
      "top-1/2 right-0 aspect-square h-[min(84%,9rem)] -translate-y-1/2 opacity-0 motion-safe:delay-[0s,420ms]",
    out: "top-1/2 right-0 aspect-square h-[min(84%,9rem)] translate-x-4 -translate-y-1/2 opacity-100 motion-safe:after:animate-record-turns",
  },
};

/**
 * The record behind a sleeve. It is there whether or not it shows, so that
 * it comes out and goes back by degrees. It is no part of the piece that
 * carries the picture's name in a view transition: the picture travels to
 * the head of its page, and the record stays where it was.
 */
export const recordView = <M>(isOpening: boolean, kind: SleeveKind, h: HtmlBuilder<M>): Html =>
  h.span([
    h.AriaHidden(true),
    h.DataAttribute("record", ""),
    h.Class(clsx(RECORD_CLASS, isOpening ? RECORD_PLACES[kind].out : RECORD_PLACES[kind].behind)),
  ]);

const SLEEVE_ASIDE: Readonly<Record<SleeveKind, string>> = {
  Tile: "-translate-x-[6%]",
  Card: "-translate-x-3.5",
};

/** The sleeve's own movement: a little aside while its page is on its way, and back. */
export const sleeveClass = (isOpening: boolean, kind: SleeveKind): string =>
  clsx("motion-safe:transition-transform motion-safe:duration-420 motion-safe:ease-settle", {
    [SLEEVE_ASIDE[kind]]: isOpening,
  });

/** What a tile shows: its picture, a sleeve with its record behind it, over its title and what else it says. */
const tileContentView = (
  tile: Tile,
  shape: ArtworkShape,
  loading: PictureLoading,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => [
  h.div(
    [...(tile.isOpening ? [h.DataAttribute("opening", "")] : []), h.Class("relative")],
    [
      recordView(tile.isOpening, "Tile", h),
      h.div(
        [
          h.DataAttribute("sleeve", ""),
          h.Class(clsx("catalog-art relative", sleeveClass(tile.isOpening, "Tile"))),
          ...flightAttributes(tile.flightStyle, h),
        ],
        [artworkView(tile.maybeArtwork, shape, "medium", h, loading)],
      ),
    ],
  ),
  h.p([h.Class("mt-3 truncate text-sm font-medium")], [tile.title]),
  tile.subtitle === "" ? h.empty : h.p([h.Class("truncate text-sm text-muted")], [tile.subtitle]),
];

const TILE_LINK_CLASS = "block touch-manipulation rounded-lg focus-ring";

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
          h.DataAttribute(TILE_ATTRIBUTES[tile.kind], tile.id),
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

  return shelfSectionView(
    id,
    title,
    shape,
    tiles,
    place,
    look,
    layout === "ThreeAcross" ? "Thirds" : "Tiles",
    h,
  );
};

const shelfSectionView = (
  id: string,
  title: string,
  shape: ArtworkShape,
  tiles: Array.NonEmptyReadonlyArray<Tile>,
  place: ShelfPlace,
  look: Readonly<{ row: string; tile: string }>,
  turning: TurningOf,
  h: HtmlBuilder<Message>,
): Html =>
  h.section(
    [],
    [
      artworkFlightRules(
        tiles.flatMap((tile) => tile.flightStyle.viewTransitionName ?? []),
        h,
      ),
      h.h2([h.Id(id), h.Class(SECTION_HEADING_CLASS)], [title]),
      turningView(
        id,
        turning,
        h.ul(
          [
            h.Id(turningRowIdOf(id)),
            h.Role("list"),
            h.AriaLabelledBy(id),
            h.Class(clsx(look.row, TURNING_ROW_CLASS, "rounded-lg focus-ring-0")),
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
            artworkFlightRules(
              shown.flatMap((tile) => tile.flightStyle.viewTransitionName ?? []),
              h,
            ),
            h.ul(
              [h.Role("list"), h.AriaLabelledBy(labelledBy), h.Class(TILE_GRID_CLASS)],
              // The grid is all its page shows, so it is always at the page's head.
              Array.map(shown, (tile, index) =>
                tileView(
                  tile,
                  shape,
                  TILE_GRID_TILE_CLASS,
                  index < GRID_TILES_AT_ONCE ? "AtOnce" : "WhenNear",
                  h,
                ),
              ),
            ),
          ],
        ),
      ),
  });
