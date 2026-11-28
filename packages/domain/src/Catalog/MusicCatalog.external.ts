import * as Domain from "@alchemy.run/domain";
import * as Schema from "effect/Schema";
import { AlbumId, AlbumSummary } from "./Album.ts";
import { AlbumNotFound } from "./AlbumNotFound.rejection.ts";
import { ArtistId, ArtistSummary } from "./Artist.ts";
import { ArtistNotFound } from "./ArtistNotFound.rejection.ts";
import { CatalogUnavailable } from "./CatalogUnavailable.rejection.ts";
import { Album } from "./FullAlbum.ts";
import { Artist } from "./FullArtist.ts";
import { Genre } from "./FullGenre.ts";
import { Playlist } from "./FullPlaylist.ts";
import { Station } from "./FullStation.ts";
import { GenreId, GenreSummary } from "./Genre.ts";
import { GenreNotFound } from "./GenreNotFound.rejection.ts";
import { PlaylistId, PlaylistSummary } from "./Playlist.ts";
import { PlaylistNotFound } from "./PlaylistNotFound.rejection.ts";
import { StationGroup, StationId } from "./Station.ts";
import { StationNotFound } from "./StationNotFound.rejection.ts";
import { Track, TrackId, TrackSummary } from "./Track.ts";
import { TrackNotFound } from "./TrackNotFound.rejection.ts";

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

/** Every genre the catalog files music under, as the catalog orders them. */
export const MusicGenres = Schema.Struct({ genres: Schema.Array(GenreSummary) });
export type MusicGenres = typeof MusicGenres.Type;

/**
 * The catalog's stations, each group the stations of one genre. A genre with
 * no station has no group.
 */
export const RadioStations = Schema.Struct({ groups: Schema.Array(StationGroup) });
export type RadioStations = typeof RadioStations.Type;

/**
 * The music catalog Bafle reads from. Bafle says what it wants in its own
 * words and never names a provider: an adapter turns each call into Audius's,
 * Deezer's or Apple Music's API, and their answers back into these shapes.
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
    /** One track, in full. */
    track: {
      args: { trackId: TrackId },
      success: Track,
      error: [TrackNotFound, CatalogUnavailable],
    },
    /** One album, in full, with its tracks. */
    album: {
      args: { albumId: AlbumId },
      success: Album,
      error: [AlbumNotFound, CatalogUnavailable],
    },
    /** One artist, in full, with at most `topTracks` of their most played tracks and their albums. */
    artist: {
      args: { artistId: ArtistId, topTracks: Schema.Int },
      success: Artist,
      error: [ArtistNotFound, CatalogUnavailable],
    },
    /** One playlist, in full, with its tracks. */
    playlist: {
      args: { playlistId: PlaylistId },
      success: Playlist,
      error: [PlaylistNotFound, CatalogUnavailable],
    },
    /** Every genre the catalog files music under. */
    genres: { success: MusicGenres, error: CatalogUnavailable },
    /** One genre, in full, with at most `topTracks` of the tracks played most in it, and the albums, artists and playlists played most in it. */
    genre: {
      args: { genreId: GenreId, topTracks: Schema.Int },
      success: Genre,
      error: [GenreNotFound, CatalogUnavailable],
    },
    /** The stations the catalog keeps, under the genre each belongs to. */
    stations: { success: RadioStations, error: CatalogUnavailable },
    /** One station, in full, with at most `tracks` of the songs it plays now. */
    station: {
      args: { stationId: StationId, tracks: Schema.Int },
      success: Station,
      error: [StationNotFound, CatalogUnavailable],
    },
  },
  { description: "The music provider whose catalog Bafle browses and searches." },
) {}
