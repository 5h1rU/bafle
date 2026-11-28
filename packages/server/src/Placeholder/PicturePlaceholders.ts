import * as Cloudflare from "@alchemy.run/cloudflare";
import { RuntimeContext } from "alchemy/RuntimeContext";
import * as Array from "effect/Array";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { rgbaToThumbHash } from "thumbhash";
import { PngUnreadable, decodePng } from "./png.ts";

/**
 * A picture whose likeness is wanted: what it is known by (one of its
 * addresses), and the address of the picture the likeness is worked out
 * from. That is best a PNG of a few dozen pixels a side, which is read as it
 * comes; any other is first drawn as one (`smallPngOf`).
 */
export type Picture = Readonly<{ key: string; source: string }>;

/**
 * The likenesses of pictures (`placeholder` on `Artwork`): a ThumbHash of
 * each, in base64, by the picture's key. A picture missing from the answer
 * has no likeness yet, and is drawn as it always was.
 */
export class PicturePlaceholders extends Context.Service<
  PicturePlaceholders,
  {
    readonly likenesses: (
      pictures: ReadonlyArray<Picture>,
    ) => Effect.Effect<ReadonlyMap<string, string>>;
  }
>()("Bafle/PicturePlaceholders") {}

/** No likeness for any picture: for a catalog read without them, in tests. */
export const NoPicturePlaceholders = Layer.succeed(PicturePlaceholders, {
  likenesses: () => Effect.succeed(new Map()),
});

/**
 * How many pictures one reply works out the likeness of, at most: as many as
 * the longest page draws (Home's three shelves, Radio's stations), so that a
 * page's pictures all have theirs from the second visit on. A reply lists its
 * pictures in the order its page draws them, so the first are the ones seen
 * first. The rest are worked out by the replies that follow: a picture's
 * likeness is kept for good once it is known.
 *
 * A reply never waits for them. It carries the likenesses already known, and
 * those it is missing are worked out once it has gone, while the Worker is
 * kept alive for them (`waitUntil`), six at a time (`AT_ONCE`).
 */
// NOTE: each is a request of the Worker's to the catalog's pictures, and one
// to Cloudflare Images for a picture that is no small PNG. A Worker on the
// paid plan may make 10,000 while it answers one request (50 on the free
// plan, for which this was 16).
export const LIKENESSES_PER_REPLY = 64;

/**
 * How many likenesses are worked out at once: as many things as a Worker asks
 * for at once. More would only queue, and a likeness's time (`LIKENESS_WAIT`)
 * would run out in the queue.
 */
const AT_ONCE = 6;

/** How long a likeness may take to work out and keep, once its reply has gone. */
export const LIKENESS_WAIT = Duration.seconds(5);

/** The largest picture ThumbHash reads, a side. */
const THUMBHASH_SIDE = 100;

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

/**
 * A picture's likeness, from its PNG. A PNG that cannot be read, or one larger
 * than ThumbHash reads, has none: `PngUnreadable`.
 */
export const likenessOf = Effect.fn("likenessOf")(function* (png: Uint8Array) {
  const pixels = yield* decodePng(png);
  if (pixels.width > THUMBHASH_SIDE || pixels.height > THUMBHASH_SIDE) {
    return yield* new PngUnreadable({ reason: "Unsupported" });
  }
  return toBase64(rgbaToThumbHash(pixels.width, pixels.height, pixels.rgba));
});

/** The side, in pixels, a picture that is no small PNG is drawn at to work its likeness out. */
export const LIKENESS_SIDE = 32;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Whether bytes are a PNG, by the eight bytes every PNG starts with. */
export const isPng = (bytes: Uint8Array): boolean =>
  bytes.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((byte, at) => bytes[at] === byte);

/**
 * A picture as a PNG small enough to work its likeness out from: as it is,
 * when it is a PNG already (Deezer draws one at any size it is asked for),
 * and otherwise drawn as one by `drawSmall` (a JPEG, which is all Audius
 * draws). A PNG too large for ThumbHash is not drawn again: the catalog that
 * sends one is asked for a smaller one in its `likenessSourceOf`.
 */
export const smallPngOf = <E, R>(
  bytes: Uint8Array,
  drawSmall: (bytes: Uint8Array) => Effect.Effect<Uint8Array, E, R>,
): Effect.Effect<Uint8Array, E, R> => (isPng(bytes) ? Effect.succeed(bytes) : drawSmall(bytes));

/** The name a likeness is kept under, with the version of how it was worked out. */
const keptAs = (key: string): string => `thumbhash:1:${key}`;

/** How many keys KV reads at once. */
const KV_BATCH = 100;

/**
 * Likenesses kept in Workers KV, where every isolate everywhere finds them,
 * and in the isolate's own memory in front of it. A picture's likeness
 * never changes, since a picture at an address never does, so a likeness
 * is worked out once and kept for good. A picture that is no small PNG is
 * drawn as one by Cloudflare Images, which counts it as a transformation:
 * once a picture, since its likeness is kept. Whatever goes wrong (KV, the
 * catalog, Images, its monthly allowance, a picture that cannot be read) only
 * leaves a picture without its likeness.
 */
export const PicturePlaceholdersKV = Layer.effect(
  PicturePlaceholders,
  Effect.gen(function* () {
    const store = yield* Cloudflare.KV.ReadWriteNamespace(Cloudflare.KV.Namespace("Placeholders"));
    const images = yield* Cloudflare.Images.Images("Pictures");
    const client = yield* HttpClient.HttpClient;
    const known = new Map<string, string>();

    /** A picture drawn by Cloudflare Images as a PNG, `LIKENESS_SIDE` pixels a side at most. */
    const drawSmall = (bytes: Uint8Array) =>
      images.input(Stream.succeed(bytes)).pipe(
        Effect.flatMap((picture) =>
          picture
            .transform({ width: LIKENESS_SIDE, height: LIKENESS_SIDE, fit: "scale-down" })
            .output({ format: "image/png" }),
        ),
        Effect.flatMap((drawn) => drawn.response),
        Effect.flatMap((response) => Effect.tryPromise(() => response.arrayBuffer())),
        Effect.map((buffer) => new Uint8Array(buffer)),
      );

    const readKept = (keys: ReadonlyArray<string>) =>
      Effect.forEach(
        Array.chunksOf(keys, KV_BATCH),
        (batch) =>
          store.get(batch.map(keptAs), "text").pipe(
            Effect.map((found) =>
              batch.forEach((key) => {
                const likeness = found.get(keptAs(key));
                if (likeness) known.set(key, likeness);
              }),
            ),
          ),
        { concurrency: "unbounded", discard: true },
      ).pipe(
        Effect.catch((error) => Effect.logWarning("Could not read the kept likenesses", error)),
      );

    const workOut = (picture: Picture) =>
      client.get(picture.source).pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.flatMap((response) => response.arrayBuffer),
        Effect.flatMap((buffer) => smallPngOf(new Uint8Array(buffer), drawSmall)),
        Effect.flatMap(likenessOf),
        Effect.map(Option.some),
        // A picture the catalog would not hand over, Images would not draw
        // (its monthly allowance spent among that), or drawn in a kind of PNG
        // this does not read, is left without a likeness: drawn as it always
        // was.
        Effect.catch((error) =>
          Effect.logDebug(`No likeness for ${picture.source}`, error).pipe(
            Effect.as(Option.none<string>()),
          ),
        ),
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.void,
            onSome: (likeness) => {
              known.set(picture.key, likeness);
              return store
                .put(keptAs(picture.key), likeness)
                .pipe(
                  Effect.catch((error) => Effect.logWarning("Could not keep a likeness", error)),
                );
            },
          }),
        ),
        Effect.timeoutOption(LIKENESS_WAIT),
        Effect.asVoid,
      );

    const likenesses = Effect.fn("PicturePlaceholders.likenesses")(function* (
      pictures: ReadonlyArray<Picture>,
    ) {
      const wanted = Array.dedupeWith(pictures, (one, other) => one.key === other.key);
      const unknown = wanted.filter((picture) => !known.has(picture.key));
      if (unknown.length > 0) {
        yield* readKept(unknown.map((picture) => picture.key));
        const missing = Array.take(
          unknown.filter((picture) => !known.has(picture.key)),
          LIKENESSES_PER_REPLY,
        );
        if (missing.length > 0) {
          const work = Effect.forEach(missing, workOut, { concurrency: AT_ONCE, discard: true });
          // Inside a request, after it: the reply goes now. Outside one (in a
          // test) there is no request to outlive, and the work is done first.
          const execution = yield* Cloudflare.WorkerExecutionContext;
          yield* execution === Cloudflare.deferredExecutionContext
            ? work
            : execution.waitUntil(work);
        }
      }
      const found: ReadonlyMap<string, string> = new Map(
        wanted.flatMap((picture) => {
          const likeness = known.get(picture.key);
          return likeness === undefined ? [] : [[picture.key, likeness] as const];
        }),
      );
      return found;
    });

    // NOTE: KV's client names the host's RuntimeContext in its type, and an
    // external system's operations may need nothing. The binding reads the
    // Worker's env, which it took when it was bound, and never the context:
    // alchemy's own services built on bindings provide `RuntimeContext.phantom`.
    return {
      likenesses: (pictures) => likenesses(pictures).pipe(Effect.provide(RuntimeContext.phantom)),
    };
  }),
);
