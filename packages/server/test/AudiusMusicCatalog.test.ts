import { AlbumId } from "@bafle/domain/Catalog/Album";
import { ArtistId } from "@bafle/domain/Catalog/Artist";
import { GenreId } from "@bafle/domain/Catalog/Genre";
import { MusicCatalog } from "@bafle/domain/Catalog/MusicCatalog.external";
import { PlaylistId } from "@bafle/domain/Catalog/Playlist";
import { StationId } from "@bafle/domain/Catalog/Station";
import { TrackId } from "@bafle/domain/Catalog/Track";
import { expect, it } from "@effect/vitest";
import * as Duration from "effect/Duration";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";
import {
  ARTIST_ALBUMS,
  AudiusMusicCatalog,
  GENRES_SHOWN,
  LISTS_FRESH_FOR,
  SHELF_SIZE,
  STATION_DEALS_FROM,
} from "../src/Audius/AudiusMusicCatalog.ts";
import { AUDIUS_API, genreIdOf } from "../src/Audius/translate.ts";
import { KeptRepliesInMemory } from "../src/Kept/KeptReplies.ts";
import {
  NoPicturePlaceholders,
  type Picture,
  PicturePlaceholders,
} from "../src/Placeholder/PicturePlaceholders.ts";
import {
  type Route,
  audiusAlbum,
  audiusAlbumTrack,
  audiusPlaylist,
  audiusTrack,
  audiusUser,
  data,
  fakeAudius,
  trackNumbered,
} from "./audius.ts";

/** The bearer token the catalog is given, as Alchemy gives it the one in `.env`. */
const TOKEN = "token-of-bafle";

/** The environment the catalog is built in: `.env`'s settings, or none. */
const environment = (env: Record<string, string>) =>
  ConfigProvider.layer(ConfigProvider.fromEnvRecord(env));

/** The catalog, read from a fake Audius, as Bafle's app, with `placeholders` for its pictures. */
const catalogOver = (
  routes: ReadonlyArray<Route>,
  placeholders: Layer.Layer<PicturePlaceholders> = NoPicturePlaceholders,
) => {
  const audius = fakeAudius(routes);
  return {
    audius,
    layer: AudiusMusicCatalog.pipe(
      Layer.provide(
        Layer.mergeAll(
          audius.layer,
          KeptRepliesInMemory,
          placeholders,
          environment({ AUDIUS_BEARER_TOKEN: TOKEN }),
        ),
      ),
    ),
  };
};

/** A picture as Bafle hands it over: on Audius's own node, whichever node Audius named. */
const artwork = (cid: string) => ({
  small: `https://creatornode.audius.co/content/${cid}/150x150.jpg`,
  medium: `https://creatornode.audius.co/content/${cid}/480x480.jpg`,
  large: `https://creatornode.audius.co/content/${cid}/1000x1000.jpg`,
  placeholder: null,
});

const raar = { id: "144099", name: "Raar" };

/** `audiusTrack`, on no album: the single of that one track. */
const jack = {
  id: "1174250038",
  title: "Jack Got Jacked",
  artist: raar,
  album: { id: "single-1174250038", title: "Jack Got Jacked", cover: artwork("jack") },
  durationSeconds: 173,
  previewUrl: `${AUDIUS_API}/tracks/1174250038/stream`,
  explicit: false,
};

/** `audiusAlbumTrack`, on its album. */
const calling = {
  id: "2088271306",
  title: "Calling",
  artist: raar,
  album: { id: "101196116", title: "Redefined", cover: artwork("jack") },
  durationSeconds: 201,
  previewUrl: `${AUDIUS_API}/tracks/2088271306/stream`,
  explicit: true,
};

const redefined = {
  id: "101196116",
  title: "Redefined",
  artist: raar,
  cover: artwork("redefined"),
  explicit: false,
};

const hotAndNew = {
  id: "1855049980",
  title: "Hot & New",
  curator: "Hot & New Archives",
  picture: artwork("hot"),
  trackCount: 20,
};

const raarSummary = { ...raar, picture: artwork("raar") };

const featuredRoutes: ReadonlyArray<Route> = [
  { path: "/playlists/trending", params: { type: "album" }, answer: data([audiusAlbum]) },
  { path: "/playlists/trending", params: { type: "playlist" }, answer: data([audiusPlaylist]) },
  { path: "/users/top", answer: data([audiusUser]) },
];

it.effect(
  "featured: Audius's trending albums and playlists and its top artists, in Bafle's words",
  () => {
    const { audius, layer } = catalogOver(featuredRoutes);
    return Effect.gen(function* () {
      const catalog = yield* MusicCatalog;
      expect(yield* catalog.featured()).toEqual({
        albums: [redefined],
        playlists: [hotAndNew],
        artists: [raarSummary],
      });
      expect(audius.asked.map((url) => url.searchParams.get("limit"))).toEqual(
        Array(3).fill(String(SHELF_SIZE)),
      );
    }).pipe(Effect.provide(layer));
  },
);

it.effect(
  "featured: kept for a while under a name of Audius's own, and asked again once old",
  () => {
    const { audius, layer } = catalogOver(featuredRoutes);
    return Effect.gen(function* () {
      const catalog = yield* MusicCatalog;
      const first = yield* catalog.featured();
      expect(yield* catalog.featured()).toEqual(first);
      expect(audius.asked).toHaveLength(3);

      yield* TestClock.adjust(Duration.sum(LISTS_FRESH_FOR, Duration.minutes(1)));
      expect(yield* catalog.featured()).toEqual(first);
      expect(audius.asked).toHaveLength(6);
    }).pipe(Effect.provide(layer));
  },
);

it.effect(
  "trending: a track on no album is its own single, played from Audius's address for it",
  () => {
    const { layer } = catalogOver([
      { path: "/tracks/trending", answer: data([audiusTrack, audiusAlbumTrack]) },
      { path: "/playlists/trending", params: { type: "album" }, answer: data([audiusAlbum]) },
    ]);
    return Effect.gen(function* () {
      const catalog = yield* MusicCatalog;
      expect(yield* catalog.trending()).toEqual({ tracks: [jack, calling], albums: [redefined] });
    }).pipe(Effect.provide(layer));
  },
);

it.effect("a track not streamed to everyone plays its excerpt, or has nothing to play", () => {
  const sold = { ...audiusTrack, track_id: 7, access: { stream: false, download: false } };
  const { layer } = catalogOver([
    {
      path: "/tracks/trending",
      answer: data([
        { ...sold, preview_cid: "excerpt" },
        { ...sold, track_id: 8 },
        { ...audiusTrack, track_id: 9, is_streamable: false },
      ]),
    },
    { path: "/playlists/trending", answer: data([]) },
  ]);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const { tracks } = yield* catalog.trending();
    expect(tracks.map((track) => track.previewUrl)).toEqual([
      `${AUDIUS_API}/tracks/7/stream?preview=true`,
      null,
      null,
    ]);
  }).pipe(Effect.provide(layer));
});

it.effect("search: one question for every kind, each kind as Bafle names it", () => {
  const { audius, layer } = catalogOver([
    {
      path: "/search/full",
      params: { query: "raar", limit: "5" },
      answer: data({
        tracks: [audiusTrack],
        albums: [audiusAlbum],
        users: [audiusUser],
        playlists: [audiusPlaylist],
        saved_tracks: [],
      }),
    },
  ]);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    expect(yield* catalog.search({ term: "raar", limit: 5 })).toEqual({
      tracks: [jack],
      albums: [redefined],
      artists: [raarSummary],
      playlists: [hotAndNew],
    });
    expect(audius.asked).toHaveLength(1);
  }).pipe(Effect.provide(layer));
});

it.effect("a failing status is the catalog being unavailable", () => {
  const { layer } = catalogOver([
    { path: "/search/full", answer: { body: { error: "boom" }, status: 500 } },
  ]);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const refused = yield* catalog.search({ term: "x", limit: 5 }).pipe(Effect.flip);
    expect(refused._tag).toBe("CatalogUnavailable");
  }).pipe(Effect.provide(layer));
});

it.effect("every question carries the bearer token of Bafle's app", () => {
  const { audius, layer } = catalogOver(featuredRoutes);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    yield* catalog.featured();
    expect(audius.askedAs).toEqual(Array(3).fill(`Bearer ${TOKEN}`));
  }).pipe(Effect.provide(layer));
});

it.effect("a catalog with no bearer token cannot be built", () => {
  const layer = AudiusMusicCatalog.pipe(
    Layer.provide(
      Layer.mergeAll(
        fakeAudius([]).layer,
        KeptRepliesInMemory,
        NoPicturePlaceholders,
        environment({}),
      ),
    ),
  );
  return Effect.gen(function* () {
    const failure = yield* Layer.build(layer).pipe(Effect.scoped, Effect.flip);
    expect(String(failure)).toContain("AUDIUS_BEARER_TOKEN");
  });
});

it.effect("each picture is given its likeness, worked out from its smallest JPEG", () => {
  const asked: Array<Picture> = [];
  const placeholders = Layer.succeed(PicturePlaceholders, {
    likenesses: (pictures) =>
      Effect.sync(() => {
        asked.push(...pictures);
        return new Map([[artwork("jack").small, "likeness-of-jack"]]);
      }),
  });
  const { layer } = catalogOver(
    [{ path: "/tracks/1174250038", answer: data(audiusTrack) }],
    placeholders,
  );
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const track = yield* catalog.track({ trackId: TrackId.make("1174250038") });
    expect(track.album.cover?.placeholder).toBe("likeness-of-jack");
    expect(track.artists[0]?.picture?.placeholder).toBeNull();
    expect(asked).toEqual([
      { key: artwork("jack").small, source: artwork("jack").small },
      { key: artwork("raar").small, source: artwork("raar").small },
    ]);
  }).pipe(Effect.provide(layer));
});

it.effect("track: one track in full", () => {
  const { layer } = catalogOver([{ path: "/tracks/1174250038", answer: data(audiusTrack) }]);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    expect(yield* catalog.track({ trackId: TrackId.make("1174250038") })).toEqual({
      ...jack,
      artists: [raarSummary],
      releaseDate: "2026-11-23",
      trackNumber: null,
    });
  }).pipe(Effect.provide(layer));
});

it.effect(
  "track: an id that is no number of Audius's is not found, and Audius is not asked",
  () => {
    const { audius, layer } = catalogOver([]);
    return Effect.gen(function* () {
      const catalog = yield* MusicCatalog;
      for (const trackId of ["M2l69g9", "0", ""]) {
        const missing = yield* catalog.track({ trackId: TrackId.make(trackId) }).pipe(Effect.flip);
        expect(missing._tag).toBe("TrackNotFound");
      }
      expect(audius.asked).toEqual([]);
    }).pipe(Effect.provide(layer));
  },
);

it.effect("track: Audius's 404 is the track not being found", () => {
  const { layer } = catalogOver([]);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const missing = yield* catalog.track({ trackId: TrackId.make("999") }).pipe(Effect.flip);
    expect(missing._tag).toBe("TrackNotFound");
  }).pipe(Effect.provide(layer));
});

it.effect("album: one album in full, each track on it with its own cover", () => {
  const { layer } = catalogOver([
    { path: "/playlists/101196116", answer: data([audiusAlbum]) },
    { path: "/playlists/101196116/tracks", answer: data([audiusAlbumTrack, audiusAlbumTrack]) },
  ]);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    expect(yield* catalog.album({ albumId: AlbumId.make("101196116") })).toEqual({
      ...redefined,
      tracks: [calling],
      releaseDate: "2026-07-02",
    });
  }).pipe(Effect.provide(layer));
});

it.effect("album: a single is the album of its one track", () => {
  const { layer } = catalogOver([{ path: "/tracks/1174250038", answer: data(audiusTrack) }]);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    expect(yield* catalog.album({ albumId: AlbumId.make("single-1174250038") })).toEqual({
      id: "single-1174250038",
      title: "Jack Got Jacked",
      artist: raar,
      cover: artwork("jack"),
      explicit: false,
      tracks: [jack],
      releaseDate: "2026-11-23",
    });
  }).pipe(Effect.provide(layer));
});

it.effect("album: a playlist that is no album, or a single of no track, is not found", () => {
  const { layer } = catalogOver([
    { path: "/playlists/1855049980", answer: data([audiusPlaylist]) },
  ]);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    for (const albumId of ["1855049980", "single-999", "single-x", "VJYqM9"]) {
      const missing = yield* catalog.album({ albumId: AlbumId.make(albumId) }).pipe(Effect.flip);
      expect(missing._tag).toBe("AlbumNotFound");
    }
  }).pipe(Effect.provide(layer));
});

it.effect("artist: their most played tracks, their albums and then their singles", () => {
  const { audius, layer } = catalogOver([
    { path: "/users/144099", answer: data(audiusUser) },
    { path: "/users/144099/tracks", params: { sort: "plays" }, answer: data([audiusTrack]) },
    { path: "/users/144099/albums", answer: data([audiusAlbum]) },
    {
      path: "/users/144099/tracks",
      params: { sort: "date" },
      answer: data([audiusAlbumTrack, audiusTrack]),
    },
  ]);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    expect(yield* catalog.artist({ artistId: ArtistId.make("144099"), topTracks: 10 })).toEqual({
      ...raarSummary,
      topTracks: [jack],
      albums: [
        redefined,
        {
          id: "single-1174250038",
          title: "Jack Got Jacked",
          artist: raar,
          cover: artwork("jack"),
          explicit: false,
        },
      ],
    });
    const plays = audius.asked.find((url) => url.searchParams.get("sort") === "plays");
    expect(plays?.searchParams.get("limit")).toBe("10");
    const albums = audius.asked.find((url) => url.pathname.endsWith("/albums"));
    expect(albums?.searchParams.get("limit")).toBe(String(ARTIST_ALBUMS));
  }).pipe(Effect.provide(layer));
});

it.effect("artist: one Audius does not have is not found, and nothing of theirs is asked", () => {
  const { audius, layer } = catalogOver([]);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const missing = yield* catalog
      .artist({ artistId: ArtistId.make("999"), topTracks: 10 })
      .pipe(Effect.flip);
    expect(missing._tag).toBe("ArtistNotFound");
    expect(audius.asked).toHaveLength(1);
  }).pipe(Effect.provide(layer));
});

it.effect("playlist: one playlist in full, each track once", () => {
  const { layer } = catalogOver([
    { path: "/playlists/1855049980", answer: data([audiusPlaylist]) },
    { path: "/playlists/1855049980/tracks", answer: data([audiusTrack, audiusTrack]) },
  ]);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const { trackCount: _, ...summary } = hotAndNew;
    expect(yield* catalog.playlist({ playlistId: PlaylistId.make("1855049980") })).toEqual({
      ...summary,
      tracks: [jack],
    });
  }).pipe(Effect.provide(layer));
});

it.effect("playlist: one Audius does not have is not found", () => {
  const { layer } = catalogOver([{ path: "/playlists/5", answer: data([]) }]);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    for (const playlistId of ["5", "6", "x"]) {
      const missing = yield* catalog
        .playlist({ playlistId: PlaylistId.make(playlistId) })
        .pipe(Effect.flip);
      expect(missing._tag).toBe("PlaylistNotFound");
    }
  }).pipe(Effect.provide(layer));
});

/** Audius counts every genre an artist wrote: its own, and some that are no music. */
const counted = data([
  { name: "Hip-Hop/Rap", count: 9 },
  { name: "Podcasts", count: 8 },
  { name: "Electronic", count: 7 },
  { name: "Origami Stupid Edit", count: 6 },
  { name: "R&B/Soul", count: 5 },
]);

it.effect(
  "genres: Audius's music genres, most filed first, each with what is played most in it",
  () => {
    const { audius, layer } = catalogOver([
      { path: "/genres/popular", answer: counted },
      {
        path: "/tracks/trending",
        params: { genre: "Hip-Hop/Rap" },
        answer: data([trackNumbered(1)]),
      },
      {
        path: "/tracks/trending",
        params: { genre: "Electronic" },
        answer: data([trackNumbered(2)]),
      },
      { path: "/tracks/trending", answer: data([]) },
    ]);
    return Effect.gen(function* () {
      const catalog = yield* MusicCatalog;
      const { genres } = yield* catalog.genres();
      expect(genres).toHaveLength(GENRES_SHOWN);
      expect(genres.slice(0, 4)).toEqual([
        { id: "hip-hop-rap", name: "Hip-Hop/Rap", picture: artwork("cover-1") },
        { id: "electronic", name: "Electronic", picture: artwork("cover-2") },
        { id: "r-b-soul", name: "R&B/Soul", picture: null },
        // Those Audius did not count follow, in the order Bafle lists them.
        { id: "metal", name: "Metal", picture: null },
      ]);
      expect(genres.map((genre) => genre.name)).not.toContain("Podcasts");
      const pictures = audius.asked.filter((url) => url.pathname.endsWith("/tracks/trending"));
      expect(pictures).toHaveLength(GENRES_SHOWN);
      expect(new Set(pictures.map((url) => url.searchParams.get("time")))).toEqual(
        new Set(["week"]),
      );
    }).pipe(Effect.provide(layer));
  },
);

it.effect(
  "genre: what is played most in it, with shelves of its albums, artists and playlists",
  () => {
    const { layer } = catalogOver([
      {
        path: "/tracks/trending",
        params: { genre: "Electronic", limit: "10" },
        answer: data([audiusTrack]),
      },
      {
        path: "/search/full",
        params: { genre: "Electronic", kind: "albums", sort_method: "popular" },
        answer: data({ albums: [audiusAlbum] }),
      },
      { path: "/users/genre/top", params: { genre: "Electronic" }, answer: data([audiusUser]) },
      {
        path: "/playlists/search",
        params: { genre: "Electronic", sort_method: "popular" },
        answer: data([audiusPlaylist, audiusAlbum]),
      },
    ]);
    return Effect.gen(function* () {
      const catalog = yield* MusicCatalog;
      expect(yield* catalog.genre({ genreId: GenreId.make("electronic"), topTracks: 10 })).toEqual({
        id: "electronic",
        name: "Electronic",
        picture: artwork("jack"),
        topTracks: [jack],
        albums: [redefined],
        artists: [raarSummary],
        playlists: [hotAndNew],
      });
    }).pipe(Effect.provide(layer));
  },
);

it.effect("genre: a name Bafle does not list as one of Audius's genres is not found", () => {
  const { audius, layer } = catalogOver([]);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    for (const genreId of ["podcasts", "Electronic", "0", genreIdOf("Origami Stupid Edit")]) {
      const missing = yield* catalog
        .genre({ genreId: GenreId.make(genreId), topTracks: 10 })
        .pipe(Effect.flip);
      expect(missing._tag).toBe("GenreNotFound");
    }
    expect(audius.asked).toEqual([]);
  }).pipe(Effect.provide(layer));
});

it.effect("stations: three for each genre with music, each with a cover of its own", () => {
  const week = [trackNumbered(1), trackNumbered(2)];
  const { layer } = catalogOver([
    { path: "/genres/popular", answer: counted },
    { path: "/tracks/trending", params: { genre: "Electronic", limit: "3" }, answer: data(week) },
    { path: "/tracks/trending", answer: data([]) },
  ]);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    expect(yield* catalog.stations()).toEqual({
      groups: [
        {
          genre: { id: "electronic", name: "Electronic" },
          stations: [
            { id: "week-electronic", title: "Electronic this week", picture: artwork("cover-1") },
            { id: "month-electronic", title: "Electronic this month", picture: artwork("cover-2") },
            // Fewer tracks than stations: the first stands in.
            {
              id: "alltime-electronic",
              title: "Electronic of all time",
              picture: artwork("cover-1"),
            },
          ],
        },
      ],
    });
  }).pipe(Effect.provide(layer));
});

it.effect("station: dealt from what is played most over its window, with its tile's cover", () => {
  const playedThisMonth = Array.from({ length: 40 }, (_, n) => trackNumbered(n + 100));
  const { audius, layer } = catalogOver([
    {
      path: "/tracks/trending",
      params: { genre: "Electronic", time: "month" },
      answer: data(playedThisMonth),
    },
    {
      path: "/tracks/trending",
      params: { genre: "Electronic", time: "week" },
      answer: data([trackNumbered(1), trackNumbered(2)]),
    },
  ]);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const station = yield* catalog.station({
      stationId: StationId.make("month-electronic"),
      tracks: 25,
    });
    expect(station.title).toBe("Electronic this month");
    expect(station.picture).toEqual(artwork("cover-2"));
    expect(station.tracks).toHaveLength(25);
    const dealtFrom = new Set(playedThisMonth.map((track) => String(track.track_id)));
    expect(station.tracks.every((track) => dealtFrom.has(track.id))).toBe(true);
    const month = audius.asked.find((url) => url.searchParams.get("time") === "month");
    expect(month?.searchParams.get("limit")).toBe(String(STATION_DEALS_FROM));
  }).pipe(Effect.provide(layer));
});

it.effect("station: one that names no window and genre of Bafle's is not found", () => {
  const { audius, layer } = catalogOver([]);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    for (const stationId of ["electronic", "year-electronic", "week-podcasts", "week-", "37151"]) {
      const missing = yield* catalog
        .station({ stationId: StationId.make(stationId), tracks: 25 })
        .pipe(Effect.flip);
      expect(missing._tag).toBe("StationNotFound");
    }
    expect(audius.asked).toEqual([]);
  }).pipe(Effect.provide(layer));
});
