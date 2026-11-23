import { Story } from "@alchemy.run/domain/Story";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { Bafle, BafleHandlers } from "../src/Bafle.model.ts";
import { CatalogSearch, noResults, SEARCH_LIMIT } from "../src/Catalog/CatalogSearch.query.ts";
import { CatalogUnavailable } from "../src/Catalog/CatalogUnavailable.rejection.ts";
import { HomeFeed } from "../src/Catalog/HomeFeed.query.ts";
import { MusicCatalog } from "../src/Catalog/MusicCatalog.external.ts";
import { NewMusic } from "../src/Catalog/NewMusic.query.ts";
import { TrackId } from "../src/Catalog/Track.ts";
import { TrackDetail } from "../src/Catalog/TrackDetail.query.ts";
import { TrackNotFound } from "../src/Catalog/TrackNotFound.rejection.ts";
import { featured, found, fullTrack, trending } from "./fixtures.ts";

// The catalog runs for real, through whichever adapter a test provides.
const story = Story.make(Bafle, { layer: BafleHandlers });

/** A catalog that answers every call with fixtures. */
const WorkingCatalog = MusicCatalog.toLayer(
  Effect.succeed({
    featured: () => Effect.succeed(featured),
    trending: () => Effect.succeed(trending),
    search: () => Effect.succeed(found),
    track: ({ trackId }) =>
      trackId === fullTrack.id
        ? Effect.succeed(fullTrack)
        : Effect.fail(new TrackNotFound({ trackId })),
  }),
);

/** A catalog whose provider refuses every call. */
const BrokenCatalog = MusicCatalog.toLayer(
  Effect.succeed({
    featured: () => Effect.fail(new CatalogUnavailable()),
    trending: () => Effect.fail(new CatalogUnavailable()),
    search: () => Effect.fail(new CatalogUnavailable()),
    track: () => Effect.fail(new CatalogUnavailable()),
  }),
);

it.effect("Home answers with what the catalog features", () =>
  story(
    Story.query(HomeFeed, {}, featured),
    Story.call(MusicCatalog.featured, undefined),
    Story.returned(MusicCatalog.featured, featured),
  ).pipe(Effect.provide(WorkingCatalog)),
);

it.effect("New answers with what is trending", () =>
  story(
    Story.query(NewMusic, {}, trending),
    Story.call(MusicCatalog.trending, undefined),
    Story.returned(MusicCatalog.trending, trending),
  ).pipe(Effect.provide(WorkingCatalog)),
);

it.effect("Search asks the catalog for the term without the spaces around it", () =>
  story(
    Story.query(CatalogSearch, { term: "  cumbia " }, found),
    Story.call(MusicCatalog.search, { term: "cumbia", limit: SEARCH_LIMIT }),
    Story.returned(MusicCatalog.search, found),
  ).pipe(Effect.provide(WorkingCatalog)),
);

it.effect("a blank search matches nothing, and the catalog is never asked", () =>
  // A call to the catalog that no step accounts for would fail the story.
  story(
    Story.query(CatalogSearch, { term: "" }, noResults),
    Story.query(CatalogSearch, { term: "   " }, noResults),
  ).pipe(Effect.provide(WorkingCatalog)),
);

it.effect("every page says so when the catalog cannot answer", () =>
  story(
    Story.query(HomeFeed, {}),
    Story.rejected(new CatalogUnavailable()),
    Story.call(MusicCatalog.featured, undefined),
    Story.failed(MusicCatalog.featured, new CatalogUnavailable()),
    Story.query(NewMusic, {}),
    Story.rejected(new CatalogUnavailable()),
    Story.call(MusicCatalog.trending, undefined),
    Story.failed(MusicCatalog.trending, new CatalogUnavailable()),
    Story.query(CatalogSearch, { term: "cumbia" }),
    Story.rejected(new CatalogUnavailable()),
    Story.call(MusicCatalog.search, { term: "cumbia" }),
    Story.failed(MusicCatalog.search, new CatalogUnavailable()),
    Story.query(TrackDetail, { trackId: fullTrack.id }),
    Story.rejected(new CatalogUnavailable()),
    Story.call(MusicCatalog.track, { trackId: fullTrack.id }),
    Story.failed(MusicCatalog.track, new CatalogUnavailable()),
  ).pipe(Effect.provide(BrokenCatalog)),
);

it.effect("opening a track answers with the track in full", () =>
  story(
    Story.query(TrackDetail, { trackId: fullTrack.id }, fullTrack),
    Story.call(MusicCatalog.track, { trackId: fullTrack.id }),
    Story.returned(MusicCatalog.track, fullTrack),
  ).pipe(Effect.provide(WorkingCatalog)),
);

it.effect("opening a track the catalog does not have says which one is missing", () => {
  const gone = TrackId.make("tr-gone");
  return story(
    Story.query(TrackDetail, { trackId: gone }),
    Story.rejected(new TrackNotFound({ trackId: gone })),
    Story.call(MusicCatalog.track, { trackId: gone }),
    Story.failed(MusicCatalog.track, new TrackNotFound({ trackId: gone })),
  ).pipe(Effect.provide(WorkingCatalog));
});
