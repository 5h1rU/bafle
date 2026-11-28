import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Command } from "foldkit";
import { Message } from "./message.ts";

// COMMAND

/** How long a row's control shows that what was chosen from its menu is done. */
export const DONE_SHOWS_FOR = Duration.millis(1600);

export const WaitToClearDone = Command.define("WaitToClearDone", {
  args: { turn: Schema.Int },
  messages: [Message.CompletedWaitToClearDone],
  execute: ({ turn }) =>
    Effect.sleep(DONE_SHOWS_FOR).pipe(Effect.as(Message.CompletedWaitToClearDone({ turn }))),
});
