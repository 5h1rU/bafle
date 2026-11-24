import { AlbumId } from "@bafle/domain/Catalog/Album";
import { ArtistId } from "@bafle/domain/Catalog/Artist";
import { MusicCatalog } from "@bafle/domain/Catalog/MusicCatalog.external";
import { PlaylistId } from "@bafle/domain/Catalog/Playlist";
import { TrackId } from "@bafle/domain/Catalog/Track";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  ARTIST_ALBUMS,
  DeezerMusicCatalog,
  SHELF_SIZE,
} from "../src/Deezer/DeezerMusicCatalog.ts";
import {
  type Answer,
  deezerTrack,
  fakeDeezer,
  longAlbumPage,
  longAlbumTracks,
  stocked,
} from "./deezer.ts";

/** The catalog, read from a fake Deezer. */
const catalogOver = (answers: Readonly<Record<string, Answer>>) => {
  const deezer = fakeDeezer(answers);
  return { deezer, layer: DeezerMusicCatalog.pipe(Layer.provide(deezer.layer)) };
};

const artwork = (id: number) => ({
  small: `https://cdn.test/${id}/250.jpg`,
  medium: `https://cdn.test/${id}/500.jpg`,
  large: `https://cdn.test/${id}/1000.jpg`,
});

const daftPunk = { id: "27", name: "Daft Punk" };
const discovery = {
  id: "302127",
  title: "Discovery",
  artist: daftPunk,
  cover: artwork(302127),
  explicit: false,
};
const harder = {
  id: "3135556",
  title: "Harder, Better, Faster, Stronger",
  artist: daftPunk,
  album: { id: "302127", title: "Discovery", cover: artwork(302127) },
  durationSeconds: 224,
  previewUrl: "https://cdn.test/3135556.mp3?exp=1",
  explicit: true,
};

it.effect("featured: Deezer's editorial picks and charts, in Bafle's words", () => {
  const { deezer, layer } = catalogOver(stocked);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const featured = yield* catalog.featured();
    expect(featured).toEqual({
      albums: [discovery],
      playlists: [
        {
          id: "908622995",
          title: "Chill Hits",
          curator: "Deezer Editors",
          picture: artwork(908622995),
          trackCount: 60,
        },
        // No pictures and no curator: no artwork, and Deezer keeps it.
        { id: "5", title: "Untitled", curator: "Deezer", picture: null, trackCount: 0 },
      ],
      artists: [{ ...daftPunk, picture: artwork(27) }],
    });
    expect(deezer.asked.map((url) => url.pathname).sort()).toEqual([
      "/chart/0/artists",
      "/chart/0/playlists",
      "/editorial/0/selection",
    ]);
    const charts = deezer.asked.filter((url) => url.pathname.startsWith("/chart"));
    expect(charts.map((url) => url.searchParams.get("limit"))).toEqual([
      String(SHELF_SIZE),
      String(SHELF_SIZE),
    ]);
  }).pipe(Effect.provide(layer));
});

it.effect("trending: Deezer's track and album charts", () => {
  const { deezer, layer } = catalogOver(stocked);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    expect(yield* catalog.trending()).toEqual({ tracks: [harder], albums: [discovery] });
    expect(deezer.asked.map((url) => url.pathname).sort()).toEqual([
      "/chart/0/albums",
      "/chart/0/tracks",
    ]);
  }).pipe(Effect.provide(layer));
});

it.effect("search: asks each kind for the term, and keeps a kind with no match empty", () => {
  const { deezer, layer } = catalogOver(stocked);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const found = yield* catalog.search({ term: "daft punk", limit: 7 });
    expect(found).toEqual({
      tracks: [harder],
      albums: [discovery],
      artists: [{ ...daftPunk, picture: artwork(27) }],
      playlists: [],
    });
    expect(deezer.asked.map((url) => `${url.pathname}?${url.searchParams}`).sort()).toEqual([
      "/search/album?q=daft+punk&limit=7",
      "/search/artist?q=daft+punk&limit=7",
      "/search/playlist?q=daft+punk&limit=7",
      "/search/track?q=daft+punk&limit=7",
    ]);
  }).pipe(Effect.provide(layer));
});

it.effect("a refusal Deezer sends with status 200 is the catalog being unavailable", () => {
  const { layer } = catalogOver({
    ...stocked,
    "/chart/0/albums": {
      body: { error: { type: "Exception", message: "Quota limit exceeded", code: 4 } },
    },
  });
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const refused = yield* catalog.trending().pipe(Effect.flip);
    expect(refused._tag).toBe("CatalogUnavailable");
  }).pipe(Effect.provide(layer));
});

it.effect("a failing status is the catalog being unavailable", () => {
  const { layer } = catalogOver({
    ...stocked,
    "/search/artist": { body: "Bad Gateway", status: 502 },
  });
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const refused = yield* catalog.search({ term: "daft punk", limit: 7 }).pipe(Effect.flip);
    expect(refused._tag).toBe("CatalogUnavailable");
  }).pipe(Effect.provide(layer));
});

it.effect("an answer in a shape Bafle does not expect is the catalog being unavailable", () => {
  const { layer } = catalogOver({
    ...stocked,
    "/editorial/0/selection": { body: { data: [{ id: "not-a-number", title: 7 }] } },
  });
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const refused = yield* catalog.featured().pipe(Effect.flip);
    expect(refused._tag).toBe("CatalogUnavailable");
  }).pipe(Effect.provide(layer));
});

it.effect("track: one track in full, each credited artist once, the main one first", () => {
  const { deezer, layer } = catalogOver(stocked);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    expect(yield* catalog.track({ trackId: TrackId.make("3135556") })).toEqual({
      ...harder,
      artists: [
        { ...daftPunk, picture: artwork(27) },
        { id: "99", name: "Romanthony", picture: null },
      ],
      releaseDate: "2001-03-12",
      trackNumber: 4,
    });
    expect(deezer.asked.map((url) => url.pathname)).toEqual(["/track/3135556"]);
  }).pipe(Effect.provide(layer));
});

it.effect("track: what Deezer does not know stays unknown, and the main artist is still credited", () => {
  const { layer } = catalogOver({
    "/track/7": { body: { ...deezerTrack, id: 7, release_date: "0000-00-00", track_position: 0 } },
  });
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const track = yield* catalog.track({ trackId: TrackId.make("7") });
    expect(track.releaseDate).toBeNull();
    expect(track.trackNumber).toBeNull();
    expect(track.artists).toEqual([{ ...daftPunk, picture: null }]);
  }).pipe(Effect.provide(layer));
});

it.effect("track: Deezer's \"no data\" is the track not being found", () => {
  const { layer } = catalogOver(stocked);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const refused = yield* catalog.track({ trackId: TrackId.make("404") }).pipe(Effect.flip);
    expect(refused).toMatchObject({ _tag: "TrackNotFound", trackId: "404" });
  }).pipe(Effect.provide(layer));
});

it.effect("track: an id that is not one of Deezer's is not found, and Deezer is never asked", () => {
  const { deezer, layer } = catalogOver(stocked);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const refused = yield* catalog.track({ trackId: TrackId.make("../album/1") }).pipe(Effect.flip);
    expect(refused._tag).toBe("TrackNotFound");
    expect(deezer.asked).toEqual([]);
  }).pipe(Effect.provide(layer));
});

it.effect("track: any other refusal is the catalog being unavailable", () => {
  const { layer } = catalogOver(stocked);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const refused = yield* catalog.track({ trackId: TrackId.make("429") }).pipe(Effect.flip);
    expect(refused._tag).toBe("CatalogUnavailable");
  }).pipe(Effect.provide(layer));
});

it.effect("album: one album in full, its tracks in the album's order", () => {
  const { deezer, layer } = catalogOver(stocked);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    expect(yield* catalog.album({ albumId: AlbumId.make("302127") })).toEqual({
      ...discovery,
      tracks: [{ ...harder, id: "3135553", title: "One More Time" }, harder],
      releaseDate: "2001-03-07",
    });
    // The album came with all of its tracks: nothing more is asked.
    expect(deezer.asked.map((url) => url.pathname)).toEqual(["/album/302127"]);
  }).pipe(Effect.provide(layer));
});

it.effect("album: one longer than what Deezer sends with it is asked for all of its tracks", () => {
  const { deezer, layer } = catalogOver(stocked);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const album = yield* catalog.album({ albumId: AlbumId.make("77") });
    expect(album.tracks.map((track) => track.title)).toEqual(["First", "Second", "Third"]);
    // Deezer leaves the album off each of them: they are on this one all the same.
    expect(album.tracks.map((track) => track.album)).toEqual([
      { id: "77", title: "Discovery", cover: artwork(302127) },
      { id: "77", title: "Discovery", cover: artwork(302127) },
      { id: "77", title: "Discovery", cover: artwork(302127) },
    ]);
    expect(album.tracks.map((track) => track.previewUrl)).toEqual([
      harder.previewUrl,
      harder.previewUrl,
      null,
    ]);
    expect(album.releaseDate).toBeNull();
    expect(deezer.asked.map((url) => `${url.pathname}?${url.searchParams}`)).toEqual([
      "/album/77?",
      "/album/77/tracks?index=0&limit=100",
    ]);
  }).pipe(Effect.provide(layer));
});

it.effect("album: tracks that come a page at a time are read to the last page", () => {
  const [first, second, third] = longAlbumTracks.data;
  const { deezer, layer } = catalogOver({
    ...stocked,
    "/album/77/tracks?index=0&limit=100": {
      body: { data: [first, second], total: 3, next: "https://api.deezer.com/album/77/tracks?index=2" },
    },
    "/album/77/tracks?index=2&limit=100": { body: { data: [third], total: 3 } },
  });
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const album = yield* catalog.album({ albumId: AlbumId.make("77") });
    expect(album.tracks.map((track) => track.title)).toEqual(["First", "Second", "Third"]);
    expect(deezer.asked.map((url) => `${url.pathname}?${url.searchParams}`)).toEqual([
      "/album/77?",
      "/album/77/tracks?index=0&limit=100",
      "/album/77/tracks?index=2&limit=100",
    ]);
  }).pipe(Effect.provide(layer));
});

it.effect("album: a list that ends short of what Deezer says it holds is not passed off as the album", () => {
  const [first, second] = longAlbumTracks.data;
  const { layer } = catalogOver({
    ...stocked,
    // Three in all, two handed over, and no page said to follow.
    "/album/77/tracks": { body: { data: [first, second], total: 3 } },
  });
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const refused = yield* catalog.album({ albumId: AlbumId.make("77") }).pipe(Effect.flip);
    expect(refused._tag).toBe("CatalogUnavailable");
  }).pipe(Effect.provide(layer));
});

it.effect("album: a page said to follow that holds nothing ends the reading, and the album is not whole", () => {
  const [first, second] = longAlbumTracks.data;
  const { deezer, layer } = catalogOver({
    ...stocked,
    "/album/77/tracks?index=0&limit=100": {
      body: { data: [first, second], total: 3, next: "https://api.deezer.com/album/77/tracks?index=2" },
    },
    "/album/77/tracks?index=2&limit=100": {
      body: { data: [], total: 3, next: "https://api.deezer.com/album/77/tracks?index=2" },
    },
  });
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const refused = yield* catalog.album({ albumId: AlbumId.make("77") }).pipe(Effect.flip);
    expect(refused._tag).toBe("CatalogUnavailable");
    // Asked once for the page that held nothing, and not again.
    expect(deezer.asked).toHaveLength(3);
  }).pipe(Effect.provide(layer));
});

it.effect("album: one that does not say how many tracks it has is asked for all of them", () => {
  const { nb_tracks: _count, ...countless } = longAlbumPage;
  const { deezer, layer } = catalogOver({ ...stocked, "/album/77": { body: countless } });
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const album = yield* catalog.album({ albumId: AlbumId.make("77") });
    // What came with it was one track, and nothing said that was all.
    expect(album.tracks.map((track) => track.title)).toEqual(["First", "Second", "Third"]);
    expect(deezer.asked.map((url) => url.pathname)).toEqual(["/album/77", "/album/77/tracks"]);
  }).pipe(Effect.provide(layer));
});

it.effect("album: a long album whose tracks cannot be read is the catalog being unavailable", () => {
  const { "/album/77/tracks": _tracks, ...withoutTracks } = stocked;
  const { layer } = catalogOver(withoutTracks);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const refused = yield* catalog.album({ albumId: AlbumId.make("77") }).pipe(Effect.flip);
    expect(refused._tag).toBe("CatalogUnavailable");
  }).pipe(Effect.provide(layer));
});

it.effect("album: Deezer's \"no data\" is the album not being found", () => {
  const { layer } = catalogOver(stocked);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const refused = yield* catalog.album({ albumId: AlbumId.make("404") }).pipe(Effect.flip);
    expect(refused).toMatchObject({ _tag: "AlbumNotFound", albumId: "404" });
  }).pipe(Effect.provide(layer));
});

it.effect("album: an id that is not one of Deezer's is not found, and Deezer is never asked", () => {
  const { deezer, layer } = catalogOver(stocked);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const refused = yield* catalog.album({ albumId: AlbumId.make("../track/1") }).pipe(Effect.flip);
    expect(refused._tag).toBe("AlbumNotFound");
    expect(deezer.asked).toEqual([]);
  }).pipe(Effect.provide(layer));
});

it.effect("album: any other refusal is the catalog being unavailable", () => {
  const { layer } = catalogOver(stocked);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const refused = yield* catalog.album({ albumId: AlbumId.make("429") }).pipe(Effect.flip);
    expect(refused._tag).toBe("CatalogUnavailable");
  }).pipe(Effect.provide(layer));
});

it.effect("artist: one artist in full, their most played tracks and their albums", () => {
  const { deezer, layer } = catalogOver(stocked);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    expect(yield* catalog.artist({ artistId: ArtistId.make("27"), topTracks: 5 })).toEqual({
      ...daftPunk,
      picture: artwork(27),
      topTracks: [{ ...harder, id: "3135553", title: "One More Time" }, harder],
      albums: [
        discovery,
        // Deezer leaves the artist off each of them: they are this artist's all the same.
        {
          id: "6575789",
          title: "Random Access Memories",
          artist: daftPunk,
          cover: null,
          explicit: false,
        },
      ],
    });
    // Who they are first, then what is theirs: as many tracks as were asked for.
    expect(deezer.asked[0]?.pathname).toBe("/artist/27");
    expect(deezer.asked.map((url) => `${url.pathname}?${url.searchParams}`).sort()).toEqual([
      "/artist/27/albums?limit=" + ARTIST_ALBUMS,
      "/artist/27/top?limit=5",
      "/artist/27?",
    ]);
  }).pipe(Effect.provide(layer));
});

it.effect("artist: one whose tracks or albums cannot be read is the catalog being unavailable", () => {
  const { "/artist/27/albums": _albums, ...withoutAlbums } = stocked;
  const { layer } = catalogOver(withoutAlbums);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const refused = yield* catalog
      .artist({ artistId: ArtistId.make("27"), topTracks: 5 })
      .pipe(Effect.flip);
    expect(refused._tag).toBe("CatalogUnavailable");
  }).pipe(Effect.provide(layer));
});

it.effect("artist: Deezer's \"no data\" is the artist not being found, and nothing of theirs is asked for", () => {
  const { deezer, layer } = catalogOver(stocked);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const refused = yield* catalog
      .artist({ artistId: ArtistId.make("404"), topTracks: 5 })
      .pipe(Effect.flip);
    expect(refused).toMatchObject({ _tag: "ArtistNotFound", artistId: "404" });
    expect(deezer.asked.map((url) => url.pathname)).toEqual(["/artist/404"]);
  }).pipe(Effect.provide(layer));
});

it.effect("artist: an id that is not one of Deezer's is not found, and Deezer is never asked", () => {
  const { deezer, layer } = catalogOver(stocked);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const refused = yield* catalog
      .artist({ artistId: ArtistId.make("../album/1"), topTracks: 5 })
      .pipe(Effect.flip);
    expect(refused._tag).toBe("ArtistNotFound");
    expect(deezer.asked).toEqual([]);
  }).pipe(Effect.provide(layer));
});

it.effect("artist: any other refusal is the catalog being unavailable", () => {
  const { layer } = catalogOver(stocked);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const refused = yield* catalog
      .artist({ artistId: ArtistId.make("429"), topTracks: 5 })
      .pipe(Effect.flip);
    expect(refused._tag).toBe("CatalogUnavailable");
  }).pipe(Effect.provide(layer));
});

it.effect("playlist: one playlist in full, its tracks in the playlist's order", () => {
  const { deezer, layer } = catalogOver(stocked);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    expect(yield* catalog.playlist({ playlistId: PlaylistId.make("908622995") })).toEqual({
      id: "908622995",
      title: "Chill Hits",
      // Asked for by id, Deezer names its keeper another way: it is the same keeper.
      curator: "Deezer Editors",
      picture: artwork(908622995),
      tracks: [{ ...harder, id: "3135553", title: "One More Time" }, harder],
    });
    // The playlist came with all of its tracks: nothing more is asked.
    expect(deezer.asked.map((url) => url.pathname)).toEqual(["/playlist/908622995"]);
  }).pipe(Effect.provide(layer));
});

it.effect("playlist: one longer than what Deezer sends with it is asked for all of its tracks, each kept once", () => {
  const { deezer, layer } = catalogOver(stocked);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const playlist = yield* catalog.playlist({ playlistId: PlaylistId.make("78") });
    expect(playlist.tracks.map((track) => track.title)).toEqual(["First", "Second", "Third"]);
    expect(playlist.tracks.map((track) => track.previewUrl)).toEqual([
      harder.previewUrl,
      harder.previewUrl,
      null,
    ]);
    // Nobody is named as its keeper: Deezer keeps it.
    expect(playlist.curator).toBe("Deezer");
    expect(deezer.asked.map((url) => `${url.pathname}?${url.searchParams}`)).toEqual([
      "/playlist/78?",
      "/playlist/78/tracks?index=0&limit=100",
    ]);
  }).pipe(Effect.provide(layer));
});

it.effect("playlist: a long playlist whose tracks cannot be read is the catalog being unavailable", () => {
  const { "/playlist/78/tracks": _tracks, ...withoutTracks } = stocked;
  const { layer } = catalogOver(withoutTracks);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const refused = yield* catalog
      .playlist({ playlistId: PlaylistId.make("78") })
      .pipe(Effect.flip);
    expect(refused._tag).toBe("CatalogUnavailable");
  }).pipe(Effect.provide(layer));
});

it.effect("playlist: Deezer's \"no data\" is the playlist not being found", () => {
  const { layer } = catalogOver(stocked);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const refused = yield* catalog
      .playlist({ playlistId: PlaylistId.make("404") })
      .pipe(Effect.flip);
    expect(refused).toMatchObject({ _tag: "PlaylistNotFound", playlistId: "404" });
  }).pipe(Effect.provide(layer));
});

it.effect("playlist: an id that is not one of Deezer's is not found, and Deezer is never asked", () => {
  const { deezer, layer } = catalogOver(stocked);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const refused = yield* catalog
      .playlist({ playlistId: PlaylistId.make("../track/1") })
      .pipe(Effect.flip);
    expect(refused._tag).toBe("PlaylistNotFound");
    expect(deezer.asked).toEqual([]);
  }).pipe(Effect.provide(layer));
});

it.effect("playlist: any other refusal is the catalog being unavailable", () => {
  const { layer } = catalogOver(stocked);
  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const refused = yield* catalog
      .playlist({ playlistId: PlaylistId.make("429") })
      .pipe(Effect.flip);
    expect(refused._tag).toBe("CatalogUnavailable");
  }).pipe(Effect.provide(layer));
});
