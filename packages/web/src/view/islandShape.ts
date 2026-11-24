import * as Schema from "effect/Schema";
import { CustomElement } from "foldkit";

// VIEW

export const ISLAND_SHAPE_TAG = "bafle-island-shape";

/** Marks the piece of the island whose width is how far the tail reaches. */
export const ISLAND_TAIL_ATTRIBUTE = "island-tail";

/**
 * What the island's light is told to do. `Travelling` sets it going round
 * the island's edge, and `Resting` slows it to a halt where it is. `Holding`
 * changes nothing: the light goes on with whatever it was doing.
 */
export const IslandLight = Schema.Literals(["Travelling", "Holding", "Resting"]);
export type IslandLight = typeof IslandLight.Type;

/**
 * What the island is drawn on: one dark figure whose outline runs round the
 * cover, the body, the swell under the main control and the tail that holds
 * Next. Near the cover the figure takes the cover's colours. Its edge is its
 * own colour, and a copper light travels the whole of it as `light` says.
 *
 * The Model says only those two things. The outline itself depends on how
 * wide the island is at this moment, on this screen, halfway through a
 * change of place: a matter of pixels, settled in the document by the
 * element in `islandShapeElement.ts`. Until that element is registered, and
 * wherever it is not, the island's pieces stand on nothing.
 */
export const IslandShape = CustomElement.define({
  tag: ISLAND_SHAPE_TAG,
  properties: {
    cover: Schema.String,
    light: IslandLight,
  },
  events: {},
});
