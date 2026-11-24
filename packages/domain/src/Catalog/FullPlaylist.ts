import * as Schema from "effect/Schema";
import { Artwork } from "./Artwork.ts";
import { PlaylistId } from "./Playlist.ts";
import { TrackSummary } from "./Track.ts";

// NOTE: beside FullAlbum.ts and FullArtist.ts, so the three are found alike.
// Nothing forces it here: no file that a track reads from reads Playlist.ts.

/**
 * A playlist as its own page shows it: what a tile shows of it, and its
 * tracks in the order the playlist plays them. How many it has is how many
 * it lists.
 */
export const Playlist = Schema.Struct({
  id: PlaylistId,
  title: Schema.String,
  /** Who keeps the playlist: an editor or a listener. */
  curator: Schema.String,
  picture: Schema.NullOr(Artwork),
  /** Every track on the playlist, first to last, each once and as a list row shows it. */
  tracks: Schema.Array(TrackSummary),
});
export type Playlist = typeof Playlist.Type;
