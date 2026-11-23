import * as Domain from "@alchemy.run/domain";
import { TrackId } from "./Track.ts";

/**
 * The catalog has no track with this id: it was withdrawn, or the id was
 * never one of its own. Asking again will not help.
 */
export class TrackNotFound extends Domain.Rejection(
  "TrackNotFound",
  { trackId: TrackId },
  { httpApiStatus: 404 },
) {}
