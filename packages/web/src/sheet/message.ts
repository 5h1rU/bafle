import { defineMessageUnion } from "foldkit/message";
import { Reach } from "./model.ts";

// MESSAGE

export const Message = defineMessageUnion({
  /** The document's word on how much of the sheet is on screen. */
  ChangedReach: { reach: Reach },
  PressedEscape: {},
  ClickedClose: {},
  CompletedSlideAway: {},
});
export type Message = typeof Message.Type;

// OUT MESSAGE

/**
 * What a sheet tells its owner. `Left`: it is off the screen, swiped away by
 * the listener or slid away by `leave`, and can be taken out of the document
 * with nothing to see. `RequestedClose`: the listener asked for it to go, with
 * Escape or its close control, and it is still where it was; the owner sends
 * it away, with `leave` or in a way of its own.
 */
export const OutMessage = defineMessageUnion({
  Left: {},
  RequestedClose: {},
});
export type OutMessage = typeof OutMessage.Type;
