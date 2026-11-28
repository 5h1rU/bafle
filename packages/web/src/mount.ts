import * as Effect from "effect/Effect";
import { Mount } from "foldkit";
import { Message } from "./message.ts";
import { startWhenSeen, transitionsJustMade } from "./view/seenStart.ts";

// MOUNT

/** The attribute the shell says in how the navigation stands. */
export const NAVIGATION_ATTRIBUTE = "data-navigation";

/**
 * Bound to the shell. The navigation drawing back to its circle, or coming
 * out of it, is one change of an attribute that sets every piece of the dock
 * moving, and the frame that works all of it out is long enough to hide the
 * start of every one of those movements (see `seenStart.ts`). This hears
 * that change as it is made, before the browser draws it, and holds what it
 * has set off until the frame after.
 *
 * The island's own figure is moved from the document as well, by
 * `DrawFigure`, which holds what it starts in the same way: both are
 * let go in the same frame.
 */
export const HoldDockMotion = Mount.define("HoldDockMotion", {
  messages: [Message.CompletedHoldDockMotion],
  execute: ({ element }) =>
    Effect.gen(function* () {
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          const changes = new MutationObserver(() => startWhenSeen(transitionsJustMade(element)));
          changes.observe(element, { attributes: true, attributeFilter: [NAVIGATION_ATTRIBUTE] });
          return changes;
        }),
        (changes) => Effect.sync(() => changes.disconnect()),
      );
      return Message.CompletedHoldDockMotion();
    }),
});
