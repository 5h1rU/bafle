// ISLAND OUTLINE

// The island is one outline around three figures: the cover, a disc at its
// left end; the body, a bar lower than the disc; and the swell around the
// control that starts and stops the sound. Past the swell there may be a
// tail, lower than the body, that holds Next. Where two figures meet, the
// outline curves from one into the other instead of turning a corner.
//
// Everything is in CSS pixels, from the top left corner of the island's own
// box: the body fills that box's height, and the cover and the swell stand
// out above and below it.

/** The body's height: the height of the island's box. */
export const BODY_HEIGHT = 44;

/** The cover is a disc at the left end, a little taller than the body. */
export const COVER_RADIUS = 25;

/** The swell around the main control: the control's own disc, and the rim of island around it. */
export const SWELL_RADIUS = 27;

/** The tail is lower than the body; its end is a half disc of this radius. */
export const TAIL_HALF_HEIGHT = 18;

/** How far the tail reaches past the swell when Next is whole. */
export const TAIL_WIDTH = 34;

// The radius of the curve that joins two figures. The larger it is, the
// longer and gentler the join.
const COVER_JOIN_RADIUS = 40;
const SWELL_JOIN_RADIUS = 30;
const TAIL_JOIN_RADIUS = 12;

const MIDDLE = BODY_HEIGHT / 2;

type Point = Readonly<{ x: number; y: number }>;

/**
 * A join is a circle outside the island that touches both a disc and a
 * level edge. Its centre lies its own radius away from the edge, and the sum
 * of the two radii away from the disc's centre: this is how far along the
 * edge that puts it.
 */
const joinReach = (discRadius: number, joinRadius: number, edgeFromMiddle: number): number =>
  Math.sqrt((discRadius + joinRadius) ** 2 - (edgeFromMiddle + joinRadius) ** 2);

/** Where a disc and a join touch: on the line between their centres. */
const touchPoint = (disc: Point, discRadius: number, join: Point, joinRadius: number): Point => {
  const share = discRadius / (discRadius + joinRadius);
  return { x: disc.x + (join.x - disc.x) * share, y: disc.y + (join.y - disc.y) * share };
};

/** The same point on the lower half of the island. */
const below = (point: Point): Point => ({ x: point.x, y: BODY_HEIGHT - point.y });

const round = (value: number): number => Math.round(value * 100) / 100;

const at = (point: Point): string => `${round(point.x)} ${round(point.y)}`;

const lineTo = (point: Point): string => `L ${at(point)}`;

/** Along the edge of a figure, the way the outline travels: clockwise. */
const around = (radius: number, to: Point, isLongWay = false): string =>
  `A ${radius} ${radius} 0 ${isLongWay ? 1 : 0} 1 ${at(to)}`;

/** Along a join: the other way, since it curves into the island. */
const joining = (radius: number, to: Point): string => `A ${radius} ${radius} 0 0 0 ${at(to)}`;

const TAIL_JOIN_REACH = joinReach(SWELL_RADIUS, TAIL_JOIN_RADIUS, TAIL_HALF_HEIGHT);

/**
 * The least the tail must reach past the swell for its level edge to have
 * any length between the join and its round end.
 */
const TAIL_NEEDS = TAIL_JOIN_REACH + TAIL_HALF_HEIGHT - SWELL_RADIUS;

/**
 * The right end, from the top of the swell round to its underside. With no
 * tail, the swell is the end of the island. A tail is joined to the swell by
 * a curve at every length, so that it can be drawn in and out without a
 * corner appearing: while it is too short to have a level edge it is only
 * its round end showing from behind the swell, and the curve joins the two
 * discs. At the length where the edge begins, both ways of drawing it give
 * the same outline.
 */
const rightEnd = (swell: Point, width: number, tailWidth: number, endsAt: Point): ReadonlyArray<string> => {
  if (tailWidth <= 0) {
    return [around(SWELL_RADIUS, endsAt, true)];
  }

  const tailEnd: Point = { x: width - TAIL_HALF_HEIGHT, y: MIDDLE };
  const tailTop = MIDDLE - TAIL_HALF_HEIGHT;

  if (tailWidth < TAIL_NEEDS) {
    // The join touches both discs: its centre is the sum of the radii away
    // from each of their centres, which fixes it by the three sides of a
    // triangle.
    const apart = tailEnd.x - swell.x;
    const fromSwell = SWELL_RADIUS + TAIL_JOIN_RADIUS;
    const fromTailEnd = TAIL_HALF_HEIGHT + TAIL_JOIN_RADIUS;
    const along = (apart ** 2 + fromSwell ** 2 - fromTailEnd ** 2) / (2 * apart);
    const up = Math.sqrt(Math.max(0, fromSwell ** 2 - along ** 2));
    const join: Point = { x: swell.x + along, y: MIDDLE - up };
    const onSwell = touchPoint(swell, SWELL_RADIUS, join, TAIL_JOIN_RADIUS);
    const onTailEnd = touchPoint(tailEnd, TAIL_HALF_HEIGHT, join, TAIL_JOIN_RADIUS);
    return [
      around(SWELL_RADIUS, onSwell),
      joining(TAIL_JOIN_RADIUS, onTailEnd),
      around(TAIL_HALF_HEIGHT, below(onTailEnd)),
      joining(TAIL_JOIN_RADIUS, below(onSwell)),
      around(SWELL_RADIUS, endsAt),
    ];
  }

  const join: Point = { x: swell.x + TAIL_JOIN_REACH, y: tailTop - TAIL_JOIN_RADIUS };
  const onSwell = touchPoint(swell, SWELL_RADIUS, join, TAIL_JOIN_RADIUS);
  const onEdge: Point = { x: join.x, y: tailTop };
  const capTop: Point = { x: tailEnd.x, y: tailTop };

  return [
    around(SWELL_RADIUS, onSwell),
    joining(TAIL_JOIN_RADIUS, onEdge),
    lineTo(capTop),
    around(TAIL_HALF_HEIGHT, below(capTop)),
    lineTo(below(onEdge)),
    joining(TAIL_JOIN_RADIUS, below(onSwell)),
    around(SWELL_RADIUS, endsAt),
  ];
};

/**
 * The island's outline as the `d` of an SVG path, for a box `width` wide
 * whose tail reaches `tailWidth` past the swell. It begins at the top of the
 * swell and goes round clockwise, so anything that travels along it sets out
 * over the main control.
 */
export const islandOutline = (width: number, tailWidth: number): string => {
  const tail = Math.max(0, tailWidth);
  const cover: Point = { x: COVER_RADIUS, y: MIDDLE };
  const swell: Point = { x: width - tail - SWELL_RADIUS, y: MIDDLE };

  const coverJoin: Point = {
    x: cover.x + joinReach(COVER_RADIUS, COVER_JOIN_RADIUS, MIDDLE),
    y: -COVER_JOIN_RADIUS,
  };
  const swellJoin: Point = {
    x: swell.x - joinReach(SWELL_RADIUS, SWELL_JOIN_RADIUS, MIDDLE),
    y: -SWELL_JOIN_RADIUS,
  };

  const onCover = touchPoint(cover, COVER_RADIUS, coverJoin, COVER_JOIN_RADIUS);
  const coverEdge: Point = { x: coverJoin.x, y: 0 };
  const onSwell = touchPoint(swell, SWELL_RADIUS, swellJoin, SWELL_JOIN_RADIUS);
  const swellEdge: Point = { x: swellJoin.x, y: 0 };

  return [
    `M ${at(onSwell)}`,
    ...rightEnd(swell, width, tail, below(onSwell)),
    joining(SWELL_JOIN_RADIUS, below(swellEdge)),
    lineTo(below(coverEdge)),
    joining(COVER_JOIN_RADIUS, below(onCover)),
    around(COVER_RADIUS, onCover, true),
    joining(COVER_JOIN_RADIUS, coverEdge),
    lineTo(swellEdge),
    joining(SWELL_JOIN_RADIUS, onSwell),
    "Z",
  ].join(" ");
};
