import { describe, expect, test } from "vitest";
import {
  BODY_HEIGHT,
  CHIN_DEPTH,
  COVER_RADIUS,
  islandOutline,
  SWELL_RADIUS,
  TAIL_HALF_HEIGHT,
  TAIL_WIDTH,
} from "../src/view/islandOutline.ts";

const WIDTH = 335;

/** Every number in a path, in the order written. */
const numbersOf = (path: string): ReadonlyArray<number> =>
  (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

/** The points a path passes through: the end of each of its commands. */
const pointsOf = (path: string): ReadonlyArray<readonly [number, number]> =>
  path
    .split(/(?=[MLA])/)
    .map((command) => numbersOf(command).slice(-2))
    .filter((pair): pair is [number, number] => pair.length === 2);

describe("the island's outline", () => {
  test("it is one closed path, and every number in it is a number", () => {
    [0, 4, 12, TAIL_WIDTH].forEach((tailWidth) => {
      const path = islandOutline(WIDTH, tailWidth);
      expect(path.startsWith("M ")).toBe(true);
      expect(path.endsWith(" Z")).toBe(true);
      expect(path).not.toContain("NaN");
      expect(numbersOf(path).every(Number.isFinite)).toBe(true);
    });
  });

  test("it sets out from the top of the swell, above the body", () => {
    const [[x, y]] = pointsOf(islandOutline(WIDTH, 0));
    expect(x).toBeGreaterThan(WIDTH - 2 * SWELL_RADIUS);
    expect(x).toBeLessThan(WIDTH - SWELL_RADIUS);
    expect(y).toBeLessThan(0);
  });

  test("the body's two edges are level, at the top and the foot of the box", () => {
    const points = pointsOf(islandOutline(WIDTH, 0));
    expect(points.filter(([, y]) => y === 0)).toHaveLength(2);
    expect(points.filter(([, y]) => y === BODY_HEIGHT)).toHaveLength(2);
  });

  test("the lower half mirrors the upper one", () => {
    // The path ends where it began, so its first point is written twice.
    const points = pointsOf(islandOutline(WIDTH, TAIL_WIDTH)).slice(1);
    const upper = points.filter(([, y]) => y < BODY_HEIGHT / 2);
    const lower = points.filter(([, y]) => y > BODY_HEIGHT / 2);
    expect(lower).toHaveLength(upper.length);
    upper.forEach(([x, y]) => {
      expect(lower.some(([lx, ly]) => lx === x && Math.abs(ly - (BODY_HEIGHT - y)) < 0.011)).toBe(true);
    });
  });

  test("the joins meet the cover and the swell above the body, within their overhang", () => {
    const points = pointsOf(islandOutline(WIDTH, 0));
    const aboveBody = points.filter(([, y]) => y < 0).map(([, y]) => y);
    expect(Math.min(...aboveBody)).toBeGreaterThan(BODY_HEIGHT / 2 - SWELL_RADIUS);
    const nearCover = points.filter(([x, y]) => x < WIDTH / 2 && y < 0);
    expect(nearCover).toHaveLength(1);
    expect(nearCover[0]![1]).toBeGreaterThan(BODY_HEIGHT / 2 - COVER_RADIUS);
  });

  test("a whole tail has level edges and ends in a half disc at the island's right end", () => {
    const points = pointsOf(islandOutline(WIDTH, TAIL_WIDTH));
    const tailTop = BODY_HEIGHT / 2 - TAIL_HALF_HEIGHT;
    const capTop = points.find(([x, y]) => x === WIDTH - TAIL_HALF_HEIGHT && y === tailTop);
    expect(capTop).toBeDefined();
    // The swell moved left by the tail's width: the control keeps clear of Next.
    const [[startX]] = points;
    expect(startX).toBeLessThan(WIDTH - TAIL_WIDTH - SWELL_RADIUS);
  });

  test("a tail on its way in is only its round end, joined to the swell by a curve, with no level edge yet", () => {
    const tailTop = BODY_HEIGHT / 2 - TAIL_HALF_HEIGHT;
    const path = islandOutline(WIDTH, 6);
    expect(pointsOf(path).some(([, y]) => y === tailTop)).toBe(false);
    // The round end and a join above and below it: four more arcs than with no tail.
    expect(path.split("A").length).toBe(islandOutline(WIDTH, 0).split("A").length + 4);
    expect(path.split("L").length).toBe(islandOutline(WIDTH, 0).split("L").length);
  });

  test("a tail hardly begun changes the outline hardly at all", () => {
    const none = pointsOf(islandOutline(WIDTH, 0));
    const begun = pointsOf(islandOutline(WIDTH + 0.5, 0.5));
    // The swell has not moved, and what was added lies within a pixel or so of its end.
    expect(begun[0]).toEqual(none[0]);
    const added = begun.slice(1, 5);
    added.forEach(([x]) => expect(x).toBeGreaterThan(WIDTH - 12));
  });

  test("where the tail gains its level edge, both ways of drawing it meet", () => {
    // Just below and just above that length, with the swell held in place.
    const swellAt = WIDTH - SWELL_RADIUS;
    const before = pointsOf(islandOutline(swellAt + SWELL_RADIUS + 15.85, 15.85));
    const after = pointsOf(islandOutline(swellAt + SWELL_RADIUS + 15.95, 15.95));
    expect(before[0]).toEqual(after[0]);
    // The join leaves the swell at the same point either way.
    expect(Math.abs(before[1]![0] - after[1]![0])).toBeLessThan(0.1);
    expect(Math.abs(before[1]![1] - after[1]![1])).toBeLessThan(0.1);
    // And reaches the tail at its top, where the edge is about to begin.
    const tailTop = BODY_HEIGHT / 2 - TAIL_HALF_HEIGHT;
    expect(Math.abs(before[2]![1] - tailTop)).toBeLessThan(0.1);
    expect(after[2]![1]).toBe(tailTop);
  });
});

describe("an island with a chin", () => {
  const ys = (outline: string): ReadonlyArray<number> => pointsOf(outline).map(([, y]) => y);

  test("its underside is the chin's: it hangs a chin's depth below the body, from the cover to the swell", () => {
    const outline = islandOutline(672, TAIL_WIDTH, true);
    const foot = BODY_HEIGHT + CHIN_DEPTH;

    expect(Math.max(...ys(outline))).toBe(foot);
    // Its foot is level between its two round corners.
    expect(outline).toContain(`L 80 ${String(foot)}`);
    // Its top is the island's own: the chin changes nothing above the body's middle.
    expect(outline.split(" A 27 27")[0]).toBe(islandOutline(672, TAIL_WIDTH).split(" A 27 27")[0]);
  });

  test("without one, nothing is lower than the body's foot but the swell and the cover", () => {
    expect(Math.max(...ys(islandOutline(672, TAIL_WIDTH)))).toBeLessThan(BODY_HEIGHT + 6);
  });

  test("an island too narrow for a chin has none", () => {
    expect(islandOutline(120, 0, true)).toBe(islandOutline(120, 0));
  });
});
