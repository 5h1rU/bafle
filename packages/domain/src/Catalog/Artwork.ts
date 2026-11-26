import * as Schema from "effect/Schema";

/**
 * One picture in the three sizes the app draws: a row thumbnail, a grid
 * tile, and a hero. Each is a URL the browser can load directly.
 *
 * With them, when it is known, a placeholder: a blurred likeness of the
 * picture in a few bytes, drawn where the picture goes while the picture is
 * on its way, so that its place is never an empty box. It is a ThumbHash
 * (https://evanw.github.io/thumbhash/), in base64: the colours and the
 * shapes of the picture, at no size at all. It comes with the picture's
 * addresses, so it is there the moment they are, with nothing to ask for.
 * Null is a picture whose likeness has not been worked out yet.
 */
export const Artwork = Schema.Struct({
  small: Schema.String,
  medium: Schema.String,
  large: Schema.String,
  placeholder: Schema.NullOr(Schema.String),
});
export type Artwork = typeof Artwork.Type;
