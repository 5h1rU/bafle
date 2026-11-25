import * as Domain from "@alchemy.run/domain";
import { StationId } from "./Station.ts";

/**
 * The catalog has no station with this id: it was withdrawn, or the id was
 * never one of its own. Asking again will not help.
 */
export class StationNotFound extends Domain.Rejection(
  "StationNotFound",
  { stationId: StationId },
  { httpApiStatus: 404 },
) {}
