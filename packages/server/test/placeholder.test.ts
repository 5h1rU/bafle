import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { thumbHashToAverageRGBA } from "thumbhash";
import { DeezerMusicCatalog } from "../src/Deezer/DeezerMusicCatalog.ts";
import { likenessSourceOf, toArtwork } from "../src/Deezer/translate.ts";
import { artworksIn, withPlaceholders } from "../src/Placeholder/artworks.ts";
import { likenessOf, type Picture, PicturePlaceholders } from "../src/Placeholder/PicturePlaceholders.ts";
import { decodePng, PngUnreadable } from "../src/Placeholder/png.ts";
import { MusicCatalog } from "@bafle/domain/Catalog/MusicCatalog.external";
import { fakeDeezer, stocked } from "./deezer.ts";

// A PNG written here, row by row, with the filter each row asks for, so that the decoder is
// checked against pixels it did not write.

type Filter = 0 | 1 | 2 | 3 | 4;

const paeth = (left: number, up: number, upLeft: number): number => {
  const estimate = left + up - upLeft;
  const [toLeft, toUp, toUpLeft] = [left, up, upLeft].map((value) => Math.abs(estimate - value));
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  return toUp <= toUpLeft ? up : upLeft;
};

const deflate = async (data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> => {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const chunk = (type: string, body: Uint8Array): Uint8Array => {
  const out = new Uint8Array(12 + body.length);
  new DataView(out.buffer).setUint32(0, body.length);
  out.set([...type].map((letter) => letter.charCodeAt(0)), 4);
  out.set(body, 8);
  // The checksum is not read: four bytes of nothing stand in for it.
  return out;
};

const writePng = async (
  width: number,
  height: number,
  channels: 3 | 4,
  pixel: (x: number, y: number) => ReadonlyArray<number>,
  filterOf: (row: number) => Filter,
  colourType: number = channels === 3 ? 2 : 6,
): Promise<Uint8Array> => {
  const stride = width * channels;
  const raw = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) raw.set(pixel(x, y), y * stride + x * channels);
  const filtered = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const filter = filterOf(y);
    filtered[y * (stride + 1)] = filter;
    for (let i = 0; i < stride; i++) {
      const at = y * stride + i;
      const left = i >= channels ? raw[at - channels] : 0;
      const up = y > 0 ? raw[at - stride] : 0;
      const upLeft = y > 0 && i >= channels ? raw[at - stride - channels] : 0;
      const base = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filter];
      filtered[y * (stride + 1) + 1 + i] = (raw[at] - base) & 0xff;
    }
  }
  const header = new Uint8Array(13);
  new DataView(header.buffer).setUint32(0, width);
  new DataView(header.buffer).setUint32(4, height);
  header.set([8, colourType, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", await deflate(filtered)),
    chunk("IEND", new Uint8Array()),
  ];
  const png = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  parts.reduce((offset, part) => (png.set(part, offset), offset + part.length), 0);
  return png;
};

const gradient = (x: number, y: number) => [x * 7, y * 5, (x * y) % 256];

it.effect("a PNG is read whatever filters its rows were written with", () =>
  Effect.gen(function* () {
    const png = yield* Effect.promise(() => writePng(9, 10, 3, gradient, (row) => (row % 5) as Filter));
    const pixels = yield* decodePng(png);
    expect([pixels.width, pixels.height]).toEqual([9, 10]);
    expect(Array.from(pixels.rgba.subarray(0, 4))).toEqual([0, 0, 0, 255]);
    const at = (5 * 9 + 4) * 4;
    expect(Array.from(pixels.rgba.subarray(at, at + 4))).toEqual([...gradient(4, 5), 255]);
  }),
);

it.effect("a PNG with an opacity of its own keeps it", () =>
  Effect.gen(function* () {
    const png = yield* Effect.promise(() =>
      writePng(4, 4, 4, (x, y) => [...gradient(x, y), 40 * x], () => 4),
    );
    const pixels = yield* decodePng(png);
    expect(Array.from(pixels.rgba.subarray(12, 16))).toEqual([...gradient(3, 0), 120]);
  }),
);

it.effect("bytes that are no PNG, or a PNG of another kind, cannot be read, and say why", () =>
  Effect.gen(function* () {
    const reasonOf = (bytes: Uint8Array) =>
      decodePng(bytes).pipe(
        Effect.flip,
        Effect.map((error) => (error instanceof PngUnreadable ? error.reason : "Other")),
      );
    expect(yield* reasonOf(new Uint8Array([1, 2, 3]))).toBe("NotPng");

    const palette = yield* Effect.promise(() => writePng(2, 2, 3, gradient, () => 0, 3));
    expect(yield* reasonOf(palette)).toBe("Unsupported");

    const whole = yield* Effect.promise(() => writePng(4, 4, 3, gradient, () => 0));
    expect(yield* reasonOf(whole.subarray(0, 40))).toBe("Truncated");
  }),
);

it.effect("a likeness keeps the colour of the picture it is of", () =>
  Effect.gen(function* () {
    const terracotta = [200, 90, 60];
    const png = yield* Effect.promise(() => writePng(32, 32, 3, () => terracotta, () => 1));
    const likeness = yield* likenessOf(png);
    // A ThumbHash of a few dozen bytes, in base64.
    expect(likeness.length).toBeLessThan(64);
    const average = thumbHashToAverageRGBA(Uint8Array.from(atob(likeness), (letter) => letter.charCodeAt(0)));
    const drawn = [average.r, average.g, average.b].map((value) => Math.round(value * 255));
    drawn.forEach((value, channel) => expect(Math.abs(value - (terracotta[channel] ?? 0))).toBeLessThanOrEqual(3));
  }),
);

it("a Deezer picture's likeness is worked out from the same picture, 32 pixels a side, as a PNG", () => {
  const cover = (size: number, extension: string) =>
    `https://cdn-images.dzcdn.net/images/cover/22e3ab6a96c843e538a8a4ba6ad4debe/${size}x${size}-000000-80-0-0.${extension}`;
  const artwork = toArtwork(cover(250, "jpg"), cover(500, "jpg"), cover(1000, "jpg"));
  expect(artwork && likenessSourceOf(artwork)).toBe(cover(32, "png"));
  expect(
    likenessSourceOf({ small: "https://cdn.test/1/250.jpg", medium: "", large: "", placeholder: null }),
  ).toBeNull();
});

it("every picture of a reply is found, in the order its page draws them, and given its likeness", () => {
  const picture = (name: string) => ({
    small: `https://img.test/${name}/small`,
    medium: `https://img.test/${name}/medium`,
    large: `https://img.test/${name}/large`,
    placeholder: null,
  });
  const reply = {
    picture: picture("genre"),
    topTracks: [{ title: "One", album: { cover: picture("one") } }, { title: "Two", album: { cover: null } }],
    albums: [{ title: "Three", cover: picture("three") }],
  };
  expect(artworksIn(reply).map((artwork) => artwork.small)).toEqual([
    "https://img.test/genre/small",
    "https://img.test/one/small",
    "https://img.test/three/small",
  ]);

  const pictured = withPlaceholders(reply, new Map([["https://img.test/one/small", "1QcSHQRnh493V4dIh4eXh1h4kJUI"]]));
  expect(pictured.topTracks[0]?.album.cover?.placeholder).toBe("1QcSHQRnh493V4dIh4eXh1h4kJUI");
  expect(pictured.picture.placeholder).toBeNull();
  expect(pictured.topTracks[1]).toEqual(reply.topTracks[1]);
});

it.effect("every reply of the catalog carries the likenesses that are known, asked for in the order of its page", () => {
  const asked: Array<ReadonlyArray<Picture>> = [];
  const Likenesses = Layer.succeed(PicturePlaceholders, {
    likenesses: (pictures) =>
      Effect.sync(() => {
        asked.push(pictures);
        return new Map(pictures.slice(0, 1).map((picture) => [picture.key, "known"] as const));
      }),
  });
  // Deezer's pictures, at addresses of the shape its image server has: a likeness has a source.
  const deezer = fakeDeezer(
    JSON.parse(
      JSON.stringify(stocked).replaceAll(
        /https:\/\/cdn\.test\/(\d+)\/(\d+)\.jpg/g,
        "https://cdn-images.dzcdn.net/images/cover/$1/$2x$2-000000-80-0-0.jpg",
      ),
    ),
  );
  const layer = DeezerMusicCatalog.pipe(Layer.provide(Layer.mergeAll(deezer.layer, Likenesses)));

  return Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    const featured = yield* catalog.featured();
    expect(asked).toHaveLength(1);
    const first = artworksIn(featured)[0];
    expect(first?.placeholder).toBe("known");
    expect(asked[0]?.[0]?.key).toBe(first?.small);
    expect(asked[0]?.[0]?.source).toMatch(/\/32x32-000000-80-0-0\.png$/);
    // Only the first was known: the others are drawn as they always were.
    expect(artworksIn(featured).slice(1).every((artwork) => artwork.placeholder === null)).toBe(true);
  }).pipe(Effect.provide(layer));
});
