import { describe, expect, test } from "vitest";
import {
  BODY_HEIGHT,
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

  test("a tail on its way in is only its round end, and takes no level edge yet", () => {
    const tailTop = BODY_HEIGHT / 2 - TAIL_HALF_HEIGHT;
    const points = pointsOf(islandOutline(WIDTH, 6));
    expect(points.some(([, y]) => y === tailTop)).toBe(false);
    // One more arc pair than with no tail at all.
    expect(islandOutline(WIDTH, 6).split("A").length).toBe(islandOutline(WIDTH, 0).split("A").length + 2);
  });

  test("the outline changes little across the point where the tail gains its edges", () => {
    // Just below and just above: the swell's start differs by the step in width alone.
    const before = pointsOf(islandOutline(WIDTH, 15.8))[0]!;
    const after = pointsOf(islandOutline(WIDTH, 16))[0]!;
    expect(Math.abs(before[0] - after[0])).toBeLessThan(0.3);
    expect(before[1]).toBe(after[1]);
  });
});
