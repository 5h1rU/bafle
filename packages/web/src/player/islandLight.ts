import * as Effect from "effect/Effect";

// ISLAND LIGHT

// The light that travels the island's edge is drawn by the view and moved by
// animations the style sheet declares, one for each of its strokes. What is
// here is the one thing neither can do: change the pace of those animations
// little by little, so that the light gathers speed and loses it instead of
// starting and stopping at once. It is called from the Mount that starts the
// light when the island enters the document, and from the Subscription that
// follows what the Model says the light is doing.

/** Marks the piece of the island that holds the light's strokes. */
export const ISLAND_LIGHTS_ATTRIBUTE = "island-lights";

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

/** Slow to leave one pace and slow to reach the other. */
const eased = (share: number): number => share * share * (3 - 2 * share);

/**
 * Take the light from whatever pace it has now to `pace`, a frame at a time.
 * Interrupted, it leaves the light at the pace it had reached.
 */
export const changePace = (lights: Element, pace: number): Effect.Effect<void> =>
  Effect.callback<void>((resume) => {
    const from = paceOf(lights);
    const began = performance.now();
    const frame = { id: 0 };
    const step = (now: number): void => {
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
