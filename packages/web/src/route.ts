import { AlbumId } from "@bafle/domain/Catalog/Album";
import { ArtistId } from "@bafle/domain/Catalog/Artist";
import { GenreId } from "@bafle/domain/Catalog/Genre";
import { PlaylistId } from "@bafle/domain/Catalog/Playlist";
import { StationId } from "@bafle/domain/Catalog/Station";
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
  Genres: {},
  Radio: {},
  Search: { maybeTerm: Schema.Option(Schema.String) },
  Track: { trackId: TrackId },
  Album: { albumId: AlbumId },
  Artist: { artistId: ArtistId },
  Playlist: { playlistId: PlaylistId },
  Genre: { genreId: GenreId },
  Station: { stationId: StationId },
  NotFound: { path: Schema.String },
});
export type AppRoute = typeof AppRoute.Type;

export const homeRouter = pipe(Route.root, Route.mapTo(AppRoute.Home));

export const newRouter = pipe(literal("new"), Route.mapTo(AppRoute.New));

export const genresRouter = pipe(literal("genres"), Route.mapTo(AppRoute.Genres));

export const radioRouter = pipe(literal("radio"), Route.mapTo(AppRoute.Radio));

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

export const albumRouter = pipe(
  literal("album"),
  slash(schemaSegment("albumId", AlbumId)),
  Route.mapTo(AppRoute.Album),
);

export const artistRouter = pipe(
  literal("artist"),
  slash(schemaSegment("artistId", ArtistId)),
  Route.mapTo(AppRoute.Artist),
);

export const playlistRouter = pipe(
  literal("playlist"),
  slash(schemaSegment("playlistId", PlaylistId)),
  Route.mapTo(AppRoute.Playlist),
);

export const genreRouter = pipe(
  literal("genre"),
  slash(schemaSegment("genreId", GenreId)),
  Route.mapTo(AppRoute.Genre),
);

export const stationRouter = pipe(
  literal("station"),
  slash(schemaSegment("stationId", StationId)),
  Route.mapTo(AppRoute.Station),
);

const routeParser = Route.oneOf(
  trackRouter,
  albumRouter,
  artistRouter,
  playlistRouter,
  genreRouter,
  stationRouter,
  searchRouter,
  genresRouter,
  radioRouter,
  newRouter,
  homeRouter,
);

export const urlToAppRoute = Route.parseUrlWithFallback(routeParser, AppRoute.NotFound);

/** The address of a route: what a link to it points at. */
export const routeToUrl = (route: AppRoute): string =>
  AppRoute.match(route, {
    Home: () => homeRouter(),
    New: () => newRouter(),
    Genres: () => genresRouter(),
    Radio: () => radioRouter(),
    Search: ({ maybeTerm }) => searchRouter({ maybeTerm }),
    Track: ({ trackId }) => trackRouter({ trackId }),
    Album: ({ albumId }) => albumRouter({ albumId }),
    Artist: ({ artistId }) => artistRouter({ artistId }),
    Playlist: ({ playlistId }) => playlistRouter({ playlistId }),
    Genre: ({ genreId }) => genreRouter({ genreId }),
    Station: ({ stationId }) => stationRouter({ stationId }),
    NotFound: ({ path }) => path,
  });

export const isSameRoute = Schema.toEquivalence(AppRoute);

/**
 * Whether two routes are places within one page. Search is one page whatever
 * was typed into it; every track has a page of its own, and so has every
 * album, every artist, every playlist, every genre and every station.
 */
export const isSamePage = (one: AppRoute, other: AppRoute): boolean => {
  if (one._tag === "Track" && other._tag === "Track") {
    return one.trackId === other.trackId;
  }
  if (one._tag === "Album" && other._tag === "Album") {
    return one.albumId === other.albumId;
  }
  if (one._tag === "Artist" && other._tag === "Artist") {
    return one.artistId === other.artistId;
  }
  if (one._tag === "Playlist" && other._tag === "Playlist") {
    return one.playlistId === other.playlistId;
  }
  if (one._tag === "Genre" && other._tag === "Genre") {
    return one.genreId === other.genreId;
  }
  if (one._tag === "Station" && other._tag === "Station") {
    return one.stationId === other.stationId;
  }
  return one._tag === other._tag;
};

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
