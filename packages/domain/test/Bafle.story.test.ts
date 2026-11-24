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
import { HomeFeed } from "../src/Catalog/HomeFeed.query.ts";
import { MusicCatalog } from "../src/Catalog/MusicCatalog.external.ts";
import { NewMusic } from "../src/Catalog/NewMusic.query.ts";
import { PlaylistId } from "../src/Catalog/Playlist.ts";
import { PlaylistDetail } from "../src/Catalog/PlaylistDetail.query.ts";
import { PlaylistNotFound } from "../src/Catalog/PlaylistNotFound.rejection.ts";
import { TrackId } from "../src/Catalog/Track.ts";
import { TrackDetail } from "../src/Catalog/TrackDetail.query.ts";
import { TrackNotFound } from "../src/Catalog/TrackNotFound.rejection.ts";
import {
  featured,
  found,
  fullAlbum,
  fullArtist,
  fullPlaylist,
  fullTrack,
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
