import * as Array from "effect/Array";
import { pipe } from "effect/Function";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

// MODEL

/**
 * Which way a row that goes on sideways is turned by one of its two arrows:
 * back towards its start, or onward to what it has not shown yet.
 */
export const TurnWay = Schema.Literals(["Back", "Onward"]);
export type TurnWay = typeof TurnWay.Type;

/** A stretch along a row, measured from the start of what the row holds. */
export type Span = Readonly<{ from: number; to: number }>;

// NOTE: places in a row are fractions of a pixel, and a piece that stands
// at the row's edge is not past it for being a hair over.
const SLACK = 1;

const isCutAtEnd =
  (seen: Span) =>
  (piece: Span): boolean =>
    piece.to > seen.to + SLACK;

const isCutAtStart =
  (seen: Span) =>
  (piece: Span): boolean =>
    piece.from < seen.from - SLACK;

/**
 * Where the part of a row that is seen starts once the row is turned, or
 * nothing when there is no more that way. A turn is a screenful, and never
 * skips a piece: onward, the first piece not seen whole comes to the leading
 * edge; back, the last piece before the leading edge is the one the turn
 * ends on, with as many before it as there is room for. Either way a piece
 * stands at the leading edge, where the row snaps.
 */
export const turnedFrom = (
  way: TurnWay,
  pieces: ReadonlyArray<Span>,
  seen: Span,
): Option.Option<number> =>
  way === "Onward"
    ? pipe(
        Array.findFirst(pieces, isCutAtEnd(seen)),
        Option.map((cut) => cut.from),
      )
    : pipe(
        Array.findLast(pieces, isCutAtStart(seen)),
        Option.map((cut) => {
          const room = seen.to - seen.from;

          return pipe(
            Array.findFirst(pieces, (piece) => piece.from >= cut.to - room - SLACK),
            Option.match({
              onNone: () => cut.from,
              onSome: (first) => Math.min(first.from, cut.from),
            }),
          );
        }),
      );
