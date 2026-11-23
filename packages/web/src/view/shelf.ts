import type { AlbumSummary } from "@bafle/domain/Catalog/Album";
import type { ArtistSummary } from "@bafle/domain/Catalog/Artist";
import type { Artwork } from "@bafle/domain/Catalog/Artwork";
import type { PlaylistSummary } from "@bafle/domain/Catalog/Playlist";
import { clsx } from "clsx";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "../message.ts";
import { type ArtworkShape, artworkView } from "./artwork.ts";
import { SECTION_HEADING_CLASS } from "./layout.ts";

// MODEL

/** One thing on a shelf, whatever it is: a picture over two lines of text. */
export type Tile = Readonly<{
  id: string;
  title: string;
  subtitle: string;
  maybeArtwork: Option.Option<Artwork>;
}>;

export const albumTile = (album: AlbumSummary): Tile => ({
  id: album.id,
  title: album.title,
  subtitle: album.artist.name,
  maybeArtwork: Option.fromNullishOr(album.cover),
});

export const playlistTile = (playlist: PlaylistSummary): Tile => ({
  id: playlist.id,
  title: playlist.title,
  subtitle: playlist.curator,
  maybeArtwork: Option.fromNullishOr(playlist.picture),
});

export const artistTile = (artist: ArtistSummary): Tile => ({
  id: artist.id,
  title: artist.name,
  subtitle: "Artist",
  maybeArtwork: Option.fromNullishOr(artist.picture),
});

// VIEW

export const SHELF_ROW_CLASS =
  "-mx-5 mt-4 flex gap-5 overflow-x-auto px-5 pb-4 [scrollbar-color:var(--color-line)_transparent] [scrollbar-width:thin] md:-mx-10 md:px-10";

export const SHELF_TILE_CLASS = "w-36 shrink-0 sm:w-40";

const tileView = (tile: Tile, shape: ArtworkShape, h: HtmlBuilder<Message>): Html =>
  h.keyed("li")(
    tile.id,
    [h.Class(SHELF_TILE_CLASS)],
    [
      artworkView(tile.maybeArtwork, shape, "medium", h),
      h.p([h.Class("mt-3 truncate text-sm font-medium")], [tile.title]),
      h.p([h.Class("truncate text-sm text-muted")], [tile.subtitle]),
    ],
  );

/**
 * A titled row of tiles that scrolls sideways. The row takes keyboard focus so
 * it can be scrolled with the arrow keys: nothing in it is a control yet. The
 * title names the row, the element that is focused, and nothing else.
 */
const shelfView = (
  id: string,
  title: string,
  shape: ArtworkShape,
  tiles: Array.NonEmptyReadonlyArray<Tile>,
  h: HtmlBuilder<Message>,
): Html =>
  h.section(
    [],
    [
      h.h2([h.Id(id), h.Class(SECTION_HEADING_CLASS)], [title]),
      h.ul(
        [
          h.Role("list"),
          h.AriaLabelledBy(id),
          h.Tabindex(0),
          h.Class(
            clsx(
              SHELF_ROW_CLASS,
              "rounded-lg focus-visible:outline-2 focus-visible:outline-accent",
            ),
          ),
        ],
        Array.map(tiles, (tile) => tileView(tile, shape, h)),
      ),
    ],
  );

/** A shelf, or nothing when there is nothing to put on it: a title over an empty row says less than no row. */
export const maybeShelfView = (
  id: string,
  title: string,
  shape: ArtworkShape,
  tiles: ReadonlyArray<Tile>,
  h: HtmlBuilder<Message>,
): Option.Option<Html> =>
  Array.match(tiles, {
    onEmpty: () => Option.none(),
    onNonEmpty: (shelved) => Option.some(shelfView(id, title, shape, shelved, h)),
  });
