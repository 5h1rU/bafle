import * as Effect from "effect/Effect";
import { Command, Dom } from "foldkit";
import { Message } from "./message.ts";
import { CONTROL_ID } from "./model.ts";

// COMMAND

/**
 * Gives the focus to the island's control for the queue, once the column it
 * opened is closed by the column's own control: what held the focus went
 * with the column.
 */
export const FocusControl = Command.define("FocusControl", {
  messages: [Message.CompletedFocusControl],
  execute: Dom.focus(`#${CONTROL_ID}`, { preventScroll: true }).pipe(
    Effect.ignore,
    Effect.as(Message.CompletedFocusControl()),
  ),
});
