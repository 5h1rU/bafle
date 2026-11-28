import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import { Mount } from "foldkit";
import { islandOutline } from "../view/islandOutline.ts";
import { startWhenSeen } from "../view/seenStart.ts";
import { isShownByBrowser } from "../view/shownByBrowser.ts";
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

/** Marks an island whose figure has a chin under its body, for the progress of the sound. */
export const ISLAND_CHIN_ATTRIBUTE = "island-chin";

/** Marks every path that is drawn along the island's outline. */
export const ISLAND_OUTLINE_ATTRIBUTE = "island-outline";

/** The data attribute that marks the island's surface: what a press swells, and what its layers and its pieces stand in. */
export const ISLAND_SURFACE_ATTRIBUTE = "island-surface";

/** The data attribute that marks each of the layers the island's figure is drawn on. */
export const ISLAND_LAYER_ATTRIBUTE = "island-layer";

/**
 * What marks the pieces of a line of words that may travel, within its
 * place: the words themselves, and the line that is moved.
 */
export type MarqueeMarks = Readonly<{ words: string; line: string }>;

export const TITLE_MARKS: MarqueeMarks = { words: "title-words", line: "title-line" };
export const ARTIST_MARKS: MarqueeMarks = { words: "artist-words", line: "artist-line" };

/** A line fits when it is no wider than its place, give or take the rounding of a layout. */
const FITS_WITHIN_PIXELS = 0.5;

/** A quick tap can begin and end between two paints in iOS Safari. Hold
 * its visual feedback through the attack, independently of the click. */
const followIslandPress = (surface: Element): (() => void) => {
  const listeners = new AbortController();
  const options = { signal: listeners.signal, passive: true };
  let pointer: number | undefined;
  let pressedAt = 0;
  let releaseTimer: number | undefined;
  const clear = () => {
    window.clearTimeout(releaseTimer);
    pointer = undefined;
    surface.removeAttribute("data-pressed");
  };
  const press = (at: number) => {
    window.clearTimeout(releaseTimer);
    pressedAt = at;
    surface.setAttribute("data-pressed", "");
  };
  const release = (at: number) => {
    releaseTimer = window.setTimeout(clear, Math.max(0, 100 - (at - pressedAt)));
  };
  const isControl = (target: EventTarget | null) =>
    target instanceof Element && target.closest('a, button:not([aria-disabled="true"])') !== null;

  surface.addEventListener("pointerdown", (event) => {
    if (event instanceof PointerEvent && event.isPrimary && event.button === 0 && isControl(event.target)) {
      pointer = event.pointerId;
      press(event.timeStamp);
    }
  }, options);
  window.addEventListener("pointerup", (event) => {
    if (event.pointerId === pointer) {
      release(event.timeStamp);
    }
  }, options);
  window.addEventListener("pointercancel", (event) => {
    if (event.pointerId === pointer) {
      clear();
    }
  }, options);
  window.addEventListener("blur", clear, options);
  return () => {
    listeners.abort();
    clear();
  };
};

export const FollowIslandPress = Mount.define("FollowIslandPress", {
  messages: [Message.CompletedFollowIslandPress],
  execute: ({ element }) => Effect.gen(function* () {
    yield* Effect.acquireRelease(
      Effect.sync(() => followIslandPress(element)),
      (stop) => Effect.sync(stop),
    );
    return Message.CompletedFollowIslandPress();
  }),
});

/** A place still changing width is not measured until it has stood this long. */
const MEASURES_AFTER = Duration.millis(120);

const pixels = (length: string): number => {
  const parsed = Number.parseFloat(length);
  return Number.isFinite(parsed) ? parsed : 0;
};

type Measure = Readonly<{ placePixels: number; maybeTravelPixels: Option.Option<number> }>;

/**
 * A line of words as it lies in its place: the place's width, and how far
 * one pass takes the line when it does not fit. A pass ends with the line's
 * copy standing where the line began, so it goes the words' own width and
 * the gap between the two.
 */
const measureLine = (place: Element, marks: MarqueeMarks): Option.Option<Measure> =>
  Option.gen(function* () {
    const words = yield* Option.fromNullishOr(place.querySelector(`[data-${marks.words}]`));
    const line = yield* Option.fromNullishOr(place.querySelector(`[data-${marks.line}]`));
    const placeStyle = getComputedStyle(place);
    const placePixels =
      place.clientWidth - pixels(placeStyle.paddingLeft) - pixels(placeStyle.paddingRight);
    const wordsPixels = pixels(getComputedStyle(words).width);
    const gapPixels = pixels(getComputedStyle(line).columnGap);

    return {
      placePixels: Math.round(placePixels),
      maybeTravelPixels:
        wordsPixels > placePixels + FITS_WITHIN_PIXELS
          ? Option.some(Math.round(wordsPixels + gapPixels))
          : Option.none(),
    };
  });

/**
 * How a line lies in its place, said again whenever either changes width:
 * the place with the island, the words with the track. While the island is
 * on its way between its two places the width changes on every frame, and
 * nothing is said until it has settled.
 */
const measuresOf = <Measured>(
  element: Element,
  marks: MarqueeMarks,
  toMessage: (measure: Measure) => Measured,
): Stream.Stream<Measured> =>
  Stream.callback<void>((queue) =>
    Effect.gen(function* () {
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          const sizes = new ResizeObserver(() => Queue.offerUnsafe(queue, undefined));
          sizes.observe(element);
          Option.match(Option.fromNullishOr(element.querySelector(`[data-${marks.words}]`)), {
            onNone: () => undefined,
            onSome: (words) => sizes.observe(words),
          });
          return sizes;
        }),
        (sizes) => Effect.sync(() => sizes.disconnect()),
      );
      return yield* Effect.never;
    }),
  ).pipe(
    Stream.debounce(MEASURES_AFTER),
    Stream.map(() => Option.toArray(Option.map(measureLine(element, marks), toMessage))),
    Stream.flattenIterable,
    Stream.changesWith<Measured>(Equal.equals),
  );

/** Tells the Model how the title lies in its place. */
export const MeasureTitle = Mount.defineStream("MeasureTitle", {
  messages: [Message.MeasuredTitle],
  execute: ({ element }) => measuresOf(element, TITLE_MARKS, Message.MeasuredTitle),
});

/** Tells the Model how the line under the title, who the track is by, lies in its place. */
export const MeasureArtist = Mount.defineStream("MeasureArtist", {
  messages: [Message.MeasuredArtist],
  execute: ({ element }) => measuresOf(element, ARTIST_MARKS, Message.MeasuredArtist),
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

/** A time written in a style sheet, in milliseconds: `500ms`, or `.5s`. */
const milliseconds = (time: string, otherwise: number): number => {
  const value = Number.parseFloat(time);
  if (Number.isNaN(value)) {
    return otherwise;
  }
  return time.trim().endsWith("ms") ? value : value * 1000;
};

// NOTE: the island goes between its two places in the dock by two things at
// once. The style sheet moves it, on a spring: `transform`, from where it
// stood. And its width is the layout's, which changes in one frame: so what
// is drawn of it, its figure and its controls, is set back to the width it
// had and brought to the new one here.
//
// The two must go by one clock. Where the island's far end is seen to be is
// where it stands plus how wide it is drawn, and when its width was brought
// to the new one in a fraction of the time the spring takes, that end went
// the wrong way first: coming out, the island was whole width while it
// still stood in its row, its end and whatever of its light was on it thrown
// past the edge of the screen; drawing back, the end fell short and then
// went on, which read as a great bounce. So the width is given the spring's
// own time, curve and wait, read from the style sheet that gives them to the
// island's place (`--dock-out`, `--ease-island-out`, and the two for the way
// back, on the `dock-island` rules in view/dock.css).
const DOCK_OUT = { time: "--dock-out", curve: "--ease-island-out", waitMs: 30, otherwiseMs: 500 };
const DOCK_BACK = { time: "--dock-back", curve: "--ease-island-back", waitMs: 50, otherwiseMs: 620 };

/** Keep the figure and transport continuous across the single layout change.
 * The moving layers start at their currently displayed size on a reversal. */
const dockResizeMotion = (island: Element) => {
  const surface = `:scope > [data-${ISLAND_SURFACE_ATTRIBUTE}]`;
  const figures = island.querySelectorAll(`${surface} > [data-${ISLAND_LAYER_ATTRIBUTE}]`);
  const controls = island.querySelector(`${surface} > [role="group"]`);
  const words = island.querySelector(`${surface} > a`);
  const animations = new Map<Element, Animation>();
  const move = (element: Element, from: string, timing: KeyframeAnimationOptions): Animation => {
    animations.get(element)?.cancel();
    const animation = element.animate([{ transform: from }, { transform: "none" }], timing);
    animations.set(element, animation);
    return animation;
  };
  return (oldWidth: number, width: number, oldTail: number, tail: number) => {
    const spring = width < oldWidth ? DOCK_BACK : DOCK_OUT;
    const styles = getComputedStyle(island);
    const timing: KeyframeAnimationOptions = {
      duration: milliseconds(styles.getPropertyValue(spring.time), spring.otherwiseMs),
      delay: spring.waitMs,
      // Held at the width it had until the island sets off.
      fill: "backwards",
      easing: styles.getPropertyValue(spring.curve).trim() || "ease-out",
    };
    const figuresMoved = Array.from(figures, (figure) => {
      const scale = new DOMMatrixReadOnly(getComputedStyle(figure).transform).a;
      return move(figure, `scaleX(${scale * oldWidth / width})`, timing);
    });
    // How far the controls stand, in the new layout, from where they stood.
    const shift = oldWidth - oldTail - width + tail;
    const controlsMoved = controls
      ? [
          move(
            controls,
            `translateX(${new DOMMatrixReadOnly(getComputedStyle(controls).transform).e + shift}px)`,
            timing,
          ),
        ]
      : [];
    // NOTE: the words have the new layout's room at once. Widening, that
    // room reaches past where the controls are still drawn, and the title
    // would be read under them and beyond the island's end: it is cut where
    // the controls stand, and the cut goes with them. Narrowing, the room is
    // the smaller one already. The cut leaves room above, below and before
    // the words, where the cover stands out of the island.
    const maybeCut = words !== null && shift < 0 ? Option.some(words) : Option.none();
    const wordsCut = Option.match(maybeCut, {
      onNone: () => [],
      onSome: (cut) => {
        animations.get(cut)?.cancel();
        const animation = cut.animate(
          [
            { clipPath: `inset(-1rem ${-shift}px -1rem -1rem)` },
            { clipPath: "inset(-1rem 0px -1rem -1rem)" },
          ],
          timing,
        );
        animations.set(cut, animation);
        return [animation];
      },
    });
    // NOTE: the island changes width in the frame the navigation changes,
    // which is the long one: its figure sets off with the rest of the dock,
    // a frame later (see `seenStart.ts`).
    startWhenSeen([...figuresMoved, ...controlsMoved, ...wordsCut]);
  };
};

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
          const drawn = { outline: "", left: 0, width: 0, tail: 0 };
          const animateResize = dockResizeMotion(element);
          const maybeTail = Option.fromNullishOr(
            element.querySelector(`[data-${ISLAND_TAIL_ATTRIBUTE}]`),
          );
          const paths = element.querySelectorAll(`[data-${ISLAND_OUTLINE_ATTRIBUTE}]`);
          const maybeLight = lightOn(element);
          const draw = (): void => {
            const { width, left } = element.getBoundingClientRect();
            if (width === 0) {
              return;
            }
            const tailWidth = Option.match(maybeTail, {
              onNone: () => 0,
              onSome: (tail) => pixels(getComputedStyle(tail).width),
            });
            const outline = islandOutline(
              width,
              tailWidth,
              element.hasAttribute(`data-${ISLAND_CHIN_ATTRIBUTE}`),
            );
            if (outline === drawn.outline) {
              return;
            }
            // Where the light is on the outline about to be replaced: across the
            // page as the listener sees it, and up and down as the island has it,
            // since the island goes up and down whole and the light with it.
            const maybeHeld =
              drawn.outline === ""
                ? Option.none()
                : Option.flatMap(maybeLight, ({ lights, path }) => lightPlace(lights, path));
            paths.forEach((path) => path.setAttribute("d", outline));
            Option.match(Option.all({ light: maybeLight, held: maybeHeld }), {
              onNone: () => undefined,
              onSome: ({ light, held }) =>
                putLightNear(light.lights, light.path, {
                  x: held.x + drawn.left - left,
                  y: held.y,
                }),
            });
            if (drawn.width > 0 && drawn.tail !== tailWidth && element.closest('[data-input="Pointer"]') &&
              !isShownByBrowser() &&
              matchMedia("(width < 48rem) and (prefers-reduced-motion: no-preference)").matches) {
              animateResize(drawn.width, width, drawn.tail, tailWidth);
            }
            drawn.width = width;
            drawn.tail = tailWidth;
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
 * From then on the Command `ChangeIslandLightPace` follows the Model.
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
