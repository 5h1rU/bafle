import * as Domain from "@alchemy.run/domain";
import * as Effect from "effect/Effect";
import { CatalogUnavailable, catalogUnavailable } from "./CatalogUnavailable.rejection.ts";
import { MusicCatalog, MusicGenres } from "./MusicCatalog.external.ts";

/** The Genres page: every genre the catalog files music under. */
export class GenreList extends Domain.Query(
  "GenreList",
  { success: MusicGenres, rejects: [CatalogUnavailable] },
  { description: "Every genre the catalog files music under, as the catalog orders them." },
) {}

/** Asks the catalog. Anyone may read it. */
export const GenreListLive = GenreList.toLayer(
  Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    return () => catalog.genres().pipe(Effect.mapError(catalogUnavailable));
  }),
);
