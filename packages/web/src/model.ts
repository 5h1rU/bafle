import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import {
  FeaturedMusic,
  SearchResults,
  TrendingMusic,
} from "@bafle/domain/Catalog/MusicCatalog.external";
import { Track, TrackId } from "@bafle/domain/Catalog/Track";
import { Menu } from "@foldkit/ui";
import * as Array from "effect/Array";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { AsyncData } from "foldkit";
import { defineTaggedUnion } from "foldkit/schema";
import { LoadError } from "./catalog.ts";
import { PlayOrigin } from "./message.ts";
import { maybeCurrentTrackId, Model as PlayerModel, QueuePlace } from "./player/model.ts";
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
 * What the catalog said about one track. No track is an answer too: the
 * catalog does not have it, and asking again will not change that.
 */
export const TrackData = AsyncData.Schema(Schema.Option(Track), LoadError);
export type TrackData = typeof TrackData.schema.Type;

/** Whether a page takes the screen because the listener went back to it, or otherwise. */
export const Entrance = Schema.Literals(["Returning", "Arriving"]);
export type Entrance = typeof Entrance.Type;

/**
 * The one thing the app is waiting for. Whatever the listener does next
 * abandons it, so a reply or a pause that arrives for anything else is
 * recognised by its id and dropped.
 */
export const Awaiting = defineTaggedUnion({
  Nothing: {},
  /** The listener is typing in Search; the query goes out when they pause. */
  TypingPause: { pauseId: Schema.String },
  /** A reply for the page on screen: its first load, a refresh, a retry. */
  Reply: { requestId: Schema.String },
  /**
   * A reply for a page the listener chose by a link. The URL has not moved:
   * it is pushed when the page takes the screen, so the history only ever
   * gains pages that were shown.
   */
  Intention: { requestId: Schema.String, route: AppRoute },
  /**
   * A reply for a page the browser has already moved the URL to, by Back or
   * Forward. The page on screen is held until it comes, and how the listener
   * got there is kept for then: it decides where the focus goes.
   */
  Arrival: { requestId: Schema.String, route: AppRoute, entrance: Entrance },
});
export type Awaiting = typeof Awaiting.Type;

/**
 * The navigation at the foot of a narrow screen. Open, it is the whole menu
 * with the island above it. Minimized, it has drawn back to one circle that
 * shows where the listener is, and the island takes the room it left.
 */
export const Navigation = Schema.Literals(["Open", "Minimized"]);
export type Navigation = typeof Navigation.Type;

/**
 * The row whose control shows, for a moment, that what was chosen from its
 * menu is done: its track was put in the queue, and where. Each one takes
 * the next turn, so the moment that ends for an earlier one clears nothing.
 */
export const RowDone = Schema.Struct({
  turn: Schema.Int,
  maybeRow: Schema.Option(
    Schema.Struct({ from: PlayOrigin, trackId: TrackId, place: QueuePlace }),
  ),
});
export type RowDone = typeof RowDone.Type;

export const Model = Schema.Struct({
  /**
   * The route whose page is on screen. It is the browser's URL too, except
   * while an `Arrival` is awaited: a link moves the URL when its page takes
   * the screen, never before.
   */
  route: AppRoute,
  awaiting: Awaiting,
  /** Names each request and pause, so the one awaited can be told from the abandoned. */
  requestIds: DomainFoldkit.CommandIds,
  home: HomeData.schema,
  newMusic: NewMusicData.schema,
  search: SearchData.schema,
  /**
   * What the catalog said about every track asked for since the app loaded.
   * Opening one again needs no wait, and a row reads here whether its track
   * is loading, failed to open, or is gone from the catalog.
   */
  tracks: Schema.HashMap(TrackId, TrackData.schema),
  /**
   * The URL change the app has asked the browser for and not yet heard of: a
   * new entry for a page that took the screen, or the current entry rewritten
   * by typing in Search. The app is only ever told that the URL changed, never
   * how: the change that arrives for what it asked is its own, and any other
   * is the listener moving through the browser's history.
   */
  maybeAskedRoute: Schema.Option(AppRoute),
  /**
   * The pages the app takes to be behind the current one in the browser's
   * history, nearest last: those it left by a link and has not gone back to.
   * It is empty unless this visit left a page behind, which is what a page's
   * own way back relies on: see `retrace` in main.ts.
   */
  trail: Schema.Array(AppRoute),
  /**
   * Whether the navigation is whole or drawn back. Scrolling a page down
   * draws it back; reaching the top of a page, pressing its circle, or
   * choosing a section brings it out again.
   */
  navigation: Navigation,
  /**
   * The menus at the end of the rows, each under its row's id: those that
   * have been touched. Any other is a closed menu, and is not kept.
   */
  rowMenus: Schema.HashMap(Schema.String, Menu.Model),
  rowDone: RowDone,
  /**
   * The player: what was asked to be heard, and what the engine says is
   * sounding. It belongs to no page, so no change of page touches it.
   */
  player: PlayerModel,
});
export type Model = typeof Model.Type;

/** What is held about a track among those asked for: nothing yet when it never was. */
export const trackDataIn = (tracks: Model["tracks"], trackId: TrackId): TrackData =>
  AsyncData.fromOptionOrIdle(HashMap.get(tracks, trackId));

/** What the app holds about a track. */
export const trackData = (model: Model, trackId: TrackId): TrackData =>
  trackDataIn(model.tracks, trackId);

/** A page with data, or with a failure to state, has more to show than placeholders. */
const hasSomethingToShow = <A>(data: AsyncData.AsyncData<A, LoadError>): boolean =>
  AsyncData.hasData(data) || AsyncData.hasError(data);

/**
 * Whether a route's page has more than placeholders to show. Search with a
 * blank field always has: its prompt needs nothing from the catalog. So has
 * the page of the track the player holds, which is the player itself.
 */
export const canShow = (model: Model, route: AppRoute): boolean =>
  AppRoute.match(route, {
    Home: () => hasSomethingToShow(model.home),
    New: () => hasSomethingToShow(model.newMusic),
    Search: () => Option.isNone(searchedTerm(route)) || hasSomethingToShow(model.search),
    Track: ({ trackId }) =>
      hasSomethingToShow(trackData(model, trackId)) || isPlayersTrack(model, route),
    NotFound: () => true,
  });

/**
 * Whether the Model already holds what a route's page shows, so the page can
 * take the screen without a wait. A search is held only for the term it
 * answered.
 */
export const isLoaded = (model: Model, route: AppRoute): boolean =>
  AppRoute.match(route, {
    Home: () => AsyncData.hasData(model.home),
    New: () => AsyncData.hasData(model.newMusic),
    Search: () =>
      Option.match(searchedTerm(route), {
        onNone: () => true,
        onSome: (term) =>
          Option.exists(AsyncData.getData(model.search), (answer) => answer.term === term),
      }),
    Track: ({ trackId }) => AsyncData.hasData(trackData(model, trackId)),
    NotFound: () => true,
  });

/**
 * Whether a route is the page of the track the player holds. That page is
 * the player itself, expanded: the queue already holds what it shows, so it
 * never has to be waited for.
 */
export const isPlayersTrack = (model: Model, route: AppRoute): boolean =>
  route._tag === "Track" && Option.contains(maybeCurrentTrackId(model.player), route.trackId);

/**
 * Whether the player is expanded: the screen is the page of the track it
 * holds. Nothing records this. The route says which track is on screen, the
 * player says which is current, and the two are compared: on any other
 * track's page, and on every other page, the player is its island.
 */
export const isPlayerExpanded = (model: Model): boolean => isPlayersTrack(model, model.route);

/**
 * The page the app is waiting to put on screen in place of the one that is
 * there, if any: the one a link chose, or the one the browser went to.
 */
export const maybeHeadedFor = (model: Model): Option.Option<AppRoute> =>
  Awaiting.matchOrElse(
    model.awaiting,
    {
      Intention: ({ route }) => Option.some(route),
      Arrival: ({ route }) => Option.some(route),
    },
    () => Option.none(),
  );

/** The route the app takes the browser's URL to be. */
export const addressOf = (model: Model): AppRoute =>
  Awaiting.matchOrElse(model.awaiting, { Arrival: ({ route }) => route }, () => model.route);

/**
 * The page behind the current one in the browser's history, when the app
 * knows of one: where a page's own way back leads.
 */
export const wayBackOn = (trail: Model["trail"]): Option.Option<AppRoute> => Array.last(trail);

export const wayBack = (model: Model): Option.Option<AppRoute> => wayBackOn(model.trail);
