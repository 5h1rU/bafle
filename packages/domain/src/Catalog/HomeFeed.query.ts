import * as Domain from "@alchemy.run/domain";
import * as Effect from "effect/Effect";
import { CatalogUnavailable, catalogUnavailable } from "./CatalogUnavailable.rejection.ts";
import { FeaturedMusic, MusicCatalog } from "./MusicCatalog.external.ts";

/** The Home page: what the catalog recommends today. */
export class HomeFeed extends Domain.Query(
  "HomeFeed",
  { success: FeaturedMusic, rejects: [CatalogUnavailable] },
  { description: "What the catalog recommends today: albums, playlists and artists." },
) {}

/** Asks the catalog. Anyone may read it. */
export const HomeFeedLive = HomeFeed.toLayer(
  Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    return () => catalog.featured().pipe(Effect.mapError(catalogUnavailable));
  }),
);
