import * as Domain from "@alchemy.run/domain";
import { Bafle, BafleHandlers } from "@bafle/domain/Bafle.model";
import { ListenerApi } from "@bafle/domain/ListenerApi.api";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { DeezerMusicCatalog } from "../src/Deezer/DeezerMusicCatalog.ts";
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
