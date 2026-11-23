import * as Domain from "@alchemy.run/domain";
import * as Layer from "effect/Layer";
import { CatalogSearch, CatalogSearchLive } from "./Catalog/CatalogSearch.query.ts";
import { HomeFeed, HomeFeedLive } from "./Catalog/HomeFeed.query.ts";
import { NewMusic, NewMusicLive } from "./Catalog/NewMusic.query.ts";

/**
 * Bafle, a music player. So far a listener only browses and searches the
 * catalog, so the model has questions to answer and nothing to record yet:
 * aggregates arrive with the first thing a listener changes (a queue, a library).
 */
export class Bafle extends Domain.Model("Bafle", {
  aggregates: [],
  queries: [HomeFeed, NewMusic, CatalogSearch],
}) {}

/** Every query's implementation. They require the MusicCatalog external system. */
export const BafleHandlers = Layer.mergeAll(HomeFeedLive, NewMusicLive, CatalogSearchLive);
