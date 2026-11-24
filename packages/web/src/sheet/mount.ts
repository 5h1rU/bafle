import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { Command, Mount } from "foldkit";
import { type Axis, Edge, type Swipe, swipeOf } from "./geometry.ts";
import { Entrance, Message, type Reach } from "./model.ts";

// MOUNT

// The sheet's side of the document. The swipe itself needs nothing from
// here: it is a scroll. What is done here is what a scroll cannot do by
// itself: put the box where the sheet is whole as it enters the document,
// since a box that scrolls starts at its start; tell the Model how much of
// the sheet is on screen; and send the sheet away when the app asks.

/** Marks the piece the sheet is drawn in, what is in the sheet, and its stops. */
export const OVERLAY_ATTRIBUTE = "sheet-overlay";
export const CONTENT_ATTRIBUTE = "sheet-content";
export const STOP_ATTRIBUTE = "sheet-stop";

/**
 * The share of the sheet on screen from which it is taken to be whole. Not
 * all of it: the sheet's size and its place's come out of the same lengths
 * and can still differ by a fraction of a pixel once each is laid out, and a
 * sheet at rest would then never be whole.
 */
const WHOLE_FROM = 0.99;

/** The id of the box that scrolls, by the sheet's. */
export const scrollerId = (id: string): string => `${id}-scroller`;

const prefersLessMotion = (): boolean =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** One screen along the axis, in pixels: the box is two. */
const screenPixels = (scroller: HTMLElement, axis: Axis): number =>
  (axis === "y" ? scroller.clientHeight : scroller.clientWidth) / 2;

const scrollTo = (scroller: HTMLElement, axis: Axis, pixels: number, isSmooth: boolean): void => {
  const behavior: ScrollBehavior = isSmooth && !prefersLessMotion() ? "smooth" : "instant";
  scroller.scrollTo(axis === "y" ? { top: pixels, behavior } : { left: pixels, behavior });
};

const pixelsOf = (length: string): number => {
  const parsed = Number.parseFloat(length);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Where the box is scrolled to with a stop at rest: the stop's edge, moved by
 * the margin it snaps with, at the edge of the box it snaps to.
 */
const stopPixels = (scroller: HTMLElement, stop: Element, { axis, leavesByEnd }: Swipe): number => {
  const stopBox = stop.getBoundingClientRect();
  const scrollerBox = scroller.getBoundingClientRect();
  const style = getComputedStyle(stop);
  if (axis === "y") {
    return leavesByEnd
      ? stopBox.top - scrollerBox.top + scroller.scrollTop - pixelsOf(style.scrollMarginTop)
      : stopBox.bottom -
          scrollerBox.top +
          scroller.scrollTop +
          pixelsOf(style.scrollMarginBottom) -
          scroller.clientHeight;
  }
  return leavesByEnd
    ? stopBox.left - scrollerBox.left + scroller.scrollLeft - pixelsOf(style.scrollMarginLeft)
    : stopBox.right -
        scrollerBox.left +
        scroller.scrollLeft +
        pixelsOf(style.scrollMarginRight) -
        scroller.clientWidth;
};

/** Where the sheet opens to: its first stop when it has stops, or whole. */
const openPixels = (scroller: HTMLElement, swipe: Swipe): number =>
  Option.match(Option.fromNullishOr(scroller.querySelector(`[data-${STOP_ATTRIBUTE}]`)), {
    onNone: () => swipe.wholeAt * screenPixels(scroller, swipe.axis),
    onSome: (stop) => stopPixels(scroller, stop, swipe),
  });

/**
 * Bring the sheet to where it opens. A sheet that is whole where the scroll
 * starts is first put where it is gone, and slid in on the next frame: both
 * in one task can leave a browser at the place jumped to.
 */
const enter = (scroller: HTMLElement, swipe: Swipe, entrance: Entrance): (() => void) => {
  const { axis, goneAt } = swipe;
  if (entrance === "AtRest") {
    scrollTo(scroller, axis, openPixels(scroller, swipe), false);
    return () => undefined;
  }
  if (goneAt === 0) {
    scrollTo(scroller, axis, openPixels(scroller, swipe), true);
    return () => undefined;
  }
  scrollTo(scroller, axis, goneAt * screenPixels(scroller, axis), false);
  const frame = requestAnimationFrame(() =>
    scrollTo(scroller, axis, openPixels(scroller, swipe), true),
  );
  return () => cancelAnimationFrame(frame);
};

type Change = typeof Message.ChangedReach.Type;

/**
 * Bound to the box that scrolls. As the sheet enters the document it brings
 * it to where it opens, and from then on tells the Model how much of the
 * sheet is on screen: all of it, some of it, or none. None is told only of a
 * sheet that has been seen, so one sliding in from off the screen is not
 * taken for one swiped away.
 */
// NOTE: `initialEdge` and `initialEntrance` because a Mount's args are read
// once, as the element enters the document.
export const FollowSheet = Mount.defineStream("FollowSheet", {
  args: { initialEdge: Edge, initialEntrance: Entrance },
  messages: [Message.ChangedReach],
  execute: ({ element, initialEdge, initialEntrance }) =>
    Stream.callback<Change>((queue) =>
      Effect.gen(function* () {
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            if (!(element instanceof HTMLElement)) {
              return () => undefined;
            }
            const swipe = swipeOf(initialEdge);
            const cancelEntrance = enter(element, swipe, initialEntrance);
            const seen = { is: false };
            const watcher = new IntersectionObserver(
              (entries) => {
                const share = entries.at(-1)?.intersectionRatio ?? 0;
                const reach: Reach =
                  share >= WHOLE_FROM ? "Whole" : share > 0 ? "Partly" : "Gone";
                seen.is ||= share > 0;
                if (reach !== "Gone" || seen.is) {
                  Queue.offerUnsafe(queue, Message.ChangedReach({ reach }));
                }
              },
              { root: element.closest(`[data-${OVERLAY_ATTRIBUTE}]`), threshold: [0, WHOLE_FROM] },
            );
            Option.match(
              Option.fromNullishOr(element.querySelector(`[data-${CONTENT_ATTRIBUTE}]`)),
              { onNone: () => undefined, onSome: (content) => watcher.observe(content) },
            );
            return () => {
              cancelEntrance();
              watcher.disconnect();
            };
          }),
          (release) => Effect.sync(release),
        );
        return yield* Effect.never;
      }),
    ),
});

// COMMAND

/**
 * Slides the sheet off the screen by its edge. Nothing is said when it has
 * gone: the document says so itself, through `FollowSheet`, as it does of a
 * sheet the listener swiped away. A sheet that is not in the document has
 * nowhere to go.
 */
export const SlideAway = Command.define("SlideAway", {
  args: { id: Schema.String, edge: Edge },
  messages: [Message.CompletedSlideAway],
  execute: ({ id, edge }) =>
    Effect.sync(() => {
      const scroller = document.getElementById(scrollerId(id));
      if (scroller !== null) {
        const { axis, goneAt } = swipeOf(edge);
        scrollTo(scroller, axis, goneAt * screenPixels(scroller, axis), true);
      }
      return Message.CompletedSlideAway();
    }),
});
