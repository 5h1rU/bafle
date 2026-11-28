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

const within = (share: number): number => ((share % 1) + 1) % 1;

const apart = (one: Place, other: Place): number => Math.hypot(one.x - other.x, one.y - other.y);

/** Project onto the closed outline, starting at the head's previous phase.
 * A large resize can put a different side nearest; only then seed the local
 * search from a small, evenly spaced sample of the whole outline. */
export const lengthNearest = (
  total: number,
  placeAt: (length: number) => Place,
  place: Place,
  seed = 0,
): number => {
  const wrap = (length: number) => ((length % total) + total) % total;
  let best = wrap(seed);
  let distance = apart(placeAt(best), place);
  const tryLength = (length: number) => {
    const candidate = wrap(length);
    const next = apart(placeAt(candidate), place);
    if (next < distance) {
      best = candidate;
      distance = next;
    }
  };

  const stride = total / 32;
  if (distance > stride) {
    for (let index = 0; index < 32; index++) tryLength(index * stride);
  }
  // A point on an arc is at most one unit closer for each unit walked.
  // Refine both sides across the seam down to a fraction of a CSS pixel.
  for (let step = Math.min(stride, distance); step >= 0.03125; step /= 2) {
    const center = best;
    tryLength(center - step);
    tryLength(center + step);
    if (distance < 0.03125) break;
  }
  return best;
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
          share * total,
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
