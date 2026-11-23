import * as Domain from "@alchemy.run/domain";
import * as Schema from "effect/Schema";
import { AlbumSummary } from "./Album.ts";
import { ArtistSummary } from "./Artist.ts";
import { CatalogUnavailable } from "./CatalogUnavailable.rejection.ts";
import { PlaylistSummary } from "./Playlist.ts";
import { TrackSummary } from "./Track.ts";

/** What the catalog recommends today: picks by its editors, and what listeners gather around. */
export const FeaturedMusic = Schema.Struct({
  albums: Schema.Array(AlbumSummary),
  playlists: Schema.Array(PlaylistSummary),
  artists: Schema.Array(ArtistSummary),
});
export type FeaturedMusic = typeof FeaturedMusic.Type;

/** What is being played most right now, most played first. */
export const TrendingMusic = Schema.Struct({
  tracks: Schema.Array(TrackSummary),
  albums: Schema.Array(AlbumSummary),
});
export type TrendingMusic = typeof TrendingMusic.Type;

/** Everything in the catalog that matches a search, best match first in each list. */
export const SearchResults = Schema.Struct({
  tracks: Schema.Array(TrackSummary),
  albums: Schema.Array(AlbumSummary),
  artists: Schema.Array(ArtistSummary),
  playlists: Schema.Array(PlaylistSummary),
});
export type SearchResults = typeof SearchResults.Type;

/**
 * The music catalog Bafle reads from. Bafle says what it wants in its own
 * words and never names a provider: an adapter turns each call into Deezer's,
 * Apple Music's or Spotify's API, and their answers back into these shapes.
 */
export class MusicCatalog extends Domain.ExternalSystem(
  "MusicCatalog",
  {
    /** What to open the app with. */
    featured: { success: FeaturedMusic, error: CatalogUnavailable },
    /** What is popular right now. */
    trending: { success: TrendingMusic, error: CatalogUnavailable },
    /** Everything that matches `term`, at most `limit` of each kind. */
    search: {
      args: { term: Schema.String, limit: Schema.Int },
      success: SearchResults,
      error: CatalogUnavailable,
    },
  },
  { description: "The music provider whose catalog Bafle browses and searches." },
) {}
