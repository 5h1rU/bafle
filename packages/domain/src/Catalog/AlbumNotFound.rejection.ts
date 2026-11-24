import * as Domain from "@alchemy.run/domain";
import { AlbumId } from "./Album.ts";

/**
 * The catalog has no album with this id: it was withdrawn, or the id was
 * never one of its own. Asking again will not help.
 */
export class AlbumNotFound extends Domain.Rejection(
  "AlbumNotFound",
  { albumId: AlbumId },
  { httpApiStatus: 404 },
) {}
