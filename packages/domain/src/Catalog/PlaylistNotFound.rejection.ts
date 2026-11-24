import * as Domain from "@alchemy.run/domain";
import { PlaylistId } from "./Playlist.ts";

/**
 * The catalog has no playlist with this id: it was withdrawn, or the id was
 * never one of its own. Asking again will not help.
 */
export class PlaylistNotFound extends Domain.Rejection(
  "PlaylistNotFound",
  { playlistId: PlaylistId },
  { httpApiStatus: 404 },
) {}
