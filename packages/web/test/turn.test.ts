import * as Array from "effect/Array";
import * as Option from "effect/Option";
import { describe, expect, test } from "vitest";
import { type Span, turnedFrom } from "../src/turn.ts";

/** A shelf of tiles 160 wide and 20 apart, the first at the row's leading edge. */
const PITCH = 180;
const tiles = (count: number): ReadonlyArray<Span> =>
  Array.makeBy(count, (index) => ({ from: index * PITCH, to: index * PITCH + 160 }));

/** What a row 1000 wide shows when the tile at `index` stands at its leading edge: five tiles whole, and part of the sixth. */
const seenAt = (index: number): Span => ({ from: index * PITCH, to: index * PITCH + 1000 });

describe("a row turned by its arrows", () => {
  test("onward, the first tile not seen whole comes to the leading edge", () => {
    expect(turnedFrom("Onward", tiles(20), seenAt(0))).toEqual(Option.some(5 * PITCH));
    expect(turnedFrom("Onward", tiles(20), seenAt(5))).toEqual(Option.some(10 * PITCH));
  });

  test("back undoes a turn onward", () => {
    expect(turnedFrom("Back", tiles(20), seenAt(10))).toEqual(Option.some(5 * PITCH));
    expect(turnedFrom("Back", tiles(20), seenAt(5))).toEqual(Option.some(0));
  });

  test("back from less than a screenful in ends at the row's start", () => {
    expect(turnedFrom("Back", tiles(20), seenAt(2))).toEqual(Option.some(0));
  });

  test("there is nothing to turn to where the row shows its end, or its start", () => {
    expect(turnedFrom("Onward", tiles(5), seenAt(0))).toEqual(Option.none());
    expect(turnedFrom("Back", tiles(20), seenAt(0))).toEqual(Option.none());
  });

  test("a tile a hair over the row's edge is seen whole", () => {
    const seen: Span = { from: 0.4, to: 5 * PITCH - 20 - 0.4 };

    expect(turnedFrom("Onward", tiles(5), seen)).toEqual(Option.none());
    expect(turnedFrom("Back", tiles(5), seen)).toEqual(Option.none());
  });

  test("a list in columns turns by its columns: every row of one starts where it does", () => {
    const columns = Array.flatMap(Array.makeBy(4, (column) => column * 500), (from) =>
      Array.makeBy(5, (): Span => ({ from, to: from + 460 })),
    );

    // Two columns whole and the edge of the third.
    expect(turnedFrom("Onward", columns, { from: 0, to: 1000 })).toEqual(Option.some(1000));
    expect(turnedFrom("Back", columns, { from: 1000, to: 2000 })).toEqual(Option.some(0));
  });

  test("a piece wider than the row is still turned back to", () => {
    const wide: ReadonlyArray<Span> = [
      { from: 0, to: 1500 },
      { from: 1520, to: 3020 },
    ];

    expect(turnedFrom("Back", wide, { from: 1520, to: 2520 })).toEqual(Option.some(0));
  });
});
