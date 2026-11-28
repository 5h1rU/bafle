import * as Schema from "effect/Schema";

// SHEET GEOMETRY

// A sheet is swiped by the browser, not by the app. It lives in a box that
// scrolls: scrolling carries a stage the size of the screen, which holds the
// sheet, on and off the screen, and the box snaps to the two places where the
// sheet is whole and where it is gone. The listener's finger is then an
// ordinary scroll, with the momentum and the stretch at the end that every
// scroll on their device has, and nothing follows a pointer frame by frame.
//
// The box is two screens long, and only its first screen is seen (the piece
// around it clips the rest). Its content is three screens long: a mark at its
// start, the stage one screen in, a mark at its end. So it can scroll by one
// screen, and its two ends are the sheet's two places.
//
// This is the geometry of React Aria's Sheet, kept as it is there. What
// differs is the measure: there the screen is the viewport, here it is the
// piece the sheet is drawn in, which says so by being a size container, and
// every length is in shares of it (`cqh`, `cqw`).

/** The edge of its place a sheet stands at, comes from, and leaves by. */
export const Edge = Schema.Literals(["Bottom", "Top", "Left", "Right"]);
export type Edge = typeof Edge.Type;

/** Along which way the sheet travels. */
export type Axis = "x" | "y";

/** A set of inline styles. */
export type Styles = Readonly<Record<string, string>>;

export type Swipe = Readonly<{
  axis: Axis;
  /** Whether the sheet leaves by the end of the axis: the foot, or the right. */
  leavesByEnd: boolean;
  /** Where the box is scrolled to, in screens, with the sheet whole. */
  wholeAt: 0 | 1;
  /** Where it is scrolled to with the sheet gone. */
  goneAt: 0 | 1;
  /** Where the box starts, in screens from the start of its place. */
  boxStartsAt: 0 | -1;
  /** The stretch of the sheet's timeline over which it crosses its edge. */
  range: "entry" | "exit";
  /** Which way an animation runs along that stretch, to go from gone to whole. */
  direction: "normal" | "reverse";
}>;

/**
 * How a sheet at this edge is swiped. A sheet that leaves by the end of the
 * axis is whole one screen in and gone at the start of the scroll. One that
 * leaves by the start is whole where the scroll starts, so the box is set
 * one screen back to bring that place on screen.
 *
 * A timeline that follows the sheet across its edge runs from gone to whole
 * when the sheet comes in by the end (`entry`), and from whole to gone when
 * it leaves by the start (`exit`), which is why that one is run backwards:
 * animations are written from gone to whole, whichever the edge.
 */
export const swipeOf = (edge: Edge): Swipe => {
  const axis: Axis = edge === "Bottom" || edge === "Top" ? "y" : "x";
  const leavesByEnd = edge === "Bottom" || edge === "Right";
  return {
    axis,
    leavesByEnd,
    wholeAt: leavesByEnd ? 1 : 0,
    goneAt: leavesByEnd ? 0 : 1,
    boxStartsAt: leavesByEnd ? 0 : -1,
    range: leavesByEnd ? "entry" : "exit",
    direction: leavesByEnd ? "normal" : "reverse",
  };
};

/** One screen along the axis: the length of the piece the sheet is drawn in. */
export const screenAlong = (axis: Axis): string => (axis === "y" ? "100cqh" : "100cqw");

const screens = (count: number, axis: Axis): string =>
  `${count * 100}${axis === "y" ? "cqh" : "cqw"}`;

/** The name a sheet's timeline goes by: what follows its swipe is tied to it by this. */
export const timelineName = (id: string): string => `--sheet-${id}`;

/**
 * The piece the sheet is drawn in. It is the measure of a screen, it clips
 * what the box holds beyond it, and it is where the sheet's timeline is made
 * known, so that the backdrop, which is beside the sheet and not in it, can
 * follow it too.
 */
export const overlayStyles = (id: string): Styles => ({
  position: "absolute",
  inset: "0",
  overflow: "clip",
  containerType: "size",
  timelineScope: timelineName(id),
});

/** The box that scrolls: two screens along the axis, one across. */
export const scrollerStyles = ({ axis, boxStartsAt }: Swipe): Styles => ({
  position: "absolute",
  top: axis === "y" ? screens(boxStartsAt, "y") : "0",
  left: axis === "x" ? screens(boxStartsAt, "x") : "0",
  height: axis === "y" ? screens(2, "y") : screens(1, "y"),
  width: axis === "x" ? screens(2, "x") : screens(1, "x"),
  overflowX: axis === "x" ? "auto" : "hidden",
  overflowY: axis === "y" ? "auto" : "hidden",
  scrollSnapType: `${axis} mandatory`,
  // The scroll ends here: reaching either end never scrolls the page behind.
  overscrollBehaviorX: axis === "x" ? "contain" : "none",
  overscrollBehaviorY: axis === "y" ? "contain" : "none",
  scrollbarWidth: "none",
  // The geometry is in left and right, whichever way the document is written.
  direction: "ltr",
});

/**
 * A mark the box snaps to: a screen long, so that the edge named in `snaps`
 * is where the scroll comes to rest.
 */
const markStyles = (axis: Axis, at: number, snaps: "start" | "end"): Styles => ({
  position: "absolute",
  top: axis === "y" ? screens(at, "y") : "0",
  left: axis === "x" ? screens(at, "x") : "0",
  height: axis === "y" ? screens(1, "y") : "1px",
  width: axis === "x" ? screens(1, "x") : "1px",
  scrollSnapAlign: snaps,
  pointerEvents: "none",
});

/** The mark at the start of the scroll, and the one at its end. */
export const startMarkStyles = ({ axis }: Swipe): Styles => markStyles(axis, 0, "start");
export const endMarkStyles = ({ axis }: Swipe): Styles => markStyles(axis, 2, "end");

/** Where the sheet stands across and along its stage, for each edge. */
const STANDS: Readonly<Record<Edge, readonly [across: string, along: string]>> = {
  Bottom: ["center", "flex-end"],
  Top: ["center", "flex-start"],
  Left: ["center", "flex-start"],
  Right: ["center", "flex-end"],
};

/** The stage: one screen, one screen into the scroll, with the sheet at its edge. */
export const stageStyles = (edge: Edge): Styles => {
  const { axis } = swipeOf(edge);
  const [across, along] = STANDS[edge];
  return {
    position: "absolute",
    top: axis === "y" ? screens(1, "y") : "0",
    left: axis === "x" ? screens(1, "x") : "0",
    height: screens(1, "y"),
    width: screens(1, "x"),
    display: "flex",
    flexDirection: axis === "y" ? "column" : "row",
    alignItems: across,
    justifyContent: along,
  };
};

/** The side of a box an edge is, as CSS names it. */
const SIDE: Readonly<Record<Edge, "Bottom" | "Top" | "Left" | "Right">> = {
  Bottom: "Bottom",
  Top: "Top",
  Left: "Left",
  Right: "Right",
};

/**
 * The sheet itself. With `continuesPastEdge` it is drawn a screen longer on
 * the side of its edge, and set back by as much, so that a scroll stretched
 * past the sheet's whole place shows more sheet and not what is behind it.
 */
export const sheetStyles = (edge: Edge, continuesPastEdge: boolean): Styles => {
  const { axis } = swipeOf(edge);
  return {
    // The stops are placed from the sheet's own box.
    position: "relative",
    ...(continuesPastEdge
      ? {
          [`padding${SIDE[edge]}`]: screenAlong(axis),
          [`margin${SIDE[edge]}`]: `-${screenAlong(axis)}`,
        }
      : {}),
  };
};

/**
 * What is in the sheet. It is what the sheet's timeline follows, and not the
 * sheet, which may be longer than what is seen of it. The timeline looks only
 * at the screen that is seen, the first of the box's two.
 */
export const contentStyles = (id: string, { axis, leavesByEnd }: Swipe): Styles => ({
  width: "100%",
  height: "100%",
  viewTimelineName: timelineName(id),
  viewTimelineAxis: axis,
  viewTimelineInset: leavesByEnd ? `0px ${screenAlong(axis)}` : `${screenAlong(axis)} 0px`,
});

/**
 * The box the stops are placed in: the sheet as it is seen, without the
 * length it was given past its edge, so that a share of the sheet is a share
 * of what is seen.
 */
export const stopsStyles = (edge: Edge, continuesPastEdge: boolean): Styles => ({
  position: "absolute",
  inset: "0",
  ...(continuesPastEdge ? { [SIDE[edge].toLowerCase()]: screenAlong(swipeOf(edge).axis) } : {}),
  pointerEvents: "none",
});

/**
 * A stop: a place short of whole where the sheet comes to rest, given as how
 * much of the sheet is then seen (any CSS length; a share is of the sheet).
 * It is a mark in the sheet, that far in from the edge that comes in first.
 * It travels with the sheet, and snaps one screen from the start of the box,
 * which is the far edge of what is seen: that leaves exactly that much of the
 * sheet on screen.
 */
export const stopStyles = (shown: string, { axis, leavesByEnd }: Swipe): Styles => {
  const screen = screenAlong(axis);
  const place: Styles =
    axis === "y"
      ? leavesByEnd
        ? { top: shown, left: "0", scrollMarginTop: screen }
        : { bottom: shown, left: "0", scrollMarginBottom: screen }
      : leavesByEnd
        ? { top: "0", left: shown, scrollMarginLeft: screen }
        : { top: "0", right: shown, scrollMarginRight: screen };
  return {
    position: "absolute",
    width: "1px",
    height: "1px",
    scrollSnapAlign: leavesByEnd ? "start" : "end",
    ...place,
  };
};

/** Between which two stops an animation follows the swipe: by default, all of the sheet's way. */
export type FollowsBetween = Readonly<{ from?: number; to?: number }>;

/**
 * An animation that follows the swipe: the keyframes named, played by the
 * sheet's timeline in place of a clock, from gone to whole. A browser that
 * has no such timelines plays it at once to its end, which is the sheet
 * whole: what follows the swipe there is simply as it is at rest.
 */
export const followsSwipeStyles = (
  id: string,
  { range, direction, leavesByEnd }: Swipe,
  keyframes: string,
  stops: ReadonlyArray<string> = [],
  between: FollowsBetween = {},
): Styles => {
  const from = between.from === undefined ? "0%" : (stops[between.from] ?? "0%");
  const to = between.to === undefined ? "100%" : (stops[between.to] ?? "100%");
  // A sheet that leaves by the start is measured from the other end.
  const [start, end] = leavesByEnd ? [from, to] : [`calc(100% - ${to})`, `calc(100% - ${from})`];
  return {
    animationName: keyframes,
    animationTimeline: timelineName(id),
    animationDirection: direction,
    animationIterationCount: "1",
    animationFillMode: "both",
    animationRange: `${range} ${start} ${range} ${end}`,
    animationTimingFunction: "linear",
    animationComposition: "replace",
  };
};
