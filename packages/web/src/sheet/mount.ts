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

type Change = typeof Message.ChangedReach.Type | typeof Message.LetGo.Type;

/**
 * How far along its way off the screen a sheet let go of has to be for it to
 * be going, and how fast it has to be moving that way for a shorter way to
 * do. In screens, and screens a second.
 */
const GOING_FROM = 0.25;
const FLICKED_FROM = 0.04;
const FLICK_SCREENS_PER_SECOND = 0.7;
/** How slowly back towards its place it can be moving and still be going. */
const DRIFT_SCREENS_PER_SECOND = -0.1;
/**
 * How far behind what is seen the page's own account of a moving box runs,
 * and the most, in screens, that is made up for.
 */
const SEEN_AHEAD_SECONDS = 0.07;
const SEEN_AHEAD_AT_MOST = 0.14;
/** How long a sheet let go of is held where it stands, for its owner to take it. */
const HELD_FOR_MILLISECONDS = 800;

/**
 * Tells when the listener lets go of a sheet that is on its way off the
 * screen. The swipe is the browser's own scroll, and says nothing of the
 * finger: this watches where the box is scrolled to, and how fast, and asks
 * at the moment the finger lifts.
 */
const watchLettingGo = (
  scroller: HTMLElement,
  { axis, wholeAt, goneAt }: Swipe,
  onLetGo: () => void,
): (() => void) => {
  // How far along the way from whole to gone, in screens: 0 whole, 1 gone.
  const along = (): number => {
    const screen = screenPixels(scroller, axis);
    if (screen === 0) {
      return 0;
    }
    const at = (axis === "y" ? scroller.scrollTop : scroller.scrollLeft) / screen;
    return (at - wholeAt) / (goneAt - wholeAt);
  };
  const last = { along: along(), time: performance.now(), speed: 0 };
  const onScroll = (): void => {
    const now = performance.now();
    const here = along();
    const elapsed = (now - last.time) / 1000;
    if (elapsed > 0) {
      last.speed = (here - last.along) / elapsed;
    }
    last.along = here;
    last.time = now;
  };
  const onLift = (event: TouchEvent): void => {
    // A finger still on the screen holds the sheet.
    if (event.touches.length > 0) {
      return;
    }
    const here = along();
    // A sheet that has kept still since its last move is not moving.
    const speed = performance.now() - last.time > 100 ? 0 : last.speed;
    const isGoing =
      (here >= GOING_FROM && speed >= DRIFT_SCREENS_PER_SECOND) ||
      (here >= FLICKED_FROM && speed >= FLICK_SCREENS_PER_SECOND);
    if (isGoing) {
      // NOTE: the box is held where it is. Let go, it runs on by itself, and
      // the browser runs it ahead of what the page knows of it: a picture of
      // the sheet taken a moment later, for a transition, showed it where the
      // page last knew it to be, a long step back from where it was seen. A
      // box that cannot scroll stops where it stands, which asking it to
      // scroll to where it is does not do while it is running. It is given
      // its scroll back shortly, should its owner not have taken it away.
      //
      // What the page knows of where the box is runs a frame or two behind
      // what is seen while a finger moves it, so the box is held a little
      // further on than the page has it: where it was last moving to.
      const screen = screenPixels(scroller, axis);
      const further = Math.max(0, Math.min(speed * SEEN_AHEAD_SECONDS, SEEN_AHEAD_AT_MOST));
      const heldAt = (wholeAt + (here + further) * (goneAt - wholeAt)) * screen;
      // NOTE: the box snaps to its two ends, and a box that is put somewhere
      // is taken to the nearer of them: the sheet went back to the top of
      // the screen for a moment. So it is first told to snap to nothing.
      const kept = { overflow: scroller.style.overflow, snap: scroller.style.scrollSnapType };
      scroller.style.scrollSnapType = "none";
      scrollTo(scroller, axis, heldAt, false);
      scroller.style.overflow = "hidden";
      setTimeout(() => {
        scroller.style.overflow = kept.overflow;
        scroller.style.scrollSnapType = kept.snap;
      }, HELD_FOR_MILLISECONDS);
      onLetGo();
    }
  };
  scroller.addEventListener("scroll", onScroll, { passive: true });
  scroller.addEventListener("touchend", onLift, { passive: true });
  return () => {
    scroller.removeEventListener("scroll", onScroll);
    scroller.removeEventListener("touchend", onLift);
  };
};

/**
 * Bound to the box that scrolls. As the sheet enters the document it brings
 * it to where it opens, and from then on tells the Model how much of the
 * sheet is on screen: all of it, some of it, or none. None is told only of a
 * sheet that has been seen, so one sliding in from off the screen is not
 * taken for one swiped away. It also tells when the listener lets go of a
 * sheet that is on its way out (`watchLettingGo`).
 */
// NOTE: `initialEdge` and `initialEntrance` because a Mount's args are read
// once, as the element enters the document.
export const FollowSheet = Mount.defineStream("FollowSheet", {
  args: { initialEdge: Edge, initialEntrance: Entrance },
  messages: [Message.ChangedReach, Message.LetGo],
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
            const stopWatchingLettingGo = watchLettingGo(element, swipe, () => {
              Queue.offerUnsafe(queue, Message.LetGo());
            });
            return () => {
              cancelEntrance();
              watcher.disconnect();
              stopWatchingLettingGo();
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
