import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

/** A picture's pixels, four bytes each (red, green, blue, opacity), row after row. */
export type Pixels = Readonly<{ width: number; height: number; rgba: Uint8Array }>;

/**
 * Why a PNG could not be read. `Unsupported` is a PNG of a kind this does not
 * read (16 bits a channel, or interlaced); the others are bytes that are no
 * whole PNG.
 */
export class PngUnreadable extends Schema.TaggedError<PngUnreadable>()("PngUnreadable", {
  reason: Schema.Literals(["NotPng", "Unsupported", "Truncated", "Corrupt"]),
}) {}

/**
 * How a PNG writes its pixels: in grey, grey with opacity, red green and
 * blue, those with opacity, or as indices into a palette of colours.
 */
const GREY = 0;
const RGB = 2;
const PALETTE = 3;
const GREY_ALPHA = 4;
const RGBA = 6;

/** The values a channel is written in, of each kind: how many, and how many bits each. */
const CHANNELS: Readonly<Record<number, number>> = {
  [GREY]: 1,
  [RGB]: 3,
  [PALETTE]: 1,
  [GREY_ALPHA]: 2,
  [RGBA]: 4,
};

/** The depths each kind may be written at that are read here: every one PNG has but 16 bits. */
const DEPTHS: Readonly<Record<number, ReadonlyArray<number>>> = {
  [GREY]: [1, 2, 4, 8],
  [RGB]: [8],
  [PALETTE]: [1, 2, 4, 8],
  [GREY_ALPHA]: [8],
  [RGBA]: [8],
};

type Header = Readonly<{
  width: number;
  height: number;
  colourType: number;
  bitDepth: number;
  channels: number;
}>;

/**
 * What a PNG says of its colours besides its pixels: the palette its indices
 * name (`PLTE`, red green and blue each), and which colours are not whole
 * (`tRNS`: an opacity for each of the palette's, or the one grey that is
 * clear).
 */
type Colours = Readonly<{ palette: Uint8Array | null; transparency: Uint8Array | null }>;

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/**
 * The PNG's header and its image data, still compressed: the chunks a
 * picture is drawn from, every other chunk passed over.
 */
const readChunks = Effect.fn("readChunks")(function* (bytes: Uint8Array) {
  if (bytes.length < SIGNATURE.length || SIGNATURE.some((byte, index) => bytes[index] !== byte)) {
    return yield* new PngUnreadable({ reason: "NotPng" });
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let header: Header | undefined;
  let palette: Uint8Array | null = null;
  let transparency: Uint8Array | null = null;
  const parts: Array<Uint8Array> = [];
  for (let at = SIGNATURE.length; at + 8 <= bytes.length;) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (at + 12 + length > bytes.length) return yield* new PngUnreadable({ reason: "Truncated" });
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      const [bitDepth = 0, colourType = -1, , , interlace] = body.subarray(8, 13);
      const channels = CHANNELS[colourType];
      if (channels === undefined || !DEPTHS[colourType]?.includes(bitDepth) || interlace !== 0) {
        return yield* new PngUnreadable({ reason: "Unsupported" });
      }
      header = {
        width: view.getUint32(at + 8),
        height: view.getUint32(at + 12),
        colourType,
        bitDepth,
        channels,
      };
    } else if (type === "PLTE") {
      palette = body;
    } else if (type === "tRNS") {
      transparency = body;
    } else if (type === "IDAT") {
      parts.push(body);
    } else if (type === "IEND") {
      break;
    }
    at += 12 + length;
  }
  if (header === undefined || header.width === 0 || header.height === 0 || parts.length === 0) {
    return yield* new PngUnreadable({ reason: "Truncated" });
  }
  if (header.colourType === PALETTE && palette === null) {
    return yield* new PngUnreadable({ reason: "Corrupt" });
  }
  const data = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  parts.reduce((offset, part) => (data.set(part, offset), offset + part.length), 0);
  const colours: Colours = { palette, transparency };
  return { header, colours, data };
});

/** How many bytes one row of pixels takes, its filter's byte aside. */
const strideOf = ({ width, channels, bitDepth }: Header): number =>
  Math.ceil((width * channels * bitDepth) / 8);

/**
 * How many bytes back a filter looks for the pixel to the left: a whole
 * pixel's, or one byte where a pixel is less than a byte.
 */
const pixelBytesOf = ({ channels, bitDepth }: Header): number =>
  Math.max(1, (channels * bitDepth) / 8);

/** The image data uncompressed, by the platform's own zlib (`DecompressionStream`), as Workers and Node both have it. */
const inflate = (data: Uint8Array<ArrayBuffer>): Effect.Effect<Uint8Array, PngUnreadable> =>
  Effect.tryPromise({
    try: async () => {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate"));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    },
    catch: () => new PngUnreadable({ reason: "Corrupt" }),
  });

const paeth = (left: number, up: number, upLeft: number): number => {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  return toUp <= toUpLeft ? up : upLeft;
};

/**
 * Each row starts with the filter its bytes were written with, which says
 * what each byte was taken from: the one to its left, the one above, both,
 * or nothing. Undoing them gives the pixels as the picture has them. A
 * filter PNG does not have is `null`.
 */
// NOTE: arithmetic on bytes, one at a time and each from those before it:
// it is written as a loop over typed arrays, and kept pure.
const unfilter = (filtered: Uint8Array, header: Header): Uint8Array | null => {
  const { height } = header;
  const stride = strideOf(header);
  const channels = pixelBytesOf(header);
  const raw = new Uint8Array(height * stride);
  for (let row = 0; row < height; row++) {
    const filter = filtered[row * (stride + 1)];
    const line = filtered.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1));
    for (let index = 0; index < stride; index++) {
      const at = row * stride + index;
      const left = index >= channels ? raw[at - channels] : 0;
      const up = row > 0 ? raw[at - stride] : 0;
      const upLeft = row > 0 && index >= channels ? raw[at - stride - channels] : 0;
      const base =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? up
              : filter === 3
                ? (left + up) >> 1
                : filter === 4
                  ? paeth(left, up, upLeft)
                  : -1;
      if (base < 0) return null;
      raw[at] = (line[index] + base) & 0xff;
    }
  }
  return raw;
};

/**
 * One value of a row as it is written: a byte, or a few bits of one when the
 * picture is written at less than a byte a value, the first in the highest.
 */
const sampleAt = (raw: Uint8Array, rowStart: number, index: number, bitDepth: number): number => {
  if (bitDepth === 8) return raw[rowStart + index] ?? 0;
  const bit = index * bitDepth;
  const byte = raw[rowStart + (bit >> 3)] ?? 0;
  return (byte >> (8 - bitDepth - (bit & 7))) & ((1 << bitDepth) - 1);
};

/**
 * The pixels as red, green, blue and opacity, a byte each, whatever kind the
 * PNG wrote them in: a grey written at fewer bits is brought to the whole
 * range, an index takes its colour from the palette (and its opacity from
 * `tRNS`, whole where that says nothing), and a grey `tRNS` names is clear.
 */
const toRgba = (raw: Uint8Array, header: Header, colours: Colours): Uint8Array | null => {
  const { width, height, colourType, bitDepth, channels } = header;
  const stride = strideOf(header);
  const greyScale = 255 / ((1 << bitDepth) - 1);
  const clearGrey =
    colourType === GREY && colours.transparency !== null && colours.transparency.length >= 2
      ? (colours.transparency[0]! << 8) | colours.transparency[1]!
      : -1;
  const rgba = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const values = Array.from({ length: channels }, (_, channel) =>
        sampleAt(raw, row * stride, column * channels + channel, bitDepth),
      );
      const at = (row * width + column) * 4;
      if (colourType === PALETTE) {
        const index = values[0] ?? 0;
        const palette = colours.palette!;
        if (index * 3 + 2 >= palette.length) return null;
        rgba.set(palette.subarray(index * 3, index * 3 + 3), at);
        rgba[at + 3] = colours.transparency?.[index] ?? 255;
      } else if (colourType === GREY || colourType === GREY_ALPHA) {
        const grey = Math.round((values[0] ?? 0) * greyScale);
        rgba.set([grey, grey, grey], at);
        rgba[at + 3] =
          colourType === GREY_ALPHA ? (values[1] ?? 255) : values[0] === clearGrey ? 0 : 255;
      } else {
        rgba.set(values.slice(0, 3), at);
        rgba[at + 3] = colourType === RGBA ? (values[3] ?? 255) : 255;
      }
    }
  }
  return rgba;
};

/**
 * The pixels of a PNG a likeness is worked out from, of any kind a picture
 * drawn small comes in: grey, grey with opacity, RGB, RGBA or a palette, at
 * up to 8 bits a channel, not interlaced. Cloudflare Images writes a picture
 * with no colour as grey and one with few colours as a palette, so all of
 * them are read. A PNG of 16 bits a channel, an interlaced one, or bytes that
 * are no whole PNG, fail with `PngUnreadable`.
 */
export const decodePng = Effect.fn("decodePng")(function* (bytes: Uint8Array) {
  const { header, colours, data } = yield* readChunks(bytes);
  const filtered = yield* inflate(data);
  if (filtered.length < header.height * (strideOf(header) + 1)) {
    return yield* new PngUnreadable({ reason: "Truncated" });
  }
  const raw = unfilter(filtered, header);
  if (raw === null) return yield* new PngUnreadable({ reason: "Corrupt" });
  const rgba = toRgba(raw, header, colours);
  if (rgba === null) return yield* new PngUnreadable({ reason: "Corrupt" });
  return { width: header.width, height: header.height, rgba } satisfies Pixels;
});
