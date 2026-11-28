import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

// MODEL

/**
 * A line of words in a place that may be too narrow for it. One that fits
 * stands. One that does not waits, travels across its place once with its
 * copy following it in, and waits again.
 *
 * `run` counts the line's lives: it is told again each time the words
 * change or stop fitting, and a wait or a pass counts only for the run it
 * was started in. `placePixels` is how wide the place is, and
 * `maybeTravelPixels` how far one pass takes the line, or nothing when it
 * fits: both are the document's to say (`Measure`).
 *
 * `Finishing` is a pass under way of a line that has come to fit: it ends
 * that pass before it stands, since stopping where it is would be a jump.
 */
export const Model = Schema.Struct({
  run: Schema.Int,
  placePixels: Schema.Number,
  maybeTravelPixels: Schema.Option(Schema.Number),
  phase: Schema.Literals(["Standing", "Travelling", "Finishing"]),
});
export type Model = typeof Model.Type;

/** A line before the document has said anything of it: standing, and taken to fit. */
export const init = (): Model => ({
  run: 0,
  placePixels: 0,
  maybeTravelPixels: Option.none(),
  phase: "Standing",
});
