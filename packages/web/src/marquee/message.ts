import * as Schema from "effect/Schema";
import { defineMessageUnion } from "foldkit/message";

// MESSAGE

export const Message = defineMessageUnion({
  /**
   * The line as it lies in the document: how wide its place is, and how far
   * one pass takes it, or nothing when it fits.
   */
  Measured: { placePixels: Schema.Number, maybeTravelPixels: Schema.Option(Schema.Number) },
  CompletedWaitToTravel: { run: Schema.Int },
  CompletedTravel: { run: Schema.Int },
});
export type Message = typeof Message.Type;
