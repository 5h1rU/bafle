import * as Domain from "@alchemy.run/domain";
import * as Effect from "effect/Effect";
import { CatalogUnavailable, catalogUnavailable } from "./CatalogUnavailable.rejection.ts";
import { MusicCatalog, RadioStations } from "./MusicCatalog.external.ts";

/** The Radio page: the catalog's stations, under the genre each belongs to. */
export class StationList extends Domain.Query(
  "StationList",
  { success: RadioStations, rejects: [CatalogUnavailable] },
  { description: "The catalog's stations, grouped under the genre each belongs to." },
) {}

/** Asks the catalog. Anyone may read it. */
export const StationListLive = StationList.toLayer(
  Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    return () => catalog.stations().pipe(Effect.mapError(catalogUnavailable));
  }),
);
