import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Command } from "foldkit";
import { ISLAND_LIGHTS_ATTRIBUTE, changePace } from "./light.ts";
import { Message } from "./message.ts";

// COMMAND

/**
 * The light gathers speed, or loses it and comes to rest: the document's
 * side of a change in what the Model says the light is doing. The light's
 * animations are the document's, so this is done to the document, to the
 * island that is in it; with no island there, the player being the whole
 * screen, there is nothing to do, and the island sets its own pace when it
 * comes back (the Mount `StartLight`). A change that overtakes one under way
 * carries on from the pace the light had reached.
 */
export const ChangeLightPace = Command.define("ChangeLightPace", {
  args: { pace: Schema.Number },
  messages: [Message.CompletedChangeLightPace],
  execute: ({ pace }) =>
    Effect.suspend(() =>
      Option.match(
        Option.fromNullishOr(document.querySelector(`[data-${ISLAND_LIGHTS_ATTRIBUTE}]`)),
        { onNone: () => Effect.void, onSome: (lights) => changePace(lights, pace) },
      ),
    ).pipe(Effect.as(Message.CompletedChangeLightPace())),
});
