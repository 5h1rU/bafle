import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

/** A picture's pixels, four bytes each (red, green, blue, opacity), row after row. */
export type Pixels = Readonly<{ width: number; height: number; rgba: Uint8Array }>;

/**
 * Why a PNG could not be read. `Unsupported` is a PNG of a kind this does not
 * read (another depth, palette or grey, interlaced); the others are bytes that
 * are no whole PNG.
 */
export class PngUnreadable extends Schema.TaggedError<PngUnreadable>()("PngUnreadable", {
  reason: Schema.Literals(["NotPng", "Unsupported", "Truncated", "Corrupt"]),
}) {}

type Header = Readonly<{ width: number; height: number; channels: 3 | 4 }>;

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const RGB = 2;
const RGBA = 6;

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
  const parts: Array<Uint8Array> = [];
  for (let at = SIGNATURE.length; at + 8 <= bytes.length; ) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (at + 12 + length > bytes.length) return yield* new PngUnreadable({ reason: "Truncated" });
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      const [bitDepth, colourType, , , interlace] = body.subarray(8, 13);
      if (bitDepth !== 8 || interlace !== 0 || (colourType !== RGB && colourType !== RGBA)) {
        return yield* new PngUnreadable({ reason: "Unsupported" });
      }
      header = {
        width: view.getUint32(at + 8),
        height: view.getUint32(at + 12),
        channels: colourType === RGB ? 3 : 4,
      };
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
  const data = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  parts.reduce((offset, part) => (data.set(part, offset), offset + part.length), 0);
  return { header, data };
});

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
const unfilter = (filtered: Uint8Array, { width, height, channels }: Header): Uint8Array | null => {
  const stride = width * channels;
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
        filter === 0 ? 0
        : filter === 1 ? left
        : filter === 2 ? up
        : filter === 3 ? (left + up) >> 1
        : filter === 4 ? paeth(left, up, upLeft)
        : -1;
      if (base < 0) return null;
      raw[at] = (line[index] + base) & 0xff;
    }
  }
  return raw;
};

/** The pixels with an opacity of their own, which an RGB picture has whole everywhere. */
const toRgba = (raw: Uint8Array, { width, height, channels }: Header): Uint8Array => {
  if (channels === 4) return raw;
  const rgba = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel++) {
    rgba.set(raw.subarray(pixel * 3, pixel * 3 + 3), pixel * 4);
    rgba[pixel * 4 + 3] = 255;
  }
  return rgba;
};

/**
 * The pixels of a PNG of the one kind a likeness is worked out from: 8 bits
 * a channel, RGB or RGBA, not interlaced. Any other kind, or bytes that are
 * no whole PNG, fail with `PngUnreadable`.
 */
export const decodePng = Effect.fn("decodePng")(function* (bytes: Uint8Array) {
  const { header, data } = yield* readChunks(bytes);
  const filtered = yield* inflate(data);
  if (filtered.length < header.height * (header.width * header.channels + 1)) {
    return yield* new PngUnreadable({ reason: "Truncated" });
  }
  const raw = unfilter(filtered, header);
  if (raw === null) return yield* new PngUnreadable({ reason: "Corrupt" });
  return { width: header.width, height: header.height, rgba: toRgba(raw, header) } satisfies Pixels;
});
