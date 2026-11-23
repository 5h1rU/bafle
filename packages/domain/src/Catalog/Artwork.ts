import * as Schema from "effect/Schema";

/**
 * One picture in the three sizes the app draws: a row thumbnail, a grid
 * tile, and a hero. Each is a URL the browser can load directly.
 */
export const Artwork = Schema.Struct({
  small: Schema.String,
  medium: Schema.String,
  large: Schema.String,
});
export type Artwork = typeof Artwork.Type;
