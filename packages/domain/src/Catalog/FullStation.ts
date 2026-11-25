import * as Schema from "effect/Schema";
import { StationSummary } from "./Station.ts";
import { TrackSummary } from "./Track.ts";

// NOTE: beside FullPlaylist.ts and FullGenre.ts, so they are found alike.
// Nothing forces it here: no file that a track reads from reads Station.ts.

/**
 * A station as its own page shows it: everything a tile has, and the songs
 * it plays now. A station has no end and no fixed order: this is the run the
 * catalog dealt when it was asked, and asking again can deal another.
 */
export const Station = Schema.Struct({
  ...StationSummary.fields,
  /** The songs the station plays now, in the order it plays them, each once and as a list row shows it. */
  tracks: Schema.Array(TrackSummary),
});
export type Station = typeof Station.Type;
