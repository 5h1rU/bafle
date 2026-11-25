// MOTION THAT STARTS WHEN IT CAN BE SEEN

// An animation's clock starts in the frame that made it, and that frame is
// not shown until the browser has finished drawing it. A change that sets
// many pieces moving at once is also the frame that costs the most to draw:
// the navigation drawing back to its circle moves every piece of the dock
// and gives the island a new width. On a phone that frame takes several
// times what a frame has, and by the time the listener is shown anything
// the movements are well under way. A spring covers most of its distance at
// its start, so all that is left to see of it is the end: the island jumps
// to its place and settles there.
//
// So what sets off in such a frame is held at its start for as long as that
// frame takes, and let go at the next one, which has nothing left to work
// out. The movement begins a frame later and is seen whole.

/**
 * Holds animations that have just been made at their start, and lets them go
 * on the next frame. To be called in the frame that made them. One that is
 * over by then, replaced by a later change, is left as it is.
 */
export const startWhenSeen = (animations: ReadonlyArray<Animation>): void => {
  if (animations.length === 0) {
    return;
  }
  animations.forEach((animation) => {
    animation.pause();
    animation.currentTime = 0;
  });
  requestAnimationFrame(() => {
    const now = document.timeline.currentTime;
    animations.forEach((animation) => {
      if (animation.playState !== "paused") {
        return;
      }
      if (now === null) {
        animation.play();
      } else {
        animation.startTime = now;
      }
    });
  });
};

/**
 * The transitions a change of style has just made under an element: the
 * ones the browser has not started yet. Asking for them makes the browser
 * work the styles out, which is what makes them.
 */
export const transitionsJustMade = (element: Element): ReadonlyArray<Animation> =>
  element
    .getAnimations({ subtree: true })
    .filter((animation) => animation instanceof CSSTransition && animation.pending);
