import * as Domain from "@alchemy.run/domain";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { CatalogUnavailable, catalogUnavailable } from "./CatalogUnavailable.rejection.ts";
import { MusicCatalog, SearchResults } from "./MusicCatalog.external.ts";

/** How many results of each kind a search answers with. */
export const SEARCH_LIMIT = 12;

/** A search with nothing to look for matches nothing. */
export const noResults: SearchResults = { tracks: [], albums: [], artists: [], playlists: [] };

/** The Search page: tracks, albums, artists and playlists that match a term. */
export class CatalogSearch extends Domain.Query(
  "CatalogSearch",
  {
    input: { term: Schema.String },
    success: SearchResults,
    rejects: [CatalogUnavailable],
  },
  { description: "Everything in the catalog that matches a term, best match first in each list." },
) {}

/**
 * Asks the catalog for what matches the term, without the spaces around it.
 * A blank term matches nothing, and the catalog is never asked.
 */
export const CatalogSearchLive = CatalogSearch.toLayer(
  Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    return ({ term }) => {
      const wanted = term.trim();
      return wanted === ""
        ? Effect.succeed(noResults)
        : catalog
            .search({ term: wanted, limit: SEARCH_LIMIT })
            .pipe(Effect.mapError(catalogUnavailable));
    };
  }),
);
