import * as Domain from "@alchemy.run/domain";
import { Story } from "@alchemy.run/domain/Story";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { Bafle, BafleHandlers } from "../src/Bafle.model.ts";
import { AlbumId } from "../src/Catalog/Album.ts";
import { AlbumDetail } from "../src/Catalog/AlbumDetail.query.ts";
import { AlbumNotFound } from "../src/Catalog/AlbumNotFound.rejection.ts";
import { ArtistId } from "../src/Catalog/Artist.ts";
import { ArtistDetail, TOP_TRACKS } from "../src/Catalog/ArtistDetail.query.ts";
import { ArtistNotFound } from "../src/Catalog/ArtistNotFound.rejection.ts";
import { CatalogSearch, noResults, SEARCH_LIMIT } from "../src/Catalog/CatalogSearch.query.ts";
import { CatalogUnavailable } from "../src/Catalog/CatalogUnavailable.rejection.ts";
import { GenreId } from "../src/Catalog/Genre.ts";
import { GENRE_TOP_TRACKS, GenreDetail } from "../src/Catalog/GenreDetail.query.ts";
import { GenreList } from "../src/Catalog/GenreList.query.ts";
import { GenreNotFound } from "../src/Catalog/GenreNotFound.rejection.ts";
import { HomeFeed } from "../src/Catalog/HomeFeed.query.ts";
import { MusicCatalog } from "../src/Catalog/MusicCatalog.external.ts";
import { NewMusic } from "../src/Catalog/NewMusic.query.ts";
import { PlaylistId } from "../src/Catalog/Playlist.ts";
import { PlaylistDetail } from "../src/Catalog/PlaylistDetail.query.ts";
import { PlaylistNotFound } from "../src/Catalog/PlaylistNotFound.rejection.ts";
import { StationId } from "../src/Catalog/Station.ts";
import { STATION_TRACKS, StationDetail } from "../src/Catalog/StationDetail.query.ts";
import { StationList } from "../src/Catalog/StationList.query.ts";
import { StationNotFound } from "../src/Catalog/StationNotFound.rejection.ts";
import { TrackId } from "../src/Catalog/Track.ts";
import { TrackDetail } from "../src/Catalog/TrackDetail.query.ts";
import { TrackNotFound } from "../src/Catalog/TrackNotFound.rejection.ts";
import {
  featured,
  found,
  fullAlbum,
  fullArtist,
  fullGenre,
  fullPlaylist,
  fullStation,
  fullTrack,
  genres,
  stations,
  trending,
} from "./fixtures.ts";

// The catalog runs for real, through whichever adapter a test provides.
const story = Story.make(Bafle, { layer: BafleHandlers });

/** A catalog that answers every call with fixtures. */
const WorkingCatalog = MusicCatalog.toLayer(
  Effect.succeed({
    featured: () => Effect.succeed(featured),
    trending: () => Effect.succeed(trending),
    search: () => Effect.succeed(found),
    track: ({ trackId }) =>
      trackId === fullTrack.id
        ? Effect.succeed(fullTrack)
        : Effect.fail(new TrackNotFound({ trackId })),
    album: ({ albumId }) =>
      albumId === fullAlbum.id
        ? Effect.succeed(fullAlbum)
        : Effect.fail(new AlbumNotFound({ albumId })),
    artist: ({ artistId }) =>
      artistId === fullArtist.id
        ? Effect.succeed(fullArtist)
        : Effect.fail(new ArtistNotFound({ artistId })),
    playlist: ({ playlistId }) =>
      playlistId === fullPlaylist.id
        ? Effect.succeed(fullPlaylist)
        : Effect.fail(new PlaylistNotFound({ playlistId })),
    genres: () => Effect.succeed(genres),
    genre: ({ genreId }) =>
      genreId === fullGenre.id
        ? Effect.succeed(fullGenre)
        : Effect.fail(new GenreNotFound({ genreId })),
    stations: () => Effect.succeed(stations),
    station: ({ stationId }) =>
      stationId === fullStation.id
        ? Effect.succeed(fullStation)
        : Effect.fail(new StationNotFound({ stationId })),
  }),
);

/** A catalog whose provider refuses every call. */
const BrokenCatalog = MusicCatalog.toLayer(
  Effect.succeed({
    featured: () => Effect.fail(new CatalogUnavailable()),
    trending: () => Effect.fail(new CatalogUnavailable()),
    search: () => Effect.fail(new CatalogUnavailable()),
    track: () => Effect.fail(new CatalogUnavailable()),
    album: () => Effect.fail(new CatalogUnavailable()),
    artist: () => Effect.fail(new CatalogUnavailable()),
    playlist: () => Effect.fail(new CatalogUnavailable()),
    genres: () => Effect.fail(new CatalogUnavailable()),
    genre: () => Effect.fail(new CatalogUnavailable()),
    stations: () => Effect.fail(new CatalogUnavailable()),
    station: () => Effect.fail(new CatalogUnavailable()),
  }),
);

it("the model is well defined", () => expect(Domain.verify(Bafle)).toEqual([]));

it.effect("Home answers with what the catalog features", () =>
  story(
    Story.query(HomeFeed, {}, featured),
    Story.call(MusicCatalog.featured, undefined),
    Story.returned(MusicCatalog.featured, featured),
  ).pipe(Effect.provide(WorkingCatalog)),
);

it.effect("New answers with what is trending", () =>
  story(
    Story.query(NewMusic, {}, trending),
    Story.call(MusicCatalog.trending, undefined),
    Story.returned(MusicCatalog.trending, trending),
  ).pipe(Effect.provide(WorkingCatalog)),
);

it.effect("Search asks the catalog for the term without the spaces around it", () =>
  story(
    Story.query(CatalogSearch, { term: "  cumbia " }, found),
    Story.call(MusicCatalog.search, { term: "cumbia", limit: SEARCH_LIMIT }),
    Story.returned(MusicCatalog.search, found),
  ).pipe(Effect.provide(WorkingCatalog)),
);

it.effect("a blank search matches nothing, and the catalog is never asked", () =>
  // A call to the catalog that no step accounts for would fail the story.
  story(
    Story.query(CatalogSearch, { term: "" }, noResults),
    Story.query(CatalogSearch, { term: "   " }, noResults),
  ).pipe(Effect.provide(WorkingCatalog)),
);

it.effect("every page says so when the catalog cannot answer", () =>
  story(
    Story.query(HomeFeed, {}),
    Story.rejected(new CatalogUnavailable()),
    Story.call(MusicCatalog.featured, undefined),
    Story.failed(MusicCatalog.featured, new CatalogUnavailable()),
    Story.query(NewMusic, {}),
    Story.rejected(new CatalogUnavailable()),
    Story.call(MusicCatalog.trending, undefined),
    Story.failed(MusicCatalog.trending, new CatalogUnavailable()),
    Story.query(CatalogSearch, { term: "cumbia" }),
    Story.rejected(new CatalogUnavailable()),
    Story.call(MusicCatalog.search, { term: "cumbia" }),
    Story.failed(MusicCatalog.search, new CatalogUnavailable()),
    Story.query(TrackDetail, { trackId: fullTrack.id }),
    Story.rejected(new CatalogUnavailable()),
    Story.call(MusicCatalog.track, { trackId: fullTrack.id }),
    Story.failed(MusicCatalog.track, new CatalogUnavailable()),
    Story.query(AlbumDetail, { albumId: fullAlbum.id }),
    Story.rejected(new CatalogUnavailable()),
    Story.call(MusicCatalog.album, { albumId: fullAlbum.id }),
    Story.failed(MusicCatalog.album, new CatalogUnavailable()),
    Story.query(ArtistDetail, { artistId: fullArtist.id }),
    Story.rejected(new CatalogUnavailable()),
    Story.call(MusicCatalog.artist, { artistId: fullArtist.id }),
    Story.failed(MusicCatalog.artist, new CatalogUnavailable()),
    Story.query(PlaylistDetail, { playlistId: fullPlaylist.id }),
    Story.rejected(new CatalogUnavailable()),
    Story.call(MusicCatalog.playlist, { playlistId: fullPlaylist.id }),
    Story.failed(MusicCatalog.playlist, new CatalogUnavailable()),
    Story.query(GenreList, {}),
    Story.rejected(new CatalogUnavailable()),
    Story.call(MusicCatalog.genres, undefined),
    Story.failed(MusicCatalog.genres, new CatalogUnavailable()),
    Story.query(GenreDetail, { genreId: fullGenre.id }),
    Story.rejected(new CatalogUnavailable()),
    Story.call(MusicCatalog.genre, { genreId: fullGenre.id }),
    Story.failed(MusicCatalog.genre, new CatalogUnavailable()),
    Story.query(StationList, {}),
    Story.rejected(new CatalogUnavailable()),
    Story.call(MusicCatalog.stations, undefined),
    Story.failed(MusicCatalog.stations, new CatalogUnavailable()),
    Story.query(StationDetail, { stationId: fullStation.id }),
    Story.rejected(new CatalogUnavailable()),
    Story.call(MusicCatalog.station, { stationId: fullStation.id }),
    Story.failed(MusicCatalog.station, new CatalogUnavailable()),
  ).pipe(Effect.provide(BrokenCatalog)),
);

it.effect("opening a track answers with the track in full", () =>
  story(
    Story.query(TrackDetail, { trackId: fullTrack.id }, fullTrack),
    Story.call(MusicCatalog.track, { trackId: fullTrack.id }),
    Story.returned(MusicCatalog.track, fullTrack),
  ).pipe(Effect.provide(WorkingCatalog)),
);

it.effect("opening a track the catalog does not have says which one is missing", () => {
  const gone = TrackId.make("tr-gone");
  return story(
    Story.query(TrackDetail, { trackId: gone }),
    Story.rejected(new TrackNotFound({ trackId: gone })),
    Story.call(MusicCatalog.track, { trackId: gone }),
    Story.failed(MusicCatalog.track, new TrackNotFound({ trackId: gone })),
  ).pipe(Effect.provide(WorkingCatalog));
});

it.effect("opening an album answers with the album in full, its tracks in order", () =>
  story(
    Story.query(AlbumDetail, { albumId: fullAlbum.id }, fullAlbum),
    Story.call(MusicCatalog.album, { albumId: fullAlbum.id }),
    Story.returned(MusicCatalog.album, fullAlbum),
  ).pipe(Effect.provide(WorkingCatalog)),
);

it.effect("opening an album the catalog does not have says which one is missing", () => {
  const gone = AlbumId.make("al-gone");
  return story(
    Story.query(AlbumDetail, { albumId: gone }),
    Story.rejected(new AlbumNotFound({ albumId: gone })),
    Story.call(MusicCatalog.album, { albumId: gone }),
    Story.failed(MusicCatalog.album, new AlbumNotFound({ albumId: gone })),
  ).pipe(Effect.provide(WorkingCatalog));
});

it.effect("opening an artist answers with the artist in full, asking for their most played tracks", () =>
  story(
    Story.query(ArtistDetail, { artistId: fullArtist.id }, fullArtist),
    Story.call(MusicCatalog.artist, { artistId: fullArtist.id, topTracks: TOP_TRACKS }),
    Story.returned(MusicCatalog.artist, fullArtist),
  ).pipe(Effect.provide(WorkingCatalog)),
);

it.effect("opening an artist the catalog does not have says which one is missing", () => {
  const gone = ArtistId.make("ar-gone");
  return story(
    Story.query(ArtistDetail, { artistId: gone }),
    Story.rejected(new ArtistNotFound({ artistId: gone })),
    Story.call(MusicCatalog.artist, { artistId: gone }),
    Story.failed(MusicCatalog.artist, new ArtistNotFound({ artistId: gone })),
  ).pipe(Effect.provide(WorkingCatalog));
});

it.effect("opening a playlist answers with the playlist in full, its tracks in order", () =>
  story(
    Story.query(PlaylistDetail, { playlistId: fullPlaylist.id }, fullPlaylist),
    Story.call(MusicCatalog.playlist, { playlistId: fullPlaylist.id }),
    Story.returned(MusicCatalog.playlist, fullPlaylist),
  ).pipe(Effect.provide(WorkingCatalog)),
);

it.effect("opening a playlist the catalog does not have says which one is missing", () => {
  const gone = PlaylistId.make("pl-gone");
  return story(
    Story.query(PlaylistDetail, { playlistId: gone }),
    Story.rejected(new PlaylistNotFound({ playlistId: gone })),
    Story.call(MusicCatalog.playlist, { playlistId: gone }),
    Story.failed(MusicCatalog.playlist, new PlaylistNotFound({ playlistId: gone })),
  ).pipe(Effect.provide(WorkingCatalog));
});

it.effect("Genres answers with every genre the catalog files music under", () =>
  story(
    Story.query(GenreList, {}, genres),
    Story.call(MusicCatalog.genres, undefined),
    Story.returned(MusicCatalog.genres, genres),
  ).pipe(Effect.provide(WorkingCatalog)),
);

it.effect("opening a genre answers with the genre in full, asking for the tracks played most in it", () =>
  story(
    Story.query(GenreDetail, { genreId: fullGenre.id }, fullGenre),
    Story.call(MusicCatalog.genre, { genreId: fullGenre.id, topTracks: GENRE_TOP_TRACKS }),
    Story.returned(MusicCatalog.genre, fullGenre),
  ).pipe(Effect.provide(WorkingCatalog)),
);

it.effect("opening a genre the catalog does not have says which one is missing", () => {
  const gone = GenreId.make("ge-gone");
  return story(
    Story.query(GenreDetail, { genreId: gone }),
    Story.rejected(new GenreNotFound({ genreId: gone })),
    Story.call(MusicCatalog.genre, { genreId: gone }),
    Story.failed(MusicCatalog.genre, new GenreNotFound({ genreId: gone })),
  ).pipe(Effect.provide(WorkingCatalog));
});

it.effect("Radio answers with the stations, under the genre each belongs to", () =>
  story(
    Story.query(StationList, {}, stations),
    Story.call(MusicCatalog.stations, undefined),
    Story.returned(MusicCatalog.stations, stations),
  ).pipe(Effect.provide(WorkingCatalog)),
);

it.effect("opening a station answers with the station in full, asking for as many songs as its page lists", () =>
  story(
    Story.query(StationDetail, { stationId: fullStation.id }, fullStation),
    Story.call(MusicCatalog.station, { stationId: fullStation.id, tracks: STATION_TRACKS }),
    Story.returned(MusicCatalog.station, fullStation),
  ).pipe(Effect.provide(WorkingCatalog)),
);

it.effect("opening a station the catalog does not have says which one is missing", () => {
  const gone = StationId.make("st-gone");
  return story(
    Story.query(StationDetail, { stationId: gone }),
    Story.rejected(new StationNotFound({ stationId: gone })),
    Story.call(MusicCatalog.station, { stationId: gone }),
    Story.failed(MusicCatalog.station, new StationNotFound({ stationId: gone })),
  ).pipe(Effect.provide(WorkingCatalog));
});
