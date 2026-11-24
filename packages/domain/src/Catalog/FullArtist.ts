import * as Schema from "effect/Schema";
import { AlbumSummary } from "./Album.ts";
import { ArtistSummary } from "./Artist.ts";
import { TrackSummary } from "./Track.ts";

// NOTE: not in Artist.ts, which Album.ts and Track.ts read an artist's credit
// from: an artist that held their tracks and albums there would have each
// file wait for the others.

/**
 * An artist as their own page shows them: everything a tile has, what is
 * played most of theirs, and the albums they have out.
 */
export const Artist = Schema.Struct({
  ...ArtistSummary.fields,
  /** Their most played tracks, most played first, each as a list row shows it. */
  topTracks: Schema.Array(TrackSummary),
  /** Their albums, as the catalog orders them, each as a shelf shows it. */
  albums: Schema.Array(AlbumSummary),
});
export type Artist = typeof Artist.Type;
