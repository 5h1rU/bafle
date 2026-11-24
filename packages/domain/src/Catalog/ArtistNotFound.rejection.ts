import * as Domain from "@alchemy.run/domain";
import { ArtistId } from "./Artist.ts";

/**
 * The catalog has no artist with this id: they were withdrawn, or the id was
 * never one of its own. Asking again will not help.
 */
export class ArtistNotFound extends Domain.Rejection(
  "ArtistNotFound",
  { artistId: ArtistId },
  { httpApiStatus: 404 },
) {}
