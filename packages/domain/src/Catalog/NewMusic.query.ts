import * as Domain from "@alchemy.run/domain";
import * as Effect from "effect/Effect";
import { CatalogUnavailable, catalogUnavailable } from "./CatalogUnavailable.rejection.ts";
import { MusicCatalog, TrendingMusic } from "./MusicCatalog.external.ts";

/** The New page: what is being played most right now. */
export class NewMusic extends Domain.Query(
  "NewMusic",
  { success: TrendingMusic, rejects: [CatalogUnavailable] },
  { description: "The tracks and albums played most right now, most played first." },
) {}

/** Asks the catalog. Anyone may read it. */
export const NewMusicLive = NewMusic.toLayer(
  Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    return () => catalog.trending().pipe(Effect.mapError(catalogUnavailable));
  }),
);
