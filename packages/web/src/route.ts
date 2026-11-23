import { TrackId } from "@bafle/domain/Catalog/Track";
import { pipe } from "effect/Function";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as String from "effect/String";
import { Route } from "foldkit";
import { defineRouteUnion, literal, schemaSegment, slash } from "foldkit/route";

// ROUTE

/** Every place in the app. Search carries what the listener typed, so a reload or a shared link restores it. */
export const AppRoute = defineRouteUnion({
  Home: {},
  New: {},
  Search: { maybeTerm: Schema.Option(Schema.String) },
  Track: { trackId: TrackId },
  NotFound: { path: Schema.String },
});
export type AppRoute = typeof AppRoute.Type;

export const homeRouter = pipe(Route.root, Route.mapTo(AppRoute.Home));

export const newRouter = pipe(literal("new"), Route.mapTo(AppRoute.New));

export const searchRouter = pipe(
  literal("search"),
  Route.query(
    Schema.Struct({ maybeTerm: Schema.OptionFromOptional(Schema.String) }).pipe(
      Schema.encodeKeys({ maybeTerm: "q" }),
    ),
  ),
  Route.mapTo(AppRoute.Search),
);

export const trackRouter = pipe(
  literal("track"),
  slash(schemaSegment("trackId", TrackId)),
  Route.mapTo(AppRoute.Track),
);

const routeParser = Route.oneOf(trackRouter, searchRouter, newRouter, homeRouter);

export const urlToAppRoute = Route.parseUrlWithFallback(routeParser, AppRoute.NotFound);

/** The address of a route: what a link to it points at. */
export const routeToUrl = (route: AppRoute): string =>
  AppRoute.match(route, {
    Home: () => homeRouter(),
    New: () => newRouter(),
    Search: ({ maybeTerm }) => searchRouter({ maybeTerm }),
    Track: ({ trackId }) => trackRouter({ trackId }),
    NotFound: ({ path }) => path,
  });

export const isSameRoute = Schema.toEquivalence(AppRoute);

/**
 * Whether two routes are places within one page. Search is one page whatever
 * was typed into it; every track has a page of its own.
 */
export const isSamePage = (one: AppRoute, other: AppRoute): boolean =>
  one._tag === "Track" && other._tag === "Track"
    ? one.trackId === other.trackId
    : one._tag === other._tag;

/**
 * What a route asks the catalog to search for: the term without the spaces
 * around it, when the route is Search and the field is not blank.
 */
export const searchedTerm = (route: AppRoute): Option.Option<string> =>
  AppRoute.matchOrElse(
    route,
    {
      Search: ({ maybeTerm }) =>
        pipe(maybeTerm, Option.map(String.trim), Option.filter(String.isNonEmpty)),
    },
    () => Option.none(),
  );
