import type { Artwork } from "@bafle/domain/Catalog/Artwork";
import type { TrackSummary } from "@bafle/domain/Catalog/Track";
import * as Array from "effect/Array";
import * as Match from "effect/Match";
import type { Catalog } from "../catalog.ts";

/**
 * The pictures a page draws on its first screen, worked out from the
 * catalog's reply before the page is drawn. A reply is held back until these
 * are loaded and decoded (`asking` in command.ts), so that the page takes the
 * screen with them already painted, and none of them is seen as an empty box
 * that fills a moment later. The views draw these same pictures `AtOnce`:
 * asked for first, and decoded as they are drawn, since they are ready.
 */
// NOTE: a page's head has two renditions of its picture, the small one under
// the larger. Only the small one is waited for: it is the one drawn first, and
// the larger one comes over it when it arrives, as the head has always done.

/** The tiles at the head of a shelf drawn at once: as many as a phone shows across. */
export const TILES_AT_ONCE = 4;

/** The shelves a page of shelves alone opens with: as many as a phone's screen shows. */
export const SHELVES_AT_HEAD = 2;

/** The tiles of a grid drawn at once: the rows of two that a phone's screen holds. */
export const GRID_TILES_AT_ONCE = 8;

/** The rows of a list drawn at once: about as many as a phone's screen holds. */
export const ROWS_AT_ONCE = 8;

type CatalogMessage = typeof Catalog.Message.Type;

type Rendition = keyof Pick<Artwork, "small" | "medium" | "large">;

const rendition =
  (size: Rendition) =>
  (artwork: Artwork | null): ReadonlyArray<string> =>
    artwork === null ? [] : [artwork[size]];

const headOf = rendition("small");
const heroOf = rendition("large");

const tilesOf = <A>(
  items: ReadonlyArray<A>,
  artworkOf: (item: A) => Artwork | null,
  count: number = TILES_AT_ONCE,
): ReadonlyArray<string> => Array.flatMap(Array.take(items, count), (item) => rendition("medium")(artworkOf(item)));

const rowsOf = (tracks: ReadonlyArray<TrackSummary>): ReadonlyArray<string> =>
  Array.flatMap(Array.take(tracks, ROWS_AT_ONCE), (track) => rendition("small")(track.album.cover));

const coverOf = (album: { readonly cover: Artwork | null }): Artwork | null => album.cover;

const pictureOf = (item: { readonly picture: Artwork | null }): Artwork | null => item.picture;

/**
 * The pictures to have ready before the page a reply is for takes the
 * screen, each once. A failure has none: what it says needs no picture.
 */
export const firstPicturesOf = (message: CatalogMessage): ReadonlyArray<string> =>
  Array.dedupe(
    Match.value(message).pipe(
      Match.tags({
        SucceededHomeFeed: ({ result }) => [
          ...tilesOf(result.albums, coverOf),
          ...tilesOf(result.playlists, pictureOf),
        ],
        SucceededNewMusic: ({ result }) => rowsOf(result.tracks),
        // NOTE: Search opens with the artist it found first, on a card of
        // their own, then the first albums and the first songs.
        SucceededCatalogSearch: ({ result }) => [
          ...heroOf(result.artists[0]?.picture ?? null),
          ...tilesOf(result.albums, coverOf),
          ...rowsOf(result.tracks),
        ],
        SucceededTrackDetail: ({ result }) => headOf(result.album.cover),
        SucceededAlbumDetail: ({ result }) => headOf(result.cover),
        SucceededArtistDetail: ({ result }) => [
          ...headOf(result.picture),
          ...rowsOf(result.topTracks),
        ],
        SucceededPlaylistDetail: ({ result }) => [
          ...headOf(result.picture),
          ...rowsOf(result.tracks),
        ],
        SucceededGenreList: ({ result }) =>
          tilesOf(result.genres, pictureOf, GRID_TILES_AT_ONCE),
        SucceededGenreDetail: ({ result }) => [
          ...headOf(result.picture),
          ...rowsOf(result.topTracks),
        ],
        SucceededStationList: ({ result }) =>
          Array.flatMap(Array.take(result.groups, SHELVES_AT_HEAD), (group) =>
            tilesOf(group.stations, pictureOf),
          ),
        SucceededStationDetail: ({ result }) => [
          ...headOf(result.picture),
          ...rowsOf(result.tracks),
        ],
      }),
      Match.orElse((): ReadonlyArray<string> => []),
    ),
  );
