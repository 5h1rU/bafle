import * as Schema from "effect/Schema";
import { Edge } from "./geometry.ts";

// MODEL

/**
 * How much of the sheet is on screen, as the document says it: all of it,
 * some of it, or none. It is the one thing a sheet knows that only the
 * document can tell, since the listener's finger moves the sheet without a
 * word to the app.
 */
export const Reach = Schema.Literals(["Whole", "Partly", "Gone"]);
export type Reach = typeof Reach.Type;

/**
 * How the sheet comes to its place as it enters the document: there at once,
 * for whoever brings it on screen some other way, or sliding in from its edge.
 */
export const Entrance = Schema.Literals(["AtRest", "Slides"]);
export type Entrance = typeof Entrance.Type;

/**
 * A sheet that is in the document. Whether there is a sheet at all is not
 * here: that is its owner's to say, by drawing it or not.
 */
export const Model = Schema.Struct({
  id: Schema.String,
  edge: Edge,
  entrance: Entrance,
  reach: Reach,
  /** Survives the asynchronous history change until the owner draws the next sheet. */
  dismissedByKeyboard: Schema.Boolean,
});
export type Model = typeof Model.Type;

export type InitConfig = Readonly<{
  /** Unique in the document: the sheet's pieces and its timeline are named after it. */
  id: string;
  /** The edge the sheet stands at and leaves by. The foot, if nothing is said. */
  edge?: Edge;
  entrance?: Entrance;
}>;

/** A sheet as it is before the document has said anything of it. */
export const init = ({ id, edge = "Bottom", entrance = "Slides" }: InitConfig): Model => ({
  id,
  edge,
  entrance,
  reach: entrance === "AtRest" ? "Whole" : "Gone",
  dismissedByKeyboard: false,
});
