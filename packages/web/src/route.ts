import { pipe } from "effect/Function";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as String from "effect/String";
import { Route } from "foldkit";
import { defineRouteUnion, literal } from "foldkit/route";

// ROUTE

/** Every place in the app. Search carries what the listener typed, so a reload or a shared link restores it. */
export const AppRoute = defineRouteUnion({
  Home: {},
  New: {},
  Search: { maybeTerm: Schema.Option(Schema.String) },
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

const routeParser = Route.oneOf(searchRouter, newRouter, homeRouter);

export const urlToAppRoute = Route.parseUrlWithFallback(routeParser, AppRoute.NotFound);

/** The address of a route: what a link to it points at. */
export const routeToUrl = (route: AppRoute): string =>
  AppRoute.match(route, {
    Home: () => homeRouter(),
    New: () => newRouter(),
    Search: ({ maybeTerm }) => searchRouter({ maybeTerm }),
    NotFound: ({ path }) => path,
  });

export const isSameRoute = Schema.toEquivalence(AppRoute);

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
