import * as Schema from "effect/Schema";
import { AlbumSummary } from "./Album.ts";
import { TrackSummary } from "./Track.ts";

// NOTE: not in Album.ts, which Track.ts reads an album's id from: an album
// that held its tracks there would have each file wait for the other.

/**
 * An album as its own page shows it: everything a tile has, and its tracks
 * in the order the album plays them.
 */
export const Album = Schema.Struct({
  ...AlbumSummary.fields,
  /** Every track on the album, first to last, each as a list row shows it. */
  tracks: Schema.Array(TrackSummary),
  /** The day it came out, as `YYYY-MM-DD`, when the catalog knows it. */
  releaseDate: Schema.NullOr(Schema.String),
});
export type Album = typeof Album.Type;
