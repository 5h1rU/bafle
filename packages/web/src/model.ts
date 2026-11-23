import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import {
  FeaturedMusic,
  SearchResults,
  TrendingMusic,
} from "@bafle/domain/Catalog/MusicCatalog.external";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { AsyncData } from "foldkit";
import { defineTaggedUnion } from "foldkit/schema";
import { LoadError } from "./catalog.ts";
import { AppRoute, searchedTerm } from "./route.ts";

// MODEL

/** What a search found, with the term it was found for: the term on screen can be newer. */
export const SearchAnswer = Schema.Struct({ term: Schema.String, results: SearchResults });
export type SearchAnswer = typeof SearchAnswer.Type;

export const HomeData = AsyncData.Schema(FeaturedMusic, LoadError);
export type HomeData = typeof HomeData.schema.Type;

export const NewMusicData = AsyncData.Schema(TrendingMusic, LoadError);
export type NewMusicData = typeof NewMusicData.schema.Type;

export const SearchData = AsyncData.Schema(SearchAnswer, LoadError);
export type SearchData = typeof SearchData.schema.Type;

/**
 * The one thing the app is waiting for. It always belongs to the current
 * route: every change of route abandons it, so a reply or a pause that
 * arrives for anything else is recognised by its id and dropped.
 */
export const Awaiting = defineTaggedUnion({
  Nothing: {},
  /** The listener is typing in Search; the query goes out when they pause. */
  TypingPause: { pauseId: Schema.String },
  Reply: { requestId: Schema.String },
});
export type Awaiting = typeof Awaiting.Type;

export const Model = Schema.Struct({
  /** Where the listener asked to go. It follows the URL at once. */
  route: AppRoute,
  /** The route whose page is on screen. It follows the data: see `swap` in main.ts. */
  displayed: AppRoute,
  awaiting: Awaiting,
  /** Names each request and pause, so the one awaited can be told from the abandoned. */
  requestIds: DomainFoldkit.CommandIds,
  home: HomeData.schema,
  newMusic: NewMusicData.schema,
  search: SearchData.schema,
});
export type Model = typeof Model.Type;

/** A page with data, or with a failure to state, has more to show than placeholders. */
const hasSomethingToShow = <A>(data: AsyncData.AsyncData<A, LoadError>): boolean =>
  AsyncData.hasData(data) || AsyncData.hasError(data);

/**
 * Whether a route's page has more than placeholders to show. Search with a
 * blank field always has: its prompt needs nothing from the catalog.
 */
export const canShow = (model: Model, route: AppRoute): boolean =>
  AppRoute.match(route, {
    Home: () => hasSomethingToShow(model.home),
    New: () => hasSomethingToShow(model.newMusic),
    Search: () => Option.isNone(searchedTerm(route)) || hasSomethingToShow(model.search),
    NotFound: () => true,
  });
