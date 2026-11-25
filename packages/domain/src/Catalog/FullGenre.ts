import * as Schema from "effect/Schema";
import { AlbumSummary } from "./Album.ts";
import { ArtistSummary } from "./Artist.ts";
import { GenreSummary } from "./Genre.ts";
import { PlaylistSummary } from "./Playlist.ts";
import { TrackSummary } from "./Track.ts";

// NOTE: beside FullAlbum.ts, FullArtist.ts and FullPlaylist.ts, so the four
// are found alike. Nothing forces it here: Station.ts reads a genre's label
// from Genre.ts, and nothing a genre holds reads Station.ts.

/**
 * A genre as its own page shows it: everything a tile has, and what is
 * popular in it now. A kind with nothing popular is an empty list.
 */
export const Genre = Schema.Struct({
  ...GenreSummary.fields,
  /** The tracks played most in the genre, most played first, each as a list row shows it. */
  topTracks: Schema.Array(TrackSummary),
  /** The albums played most in the genre, each as a shelf shows it. */
  albums: Schema.Array(AlbumSummary),
  /** The artists played most in the genre, each as a shelf shows them. */
  artists: Schema.Array(ArtistSummary),
  /** The playlists played most in the genre, each as a shelf shows it. */
  playlists: Schema.Array(PlaylistSummary),
});
export type Genre = typeof Genre.Type;
