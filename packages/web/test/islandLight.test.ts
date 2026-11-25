import { describe, expect, test } from "vitest";
import { lengthNearest, type Place, wayRound } from "../src/player/islandLight.ts";

/** A box walked clockwise from its top left corner: `wide` across and 40 down. */
const box =
  (wide: number) =>
  (length: number): Place => {
    if (length <= wide) {
      return { x: length, y: 0 };
    }
    if (length <= wide + 40) {
      return { x: wide, y: length - wide };
    }
    if (length <= 2 * wide + 40) {
      return { x: 2 * wide + 40 - length, y: 40 };
    }
    return { x: 0, y: 2 * wide + 80 - length };
  };

const around = (wide: number): number => 2 * wide + 80;

describe("the place on an outline nearest to a place", () => {
  test("a place on the outline is found where it is", () => {
    // 30 from the left along the bottom of a box 100 wide: 100 + 40 + 70 round.
    expect(lengthNearest(around(100), box(100), { x: 30, y: 40 })).toBeCloseTo(210, 1);
  });

  test("a place off the outline is found on the side it is nearest to", () => {
    expect(lengthNearest(around(100), box(100), { x: 60, y: 6 })).toBeCloseTo(60, 1);
    expect(lengthNearest(around(100), box(100), { x: 60, y: 36 })).toBeCloseTo(180, 1);
  });

  test("an outline that grows keeps the place across the page, not the share of the way round", () => {
    const share = 210 / around(100);
    // The same share of a box 160 wide is 30 back along its bottom.
    expect(box(160)(share * around(160)).x).toBeCloseTo(60, 1);
    // The same place is where it was.
    const length = lengthNearest(around(160), box(160), { x: 30, y: 40 });
    expect(box(160)(length)).toEqual({ x: 30, y: 40 });
  });

  test("a small resize finds the previous phase without sampling the full contour", () => {
    let queries = 0;
    const point = box(302);
    const measured = (length: number) => {
      queries++;
      return point(length);
    };
    const length = lengthNearest(around(302), measured, { x: 85, y: 40 }, 560);
    expect(point(length).x).toBeCloseTo(85, 1);
    expect(point(length).y).toBe(40);
    expect(queries).toBeLessThan(20);
  });

  test("the search goes on past the place the outline starts and ends", () => {
    // Just short of the end of the way round, up the left side.
    expect(lengthNearest(around(100), box(100), { x: 0, y: 1.5 })).toBeCloseTo(278.5, 1);
  });
});

describe("the shorter way round", () => {
  test("ahead is positive, behind is negative", () => {
    expect(wayRound(0.2, 0.3)).toBeCloseTo(0.1);
    expect(wayRound(0.3, 0.2)).toBeCloseTo(-0.1);
  });

  test("it crosses the start of the outline when that is shorter", () => {
    expect(wayRound(0.95, 0.05)).toBeCloseTo(0.1);
    expect(wayRound(0.05, 0.95)).toBeCloseTo(-0.1);
  });
});
