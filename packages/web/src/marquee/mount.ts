import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import { Mount } from "foldkit";
import { Message } from "./message.ts";

// MOUNT

// Whether a line fits is a matter of pixels, known only in the document: the
// Mount bound to the line's place says how wide the place and the words are,
// again whenever either changes.

/** Marks the words themselves, within the line's place. */
export const WORDS_ATTRIBUTE = "marquee-words";

/** Marks the piece that is moved: the words, with their copy after them. */
export const LINE_ATTRIBUTE = "marquee-line";

/** A line fits when it is no wider than its place, give or take the rounding of a layout. */
const FITS_WITHIN_PIXELS = 0.5;

const MEASURES_AFTER = Duration.millis(120);

const pixels = (length: string): number => {
  const parsed = Number.parseFloat(length);
  return Number.isFinite(parsed) ? parsed : 0;
};

type Measure = typeof Message.Measured.Type;

const measure = (place: Element): Option.Option<Measure> =>
  Option.gen(function* () {
    const words = yield* Option.fromNullishOr(place.querySelector(`[data-${WORDS_ATTRIBUTE}]`));
    const line = yield* Option.fromNullishOr(place.querySelector(`[data-${LINE_ATTRIBUTE}]`));
    const placeStyle = getComputedStyle(place);
    const placePixels =
      place.clientWidth - pixels(placeStyle.paddingLeft) - pixels(placeStyle.paddingRight);
    const wordsPixels = pixels(getComputedStyle(words).width);
    const gapPixels = pixels(getComputedStyle(line).columnGap);

    return Message.Measured({
      placePixels: Math.round(placePixels),
      maybeTravelPixels:
        wordsPixels > placePixels + FITS_WITHIN_PIXELS
          ? Option.some(Math.round(wordsPixels + gapPixels))
          : Option.none(),
    });
  });

/**
 * How a line lies in its place, said again whenever either changes width:
 * the place with whatever holds it, the words with what they say. While the
 * place is on its way from one width to another it changes on every frame,
 * and nothing is said until it has settled.
 */
export const Measure = Mount.defineStream("Measure", {
  messages: [Message.Measured],
  execute: ({ element }) =>
    Stream.callback<void>((queue) =>
      Effect.gen(function* () {
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            const sizes = new ResizeObserver(() => Queue.offerUnsafe(queue, undefined));
            sizes.observe(element);
            Option.match(
              Option.fromNullishOr(element.querySelector(`[data-${WORDS_ATTRIBUTE}]`)),
              {
                onNone: () => undefined,
                onSome: (words) => sizes.observe(words),
              },
            );
            return sizes;
          }),
          (sizes) => Effect.sync(() => sizes.disconnect()),
        );
        return yield* Effect.never;
      }),
    ).pipe(
      Stream.debounce(MEASURES_AFTER),
      Stream.map(() => Option.toArray(measure(element))),
      Stream.flattenIterable,
      Stream.changesWith<Measure>(Equal.equals),
    ),
});
