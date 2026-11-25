import * as Domain from "@alchemy.run/domain";
import * as Effect from "effect/Effect";
import { CatalogUnavailable } from "./CatalogUnavailable.rejection.ts";
import { Station } from "./FullStation.ts";
import { MusicCatalog } from "./MusicCatalog.external.ts";
import { StationId } from "./Station.ts";
import { StationNotFound } from "./StationNotFound.rejection.ts";

/** How many of the songs a station plays its page lists: a station has no end, and a page has. */
export const STATION_TRACKS = 40;

/** The page of one station: the station a listener opened, with the songs it plays now. */
export class StationDetail extends Domain.Query(
  "StationDetail",
  {
    input: { stationId: StationId },
    success: Station,
    rejects: [StationNotFound, CatalogUnavailable],
  },
  { description: "One station in full: its picture and the songs it plays now, in order." },
) {}

/** Asks the catalog. Anyone may read it. */
export const StationDetailLive = StationDetail.toLayer(
  Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    return ({ stationId }) =>
      catalog.station({ stationId, tracks: STATION_TRACKS }).pipe(
        // A missing station and a catalog that cannot answer call for different
        // things from the listener, so they stay apart all the way to the app.
        Effect.mapError((refusal) =>
          refusal._tag === "StationNotFound"
            ? new StationNotFound({ stationId: refusal.stationId })
            : new CatalogUnavailable(),
        ),
      );
  }),
);
