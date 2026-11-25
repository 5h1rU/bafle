import * as Domain from "@alchemy.run/domain";
import { Bafle, BafleHandlers } from "@bafle/domain/Bafle.model";
import { AlbumId } from "@bafle/domain/Catalog/Album";
import { ArtistId } from "@bafle/domain/Catalog/Artist";
import { TOP_TRACKS } from "@bafle/domain/Catalog/ArtistDetail.query";
import { GenreId } from "@bafle/domain/Catalog/Genre";
import { GENRE_TOP_TRACKS } from "@bafle/domain/Catalog/GenreDetail.query";
import { PlaylistId } from "@bafle/domain/Catalog/Playlist";
import { StationId } from "@bafle/domain/Catalog/Station";
import { STATION_TRACKS } from "@bafle/domain/Catalog/StationDetail.query";
import { TrackId } from "@bafle/domain/Catalog/Track";
import { ListenerApi } from "@bafle/domain/ListenerApi.api";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { DeezerMusicCatalog, SHELF_SIZE } from "../src/Deezer/DeezerMusicCatalog.ts";
import { type Answer, fakeDeezer, stocked } from "./deezer.ts";

/** Bafle hosted in memory, as the Worker hosts it, reading a fake Deezer. */
const worldOver = (answers: Readonly<Record<string, Answer>>) => {
  const deezer = fakeDeezer(answers);
  const Catalog = DeezerMusicCatalog.pipe(Layer.provide(deezer.layer));
  return {
    deezer,
    layer: Bafle.layer(BafleHandlers).pipe(Layer.provide(Layer.mergeAll(Domain.InMemory, Catalog))),
  };
};

it.live("a listener browses Home and New, and searches", () => {
  const { layer } = worldOver(stocked);
  return Effect.gen(function* () {
    const bafle = yield* ListenerApi.clientInProcess;

    const home = yield* bafle.HomeFeed({});
    expect(home.albums.map((album) => album.title)).toEqual(["Discovery"]);
    expect(home.playlists.map((playlist) => playlist.title)).toEqual(["Chill Hits", "Untitled"]);
    expect(home.artists.map((artist) => artist.name)).toEqual(["Daft Punk"]);

    const fresh = yield* bafle.NewMusic({});
    expect(fresh.tracks.map((track) => track.title)).toEqual(["Harder, Better, Faster, Stronger"]);

    const found = yield* bafle.CatalogSearch({ term: " daft punk " });
    expect(found.artists.map((artist) => artist.name)).toEqual(["Daft Punk"]);
    expect(found.playlists).toEqual([]);
  }).pipe(Effect.scoped, Effect.provide(layer));
});

it.live("a blank search never reaches Deezer", () => {
  const { deezer, layer } = worldOver(stocked);
  return Effect.gen(function* () {
    const bafle = yield* ListenerApi.clientInProcess;
    const found = yield* bafle.CatalogSearch({ term: "   " });
    expect(found).toEqual({ tracks: [], albums: [], artists: [], playlists: [] });
    expect(deezer.asked).toEqual([]);
  }).pipe(Effect.scoped, Effect.provide(layer));
});

it.live("a listener is told when the catalog cannot answer", () => {
  const { layer } = worldOver({});
  return Effect.gen(function* () {
    const bafle = yield* ListenerApi.clientInProcess;
    const refused = yield* bafle.HomeFeed({}).pipe(Effect.flip);
    expect(refused._tag).toBe("CatalogUnavailable");
  }).pipe(Effect.scoped, Effect.provide(layer));
});

it.live("a listener opens a track, and is told when it does not exist", () => {
  const { layer } = worldOver(stocked);
  return Effect.gen(function* () {
    const bafle = yield* ListenerApi.clientInProcess;
    const track = yield* bafle.TrackDetail({ trackId: TrackId.make("3135556") });
    expect(track.title).toBe("Harder, Better, Faster, Stronger");
    expect(track.artists.map((artist) => artist.name)).toEqual(["Daft Punk", "Romanthony"]);
    expect(track.releaseDate).toBe("2001-03-12");

    const missing = yield* bafle.TrackDetail({ trackId: TrackId.make("404") }).pipe(Effect.flip);
    expect(missing).toMatchObject({ _tag: "TrackNotFound", trackId: "404" });
  }).pipe(Effect.scoped, Effect.provide(layer));
});

it.live("a listener opens an album, and is told when it does not exist", () => {
  const { layer } = worldOver(stocked);
  return Effect.gen(function* () {
    const bafle = yield* ListenerApi.clientInProcess;
    const album = yield* bafle.AlbumDetail({ albumId: AlbumId.make("302127") });
    expect(album.title).toBe("Discovery");
    expect(album.artist.name).toBe("Daft Punk");
    expect(album.tracks.map((track) => track.title)).toEqual([
      "One More Time",
      "Harder, Better, Faster, Stronger",
    ]);
    expect(album.releaseDate).toBe("2001-03-07");

    const missing = yield* bafle.AlbumDetail({ albumId: AlbumId.make("404") }).pipe(Effect.flip);
    expect(missing).toMatchObject({ _tag: "AlbumNotFound", albumId: "404" });
  }).pipe(Effect.scoped, Effect.provide(layer));
});

it.live("a listener opens an artist, and is told when they do not exist", () => {
  const { deezer, layer } = worldOver(stocked);
  return Effect.gen(function* () {
    const bafle = yield* ListenerApi.clientInProcess;
    const artist = yield* bafle.ArtistDetail({ artistId: ArtistId.make("27") });
    expect(artist.name).toBe("Daft Punk");
    expect(artist.topTracks.map((track) => track.title)).toEqual([
      "One More Time",
      "Harder, Better, Faster, Stronger",
    ]);
    expect(artist.albums.map((album) => album.title)).toEqual([
      "Discovery",
      "Random Access Memories",
    ]);
    // The page says how many of their tracks it lists, and Deezer is asked for that many.
    const top = deezer.asked.find((url) => url.pathname === "/artist/27/top");
    expect(top?.searchParams.get("limit")).toBe(String(TOP_TRACKS));

    const missing = yield* bafle.ArtistDetail({ artistId: ArtistId.make("404") }).pipe(Effect.flip);
    expect(missing).toMatchObject({ _tag: "ArtistNotFound", artistId: "404" });
  }).pipe(Effect.scoped, Effect.provide(layer));
});

it.live("a listener opens a playlist, and is told when it does not exist", () => {
  const { layer } = worldOver(stocked);
  return Effect.gen(function* () {
    const bafle = yield* ListenerApi.clientInProcess;
    const playlist = yield* bafle.PlaylistDetail({ playlistId: PlaylistId.make("908622995") });
    expect(playlist.title).toBe("Chill Hits");
    expect(playlist.curator).toBe("Deezer Editors");
    expect(playlist.tracks.map((track) => track.title)).toEqual([
      "One More Time",
      "Harder, Better, Faster, Stronger",
    ]);

    const missing = yield* bafle
      .PlaylistDetail({ playlistId: PlaylistId.make("404") })
      .pipe(Effect.flip);
    expect(missing).toMatchObject({ _tag: "PlaylistNotFound", playlistId: "404" });
  }).pipe(Effect.scoped, Effect.provide(layer));
});

it.live("a listener browses the genres, opens one, and is told when it does not exist", () => {
  const { deezer, layer } = worldOver(stocked);
  return Effect.gen(function* () {
    const bafle = yield* ListenerApi.clientInProcess;
    const all = yield* bafle.GenreList({});
    expect(all.genres.map((genre) => genre.name)).toEqual(["Pop", "Alternative"]);

    const genre = yield* bafle.GenreDetail({ genreId: GenreId.make("132") });
    expect(genre.name).toBe("Pop");
    expect(genre.topTracks.map((track) => track.title)).toEqual([
      "One More Time",
      "Harder, Better, Faster, Stronger",
      "Third",
    ]);
    expect(genre.albums.map((album) => album.title)).toEqual(["Discovery"]);
    expect(genre.artists.map((artist) => artist.name)).toEqual(["Daft Punk"]);
    expect(genre.playlists.map((playlist) => playlist.title)).toEqual(["Chill Hits", "Untitled"]);
    // The page lists fewer tracks than a shelf holds, so the chart is asked for a shelf's worth.
    expect(GENRE_TOP_TRACKS).toBeLessThanOrEqual(SHELF_SIZE);
    const chart = deezer.asked.find((url) => url.pathname === "/chart/132");
    expect(chart?.searchParams.get("limit")).toBe(String(SHELF_SIZE));

    const missing = yield* bafle.GenreDetail({ genreId: GenreId.make("404") }).pipe(Effect.flip);
    expect(missing).toMatchObject({ _tag: "GenreNotFound", genreId: "404" });
  }).pipe(Effect.scoped, Effect.provide(layer));
});

it.live("a listener browses the stations, opens one, and is told when it does not exist", () => {
  const { deezer, layer } = worldOver(stocked);
  return Effect.gen(function* () {
    const bafle = yield* ListenerApi.clientInProcess;
    const radio = yield* bafle.StationList({});
    expect(radio.groups.map((group) => group.genre.name)).toEqual(["Pop", "Electro"]);
    expect(radio.groups.map((group) => group.stations.map((station) => station.title))).toEqual([
      ["The '80s", "Electro Pop"],
      ["Electro"],
    ]);

    const station = yield* bafle.StationDetail({ stationId: StationId.make("38305") });
    expect(station.title).toBe("The '80s");
    expect(station.tracks.map((track) => track.title)).toEqual([
      "One More Time",
      "Harder, Better, Faster, Stronger",
      "Third",
    ]);
    // The page says how many songs it lists, and Deezer is asked for that many.
    const songs = deezer.asked.find((url) => url.pathname === "/radio/38305/tracks");
    expect(songs?.searchParams.get("limit")).toBe(String(STATION_TRACKS));

    const missing = yield* bafle
      .StationDetail({ stationId: StationId.make("404") })
      .pipe(Effect.flip);
    expect(missing).toMatchObject({ _tag: "StationNotFound", stationId: "404" });
  }).pipe(Effect.scoped, Effect.provide(layer));
});
