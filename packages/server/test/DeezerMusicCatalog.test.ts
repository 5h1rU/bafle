import { MusicCatalog } from "@bafle/domain/Catalog/MusicCatalog.external";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { DeezerMusicCatalog, SHELF_SIZE } from "../src/Deezer/DeezerMusicCatalog.ts";
import { type Answer, fakeDeezer, stocked } from "./deezer.ts";

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
