import * as Domain from "@alchemy.run/domain";
import { Bafle, BafleHandlers } from "@bafle/domain/Bafle.model";
import { AlbumId } from "@bafle/domain/Catalog/Album";
import { AlbumNotFound } from "@bafle/domain/Catalog/AlbumNotFound.rejection";
import { ArtistId } from "@bafle/domain/Catalog/Artist";
import { ArtistNotFound } from "@bafle/domain/Catalog/ArtistNotFound.rejection";
import { CatalogUnavailable } from "@bafle/domain/Catalog/CatalogUnavailable.rejection";
import { GenreId } from "@bafle/domain/Catalog/Genre";
import { GenreNotFound } from "@bafle/domain/Catalog/GenreNotFound.rejection";
import { MusicCatalog } from "@bafle/domain/Catalog/MusicCatalog.external";
import { PlaylistId } from "@bafle/domain/Catalog/Playlist";
import { PlaylistNotFound } from "@bafle/domain/Catalog/PlaylistNotFound.rejection";
import { StationId } from "@bafle/domain/Catalog/Station";
import { StationNotFound } from "@bafle/domain/Catalog/StationNotFound.rejection";
import { TrackId } from "@bafle/domain/Catalog/Track";
import { TrackNotFound } from "@bafle/domain/Catalog/TrackNotFound.rejection";
import { ListenerApi } from "@bafle/domain/ListenerApi.api";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpEffect from "effect/http/HttpEffect";
import * as Layer from "effect/Layer";
import { Catalog } from "../src/catalog.ts";
import {
  allGenres,
  allStations,
  featured,
  found,
  fullAlbum,
  fullArtist,
  fullGenre,
  fullPlaylist,
  fullStation,
  fullTrack,
  trending,
} from "./fixtures.ts";

// The app reaches the Api over plain HTTP (see entry.ts). These run the app's own query Commands
// through that protocol against the Api as the Worker serves it, with only the network replaced.

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
    genres: () => Effect.succeed(allGenres),
    genre: ({ genreId }) =>
      genreId === fullGenre.id
        ? Effect.succeed(fullGenre)
        : Effect.fail(new GenreNotFound({ genreId })),
    stations: () => Effect.succeed(allStations),
    station: ({ stationId }) =>
      stationId === fullStation.id
        ? Effect.succeed(fullStation)
        : Effect.fail(new StationNotFound({ stationId })),
  }),
);

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

type Fetch = typeof globalThis.fetch;

/** The app's client, over the HTTP protocol, with `fetch` as its way to the server. */
const clientOver = (fetch: Fetch) =>
  ListenerApi.layerClientHttp("https://bafle.test/api").pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
  );

/** The client connected to Bafle hosted in memory, reading the given catalog. */
const connectedTo = (catalog: typeof WorkingCatalog) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const api = yield* ListenerApi;
      const serve = HttpEffect.toWebHandler(api.fetch);
      return clientOver((input, init) => serve(new Request(input, init)));
    }),
  ).pipe(
    Layer.provide(
      Bafle.layer(BafleHandlers).pipe(Layer.provide(Layer.mergeAll(Domain.InMemory, catalog))),
    ),
  );

it.live("the queries are answered over plain HTTP", () =>
  Effect.gen(function* () {
    expect(yield* Catalog.HomeFeed({ input: {}, requestId: "page:0" }).effect).toEqual(
      Catalog.Message.SucceededHomeFeed({ requestId: "page:0", result: featured }),
    );
    expect(yield* Catalog.NewMusic({ input: {}, requestId: "page:1" }).effect).toEqual(
      Catalog.Message.SucceededNewMusic({ requestId: "page:1", result: trending }),
    );
    expect(
      yield* Catalog.CatalogSearch({ input: { term: "daft" }, requestId: "page:2" }).effect,
    ).toEqual(Catalog.Message.SucceededCatalogSearch({ requestId: "page:2", result: found }));
    expect(
      yield* Catalog.TrackDetail({ input: { trackId: fullTrack.id }, requestId: "page:3" }).effect,
    ).toEqual(Catalog.Message.SucceededTrackDetail({ requestId: "page:3", result: fullTrack }));
    expect(
      yield* Catalog.AlbumDetail({ input: { albumId: fullAlbum.id }, requestId: "page:4" }).effect,
    ).toEqual(Catalog.Message.SucceededAlbumDetail({ requestId: "page:4", result: fullAlbum }));
    expect(
      yield* Catalog.ArtistDetail({ input: { artistId: fullArtist.id }, requestId: "page:5" })
        .effect,
    ).toEqual(Catalog.Message.SucceededArtistDetail({ requestId: "page:5", result: fullArtist }));
    expect(
      yield* Catalog.PlaylistDetail({
        input: { playlistId: fullPlaylist.id },
        requestId: "page:6",
      }).effect,
    ).toEqual(
      Catalog.Message.SucceededPlaylistDetail({ requestId: "page:6", result: fullPlaylist }),
    );
    expect(yield* Catalog.GenreList({ input: {}, requestId: "page:7" }).effect).toEqual(
      Catalog.Message.SucceededGenreList({ requestId: "page:7", result: allGenres }),
    );
    expect(
      yield* Catalog.GenreDetail({ input: { genreId: fullGenre.id }, requestId: "page:8" }).effect,
    ).toEqual(Catalog.Message.SucceededGenreDetail({ requestId: "page:8", result: fullGenre }));
    expect(yield* Catalog.StationList({ input: {}, requestId: "page:9" }).effect).toEqual(
      Catalog.Message.SucceededStationList({ requestId: "page:9", result: allStations }),
    );
    expect(
      yield* Catalog.StationDetail({ input: { stationId: fullStation.id }, requestId: "page:10" })
        .effect,
    ).toEqual(Catalog.Message.SucceededStationDetail({ requestId: "page:10", result: fullStation }));
  }).pipe(Effect.provide(connectedTo(WorkingCatalog))),
);

it.live("a track the catalog does not have is told apart from a catalog that cannot answer", () =>
  Effect.gen(function* () {
    const trackId = TrackId.make("tr-404");
    const missing = yield* Catalog.TrackDetail({ input: { trackId }, requestId: "page:0" }).effect;
    expect(missing).toMatchObject({
      _tag: "FailedTrackDetail",
      requestId: "page:0",
      failure: { _tag: "Rejected", rejection: { _tag: "TrackNotFound", trackId } },
    });
  }).pipe(Effect.provide(connectedTo(WorkingCatalog))),
);

it.live("an album the catalog does not have is told apart too", () =>
  Effect.gen(function* () {
    const albumId = AlbumId.make("al-404");
    const missing = yield* Catalog.AlbumDetail({ input: { albumId }, requestId: "page:0" }).effect;
    expect(missing).toMatchObject({
      _tag: "FailedAlbumDetail",
      requestId: "page:0",
      failure: { _tag: "Rejected", rejection: { _tag: "AlbumNotFound", albumId } },
    });
  }).pipe(Effect.provide(connectedTo(WorkingCatalog))),
);

it.live("so are an artist and a playlist the catalog does not have", () =>
  Effect.gen(function* () {
    const artistId = ArtistId.make("ar-404");
    const noArtist = yield* Catalog.ArtistDetail({ input: { artistId }, requestId: "page:0" })
      .effect;
    expect(noArtist).toMatchObject({
      _tag: "FailedArtistDetail",
      requestId: "page:0",
      failure: { _tag: "Rejected", rejection: { _tag: "ArtistNotFound", artistId } },
    });

    const playlistId = PlaylistId.make("pl-404");
    const noPlaylist = yield* Catalog.PlaylistDetail({
      input: { playlistId },
      requestId: "page:1",
    }).effect;
    expect(noPlaylist).toMatchObject({
      _tag: "FailedPlaylistDetail",
      requestId: "page:1",
      failure: { _tag: "Rejected", rejection: { _tag: "PlaylistNotFound", playlistId } },
    });
  }).pipe(Effect.provide(connectedTo(WorkingCatalog))),
);

it.live("so are a genre and a station the catalog does not have", () =>
  Effect.gen(function* () {
    const genreId = GenreId.make("ge-404");
    const noGenre = yield* Catalog.GenreDetail({ input: { genreId }, requestId: "page:0" }).effect;
    expect(noGenre).toMatchObject({
      _tag: "FailedGenreDetail",
      requestId: "page:0",
      failure: { _tag: "Rejected", rejection: { _tag: "GenreNotFound", genreId } },
    });

    const stationId = StationId.make("st-404");
    const noStation = yield* Catalog.StationDetail({
      input: { stationId },
      requestId: "page:1",
    }).effect;
    expect(noStation).toMatchObject({
      _tag: "FailedStationDetail",
      requestId: "page:1",
      failure: { _tag: "Rejected", rejection: { _tag: "StationNotFound", stationId } },
    });
  }).pipe(Effect.provide(connectedTo(WorkingCatalog))),
);

it.live("the catalog's refusal crosses the wire as the typed rejection", () =>
  Effect.gen(function* () {
    const refused = yield* Catalog.HomeFeed({ input: {}, requestId: "page:0" }).effect;
    expect(refused).toMatchObject({
      _tag: "FailedHomeFeed",
      requestId: "page:0",
      failure: { _tag: "Rejected", rejection: { _tag: "CatalogUnavailable" } },
    });
  }).pipe(Effect.provide(connectedTo(BrokenCatalog))),
);

it.live("a server that cannot be reached is an Unknown failure, not a crash", () =>
  Effect.gen(function* () {
    const lost = yield* Catalog.NewMusic({ input: {}, requestId: "page:0" }).effect;
    expect(lost).toEqual(
      Catalog.Message.FailedNewMusic({ requestId: "page:0", failure: { _tag: "Unknown" } }),
    );
  }).pipe(Effect.provide(clientOver(() => Promise.reject(new TypeError("Failed to fetch"))))),
);

it.live("a server that answers with an error page is an Unknown failure too", () =>
  Effect.gen(function* () {
    const lost = yield* Catalog.NewMusic({ input: {}, requestId: "page:0" }).effect;
    expect(lost).toEqual(
      Catalog.Message.FailedNewMusic({ requestId: "page:0", failure: { _tag: "Unknown" } }),
    );
  }).pipe(
    Effect.provide(
      clientOver(() => Promise.resolve(new Response("Bad Gateway", { status: 502 }))),
    ),
  ),
);
