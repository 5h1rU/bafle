import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import { Mount } from "foldkit";
import { islandOutline } from "../view/islandOutline.ts";
import { ISLAND_LIGHTS_ATTRIBUTE, lightPlace, putLightNear, setPace } from "./islandLight.ts";
import { Message } from "./message.ts";
import { IslandLight } from "./model.ts";

// MOUNT

// What the island needs of the document itself, once its pieces are in it:
// how wide the title and its place are, the outline of the figure for the
// width the island has at this moment, and the light's animations set to
// what the Model says. Each is bound to the element it concerns and ends
// with it.

/** Marks the piece of the island whose width is how far the tail reaches. */
export const ISLAND_TAIL_ATTRIBUTE = "island-tail";

/** Marks every path that is drawn along the island's outline. */
export const ISLAND_OUTLINE_ATTRIBUTE = "island-outline";

/** Marks the title's own words within its place, and the line that travels. */
export const TITLE_WORDS_ATTRIBUTE = "title-words";
export const TITLE_LINE_ATTRIBUTE = "title-line";

/** The title fits when it is no wider than its place, give or take the rounding of a layout. */
const FITS_WITHIN_PIXELS = 0.5;

/** A place still changing width is not measured until it has stood this long. */
const MEASURES_AFTER = Duration.millis(120);

const pixels = (length: string): number => {
  const parsed = Number.parseFloat(length);
  return Number.isFinite(parsed) ? parsed : 0;
};

type Measure = typeof Message.MeasuredTitle.Type;

/**
 * The title as it lies in its place: the place's width, and how far one
 * pass takes the title when it does not fit. A pass ends with the title's
 * copy standing where the title began, so it goes the title's own width and
 * the gap between the two.
 */
const measureTitle = (place: Element): Option.Option<Measure> =>
  Option.gen(function* () {
    const words = yield* Option.fromNullishOr(place.querySelector(`[data-${TITLE_WORDS_ATTRIBUTE}]`));
    const line = yield* Option.fromNullishOr(place.querySelector(`[data-${TITLE_LINE_ATTRIBUTE}]`));
    const placeStyle = getComputedStyle(place);
    const placePixels =
      place.clientWidth - pixels(placeStyle.paddingLeft) - pixels(placeStyle.paddingRight);
    const wordsPixels = words.getBoundingClientRect().width;
    const gapPixels = pixels(getComputedStyle(line).columnGap);

    return Message.MeasuredTitle({
      placePixels: Math.round(placePixels),
      maybeTravelPixels:
        wordsPixels > placePixels + FITS_WITHIN_PIXELS
          ? Option.some(Math.round(wordsPixels + gapPixels))
          : Option.none(),
    });
  });

/**
 * Tells the Model how the title lies in its place, and again whenever
 * either changes width: the place with the island, the title with the
 * track. While the island is on its way between its two places the width
 * changes on every frame, and nothing is said until it has settled.
 */
export const MeasureTitle = Mount.defineStream("MeasureTitle", {
  messages: [Message.MeasuredTitle],
  execute: ({ element }) =>
    Stream.callback<Measure>((queue) =>
      Effect.gen(function* () {
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            const say = (): void => {
              Option.match(measureTitle(element), {
                onNone: () => undefined,
                onSome: (measure) => Queue.offerUnsafe(queue, measure),
              });
            };
            const sizes = new ResizeObserver(say);
            sizes.observe(element);
            Option.match(
              Option.fromNullishOr(element.querySelector(`[data-${TITLE_WORDS_ATTRIBUTE}]`)),
              { onNone: () => undefined, onSome: (words) => sizes.observe(words) },
            );
            return sizes;
          }),
          (sizes) => Effect.sync(() => sizes.disconnect()),
        );
        return yield* Effect.never;
      }),
    ).pipe(Stream.debounce(MEASURES_AFTER), Stream.changesWith<Measure>(Equal.equals)),
});

/** The light on an island, and one of the paths that have its outline to measure it by. */
const lightOn = (
  island: Element,
): Option.Option<Readonly<{ lights: Element; path: SVGGeometryElement }>> =>
  Option.all({
    lights: Option.fromNullishOr(island.querySelector(`[data-${ISLAND_LIGHTS_ATTRIBUTE}]`)),
    path: Option.liftPredicate(
      island.querySelector(`[data-${ISLAND_OUTLINE_ATTRIBUTE}]`),
      (path): path is SVGGeometryElement => path instanceof SVGGeometryElement,
    ),
  });

/**
 * Draws the island's outline for the width the island has, and again on
 * every change of that width or of the tail's. It writes the outline straight
 * to the paths in the callback that reports the change, which the browser
 * runs after it has laid the page out and before it paints: the figure is
 * never a frame behind the cover and the controls, which are laid out by the
 * style sheet. A width sent to the Model and drawn by the view would be
 * painted a frame late, since the view is drawn at the start of a frame.
 *
 * The light is placed in shares of the outline, so an outline that grows or
 * shrinks would carry it along the edge. In that same callback it is put
 * back where the listener saw it.
 */
export const DrawIslandFigure = Mount.define("DrawIslandFigure", {
  messages: [Message.CompletedDrawIslandFigure],
  execute: ({ element }) =>
    Effect.gen(function* () {
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          const drawn = { outline: "", left: 0 };
          const maybeTail = Option.fromNullishOr(
            element.querySelector(`[data-${ISLAND_TAIL_ATTRIBUTE}]`),
          );
          const draw = (): void => {
            const { width, left } = element.getBoundingClientRect();
            if (width === 0) {
              return;
            }
            const tailWidth = Option.match(maybeTail, {
              onNone: () => 0,
              onSome: (tail) => tail.getBoundingClientRect().width,
            });
            const outline = islandOutline(width, tailWidth);
            if (outline === drawn.outline) {
              return;
            }
            // Where the light is on the outline about to be replaced: across the
            // page as the listener sees it, and up and down as the island has it,
            // since the island goes up and down whole and the light with it.
            const maybeLight = lightOn(element);
            const maybeHeld =
              drawn.outline === ""
                ? Option.none()
                : Option.flatMap(maybeLight, ({ lights, path }) => lightPlace(lights, path));
            element
              .querySelectorAll(`[data-${ISLAND_OUTLINE_ATTRIBUTE}]`)
              .forEach((path) => path.setAttribute("d", outline));
            Option.match(Option.all({ light: maybeLight, held: maybeHeld }), {
              onNone: () => undefined,
              onSome: ({ light, held }) =>
                putLightNear(light.lights, light.path, {
                  x: held.x + drawn.left - left,
                  y: held.y,
                }),
            });
            drawn.outline = outline;
            drawn.left = left;
          };
          const sizes = new ResizeObserver(draw);
          sizes.observe(element);
          Option.match(maybeTail, {
            onNone: () => undefined,
            onSome: (tail) => sizes.observe(tail),
          });
          draw();
          return sizes;
        }),
        (sizes) => Effect.sync(() => sizes.disconnect()),
      );
      return Message.CompletedDrawIslandFigure();
    }),
});

/**
 * Sets the light's animations, as the island enters the document, to what
 * the Model says the light is doing: travelling, or held where it is drawn.
 * From then on the Subscription `islandLightPace` follows the Model.
 */
export const StartIslandLight = Mount.define("StartIslandLight", {
  args: { initialLight: IslandLight },
  messages: [Message.CompletedStartIslandLight],
  execute: ({ element, initialLight }) =>
    Effect.sync(() => {
      setPace(element, initialLight === "Travelling" ? 1 : 0);
      return Message.CompletedStartIslandLight();
    }),
});
