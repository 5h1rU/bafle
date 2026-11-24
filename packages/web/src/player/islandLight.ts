import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Option from "effect/Option";

// ISLAND LIGHT

// The light that travels the island's edge is drawn by the view and moved by
// animations the style sheet declares, one for each of its strokes. What is
// here is what neither can do. One thing is to change the pace of those
// animations little by little, so that the light gathers speed and loses it
// instead of starting and stopping at once: it is called from the Mount that
// starts the light when the island enters the document, and from the Command
// `update` gives whenever the Model's word on the light changes. The
// other is to keep the light where it is while the outline under it changes:
// it is called from the Mount that draws the outline.

/** Marks the piece of the island that holds the light's strokes. */
export const ISLAND_LIGHTS_ATTRIBUTE = "island-lights";

/**
 * How much of the outline the light covers, from the end of its tail to its
 * head, in hundredths of the whole outline. Its animation sets out with the
 * tail's end where the outline begins, so the head is this far ahead of it.
 */
export const LIGHT_LENGTH = 5;

/** How long the light takes to gather speed, or to lose it. */
export const CHANGES_PACE_OVER_MILLISECONDS = 1400;

/** Below this share of its full speed the light is taken to have stopped. */
const STOPPED_BELOW = 0.001;

/** The name the style sheet gives the animation that carries a stroke round the outline. */
const TRAVEL_ANIMATION = "island-light-travel";

/**
 * The animations that carry the light's strokes round the outline. Under
 * reduced motion there are none. The light's own change of brightness is an
 * animation of this piece too, a transition, and is not one of them: its
 * pace is not the light's to change.
 */
const travels = (lights: Element): ReadonlyArray<Animation> =>
  lights
    .getAnimations({ subtree: true })
    .filter(
      (animation) =>
        animation instanceof CSSAnimation && animation.animationName === TRAVEL_ANIMATION,
    );

/** The light's speed, as a share of its full speed. */
const paceOf = (lights: Element): number => {
  const [travel] = travels(lights);
  return travel === undefined || travel.playState !== "running" ? 0 : travel.playbackRate;
};

/** Set the light's speed at once: to rest where it is, or to travel on from there. */
export const setPace = (lights: Element, pace: number): void => {
  travels(lights).forEach((travel) => {
    if (pace < STOPPED_BELOW) {
      travel.pause();
    } else {
      travel.playbackRate = pace;
      travel.play();
    }
  });
};

// The strokes are placed in hundredths of the outline, wherever it runs and
// however long it is. That is what lets one animation serve every width, and
// it is also why an outline that grows would carry the light with it: the
// same share of a longer outline is another place on the screen. So whoever
// redraws the outline notes where the light's head is before, and afterwards
// puts it at the nearest place the new outline has.

/** A place on the island, in the units and from the corner its outline is drawn in. */
export type Place = Readonly<{ x: number; y: number }>;

/** How closely the outline is walked in search of a place: first in strides, then in steps. */
const STRIDE_PIXELS = 4;
const STEP_PIXELS = 0.25;

const within = (share: number): number => ((share % 1) + 1) % 1;

const apart = (one: Place, other: Place): number => Math.hypot(one.x - other.x, one.y - other.y);

/**
 * How far along an outline of length `total` the place nearest to `place`
 * lies, `placeAt` saying where each length along it is.
 */
export const lengthNearest = (
  total: number,
  placeAt: (length: number) => Place,
  place: Place,
): number => {
  const nearestOf = (lengths: ReadonlyArray<number>): number =>
    lengths.reduce(
      (nearest, length) => {
        const distance = apart(placeAt(length), place);
        return distance < nearest.distance ? { length, distance } : nearest;
      },
      { length: 0, distance: Number.POSITIVE_INFINITY },
    ).length;

  const strides = Array.makeBy(Math.max(1, Math.ceil(total / STRIDE_PIXELS)), (index) =>
    Math.min(total, index * STRIDE_PIXELS),
  );
  const about = nearestOf(strides);
  const steps = Array.makeBy(Math.round((2 * STRIDE_PIXELS) / STEP_PIXELS) + 1, (index) =>
    // The outline is closed: a step back from its start is a step back from its end.
    within((about - STRIDE_PIXELS + index * STEP_PIXELS) / total) * total,
  );
  return nearestOf(steps);
};

/**
 * The shorter way round from one share of the outline to another: ahead as
 * a positive share, behind as a negative one.
 */
export const wayRound = (from: number, to: number): number => {
  const ahead = within(to - from);
  return ahead > 0.5 ? ahead - 1 : ahead;
};

/** Where the light's head is along the outline, as a share of it. None when no light travels. */
const headShare = (lights: Element): Option.Option<number> =>
  pipe(
    Array.head(travels(lights)),
    Option.flatMapNullishOr((travel) => travel.effect?.getComputedTiming().progress),
    Option.map((progress) => within(progress + LIGHT_LENGTH / 100)),
  );

/** The place of the light's head on the outline as it is drawn now. */
export const lightPlace = (lights: Element, outline: SVGGeometryElement): Option.Option<Place> =>
  Option.map(headShare(lights), (share) => {
    const { x, y } = outline.getPointAtLength(share * outline.getTotalLength());
    return { x, y };
  });

/**
 * Put the light's head at the place of the outline, as it is drawn now, that
 * is nearest to `place`. Every stroke moves by as much, so the light keeps
 * its figure; its pace is left as it was, whether it travels or rests.
 */
export const putLightNear = (lights: Element, outline: SVGGeometryElement, place: Place): void => {
  const total = outline.getTotalLength();
  if (total === 0) {
    return;
  }
  Option.match(headShare(lights), {
    onNone: () => undefined,
    onSome: (share) => {
      const wanted =
        lengthNearest(
          total,
          (length) => {
            const { x, y } = outline.getPointAtLength(length);
            return { x, y };
          },
          place,
        ) / total;
      const ahead = wayRound(share, wanted);
      travels(lights).forEach((travel) => {
        const round = travel.effect?.getComputedTiming().duration;
        if (typeof round !== "number" || typeof travel.currentTime !== "number") {
          return;
        }
        // An animation set to before its start draws nothing of its own, so a
        // step back from the start is taken from the end of a round instead.
        const moved = travel.currentTime + ahead * round;
        travel.currentTime = moved < 0 ? moved + round : moved;
      });
    },
  });
};

/** Slow to leave one pace and slow to reach the other. */
const eased = (share: number): number => share * share * (3 - 2 * share);

/**
 * The change of pace each light is in the middle of, by its number. A light
 * has one pace, so a change asked for while another is under way takes its
 * place: the one under way sees that its number is no longer the light's and
 * stops where it has got to, and the new one goes on from there. That is what
 * lets a pause follow a start, or a start a pause, without the light jumping.
 */
const changes = new WeakMap<Element, number>();

/**
 * Take the light from whatever pace it has now to `pace`, a frame at a time.
 * Overtaken by a later change, or interrupted, it leaves the light at the
 * pace it had reached.
 */
export const changePace = (lights: Element, pace: number): Effect.Effect<void> =>
  Effect.callback<void>((resume) => {
    const change = (changes.get(lights) ?? 0) + 1;
    changes.set(lights, change);
    const from = paceOf(lights);
    const began = performance.now();
    const frame = { id: 0 };
    const step = (now: number): void => {
      if (changes.get(lights) !== change) {
        resume(Effect.void);
        return;
      }
      const share = Math.min(1, (now - began) / CHANGES_PACE_OVER_MILLISECONDS);
      setPace(lights, from + (pace - from) * eased(share));
      if (share < 1) {
        frame.id = requestAnimationFrame(step);
      } else {
        resume(Effect.void);
      }
    };
    frame.id = requestAnimationFrame(step);
    return Effect.sync(() => cancelAnimationFrame(frame.id));
  });
