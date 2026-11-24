import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import type {
  FeaturedMusic,
  TrendingMusic,
} from "@bafle/domain/Catalog/MusicCatalog.external";
import type { Track, TrackId, TrackSummary } from "@bafle/domain/Catalog/Track";
import * as Array from "effect/Array";
import { identity, pipe } from "effect/Function";
import * as HashMap from "effect/HashMap";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as String from "effect/String";
import { AsyncData, type Runtime, Update } from "foldkit";
import { UrlRequest } from "foldkit/navigation";
import { modifyFields } from "foldkit/struct";
import type { Url } from "foldkit/url";
import {
  Catalog,
  type CatalogClient,
  type LoadError,
  toLoadError,
  toTrackOutcome,
} from "./catalog.ts";
import {
  askCatalogSearch,
  askHomeFeed,
  askNewMusic,
  askTrackDetail,
  FocusPage,
  FocusSearchField,
  FocusTrackRow,
  LoadExternal,
  NavigateBack,
  NavigateInternal,
  ReplaceSearchTerm,
  ReplaceTrackUrl,
  type Request,
  ScrollPageToTop,
  WaitForTypingPause,
} from "./command.ts";
import { Message, type PlayOrigin } from "./message.ts";
import {
  addressOf,
  Awaiting,
  canShow,
  type Entrance,
  maybeHeadedFor,
  isLoaded,
  isPlayerExpanded,
  isPlayersTrack,
  Model,
  type SearchAnswer,
  trackData,
} from "./model.ts";
import type { AudioEngine } from "./player/audioEngine.ts";
import * as Player from "./player/index.ts";
import {
  AppRoute,
  isSamePage,
  isSameRoute,
  routeToUrl,
  searchedTerm,
  urlToAppRoute,
} from "./route.ts";
import { pageIdOf } from "./view/layout.ts";

/** What the app's Commands and Subscriptions need from the runtime. */
export type Services = CatalogClient | AudioEngine;

type UpdateReturn = Update.Return<Model, Message, Services>;
type Step = Update.Step<Model, Message, Services>;

// PAGE DATA

type PageData<A> = AsyncData.AsyncData<A, LoadError>;

/** Where one page keeps what the catalog told it. */
type Page<A> = Readonly<{
  read: (model: Model) => PageData<A>;
  write: (model: Model, next: PageData<A>) => Model;
}>;

const homePage: Page<FeaturedMusic> = {
  read: (model) => model.home,
  write: (model, nextHome) => modifyFields(model, { home: () => nextHome }),
};

const newMusicPage: Page<TrendingMusic> = {
  read: (model) => model.newMusic,
  write: (model, nextNewMusic) => modifyFields(model, { newMusic: () => nextNewMusic }),
};

const searchPage: Page<SearchAnswer> = {
  read: (model) => model.search,
  write: (model, nextSearch) => modifyFields(model, { search: () => nextSearch }),
};

/** A track's page keeps what the catalog told it under the track's id. Nothing held is no entry. */
const trackPage = (trackId: TrackId): Page<Option.Option<Track>> => ({
  read: (model) => trackData(model, trackId),
  write: (model, nextTrack) =>
    modifyFields(model, {
      tracks: (tracks) =>
        AsyncData.isIdle(nextTrack)
          ? HashMap.remove(tracks, trackId)
          : HashMap.set(tracks, trackId, nextTrack),
    }),
});

/** Loading for the first time, or again over what is already held. */
const markPending = <A>(data: PageData<A>): PageData<A> =>
  Option.getOrElse(AsyncData.revalidateOrLoad(data), () => data);

/** Stop waiting for a reply that was abandoned: what the page held, it still holds. */
const standDown = <A>(data: PageData<A>): PageData<A> =>
  AsyncData.match(data, {
    onIdle: () => data,
    onLoading: () => AsyncData.Idle(),
    onRefreshing: (held) => AsyncData.Success({ data: held }),
    onFailure: () => data,
    onStale: () => data,
    onSuccess: () => data,
  });

const forgetAnswer = (model: Model): Model => searchPage.write(model, AsyncData.Idle());

/** The catalog has already said it has no such track: asking again would say the same. */
const isKnownMissing = (track: PageData<Option.Option<Track>>): boolean =>
  Option.exists(AsyncData.getData(track), Option.isNone);

// UPDATE

/** What a request is awaited as: how its reply will be recognised, and what it is for. */
type Expecting = (requestId: string) => Awaiting;

const forTheScreen: Expecting = (requestId) => Awaiting.Reply({ requestId });

const forIntention =
  (route: AppRoute): Expecting =>
  (requestId) =>
    Awaiting.Intention({ requestId, route });

const forArrival =
  (route: AppRoute, entrance: Entrance): Expecting =>
  (requestId) =>
    Awaiting.Arrival({ requestId, route, entrance });

const maybeAwaitedRequestId = (awaiting: Awaiting): Option.Option<string> =>
  Awaiting.match(awaiting, {
    Nothing: () => Option.none(),
    TypingPause: () => Option.none(),
    Reply: ({ requestId }) => Option.some(requestId),
    Intention: ({ requestId }) => Option.some(requestId),
    Arrival: ({ requestId }) => Option.some(requestId),
  });

const isAwaitingPause = (awaiting: Awaiting, pauseId: string): boolean =>
  Awaiting.matchOrElse(
    awaiting,
    { TypingPause: (pause) => pause.pauseId === pauseId },
    () => false,
  );

/** The page a reply is about: the one the app is heading for, else the one on screen. */
const awaitedRoute = (model: Model): AppRoute => Option.getOrElse(maybeHeadedFor(model), () => model.route);

/** Search opens with its field focused, ready to be typed into. */
const focusSearchFieldOnSearch: Step = (model) =>
  model.route._tag === "Search" ? { model, commands: [FocusSearchField()] } : { model };

/**
 * What takes the focus when another page takes the screen. Back from a track
 * it is the row that opened it, so the list is as the listener left it, down
 * to where the keyboard was. A track's page takes it itself: the row that
 * held it is now behind the page. Search gives it to its field.
 */
const focusOn = (left: AppRoute, entered: AppRoute, entrance: Entrance) =>
  left._tag === "Track" && entered._tag !== "Track" && entrance === "Returning"
    ? [FocusTrackRow({ pageId: pageIdOf(entered), trackId: left.trackId })]
    : AppRoute.matchOrElse(
        entered,
        {
          Search: () => [FocusSearchField()],
          Track: () => [FocusPage({ pageId: pageIdOf(entered) })],
        },
        () => [],
      );

/** Send a query and await its reply. Any earlier request stops being the one awaited. */
const send = (model: Model, ask: Request, expecting: Expecting): UpdateReturn => {
  const allocation = DomainFoldkit.next(model.requestIds);
  return {
    model: modifyFields(model, {
      requestIds: () => allocation.commandIds,
      awaiting: () => expecting(allocation.commandId),
    }),
    commands: [ask(allocation.commandId)],
  };
};

/** Load a page for the first time, or refresh it over what it holds. */
const requestPage = <A>(
  model: Model,
  page: Page<A>,
  ask: Request,
  expecting: Expecting,
): UpdateReturn =>
  send(page.write(model, markPending(page.read(model))), ask, expecting);

/** Ask the catalog for what a route shows. */
const load =
  (route: AppRoute, expecting: Expecting): Step =>
  (model) =>
    AppRoute.match<UpdateReturn>(route, {
      Home: () => requestPage(model, homePage, askHomeFeed, expecting),
      New: () => requestPage(model, newMusicPage, askNewMusic, expecting),
      Search: () =>
        Option.match(searchedTerm(route), {
          onNone: () => ({ model }),
          onSome: (term) => requestPage(model, searchPage, askCatalogSearch(term), expecting),
        }),
      Track: ({ trackId }) => {
        const page = trackPage(trackId);
        return isKnownMissing(page.read(model))
          ? { model }
          : requestPage(model, page, askTrackDetail(trackId), expecting);
      },
      NotFound: () => ({ model }),
    });

/** Keep the results on screen, marked as out of date, and ask once the typing pauses. */
const waitForTypingPause: Step = (model) => {
  const allocation = DomainFoldkit.next(model.requestIds);
  return {
    model: modifyFields(model, {
      requestIds: () => allocation.commandIds,
      awaiting: () => Awaiting.TypingPause({ pauseId: allocation.commandId }),
      search: markPending,
    }),
    commands: [WaitForTypingPause({ pauseId: allocation.commandId })],
  };
};

/**
 * Search is already on screen, so its URL changed because the listener
 * typed: it waits for a pause instead of asking on every letter. A blank
 * field asks nothing and goes back to the prompt.
 */
const followTyping: Step = (model) =>
  Option.match(searchedTerm(model.route), {
    onNone: () => ({ model: forgetAnswer(model) }),
    onSome: () => waitForTypingPause(model),
  });

/**
 * A search reached from another page starts from the answer on hand only if
 * it is for the same term: any other answer is for something else.
 */
const keepAnswerOnlyFor =
  (route: AppRoute) =>
  (model: Model): Model =>
    route._tag === "Search" && !(Option.isSome(searchedTerm(route)) && isLoaded(model, route))
      ? forgetAnswer(model)
      : model;

/**
 * Whether a page can take the screen without a wait: the Model holds what it
 * shows, or the screen only holds placeholders, which is nothing worth
 * holding. The page of the track the player holds is a third case: it is
 * the player expanded, drawn from what the queue already holds, so it takes
 * the screen at once and what the catalog adds fills in place.
 */
const needsNoWait = (model: Model, route: AppRoute): boolean =>
  isLoaded(model, route) || !canShow(model, model.route) || isPlayersTrack(model, route);

/** Stop waiting for every track: at most one was being asked for, and only it changes. */
const standDownTracks = (tracks: Model["tracks"]): Model["tracks"] =>
  pipe(
    tracks,
    HashMap.map((track) => standDown(track)),
    HashMap.filter((track) => !AsyncData.isIdle(track)),
  );

/**
 * The listener did something else, so whatever was awaited is abandoned
 * without a trace: its page goes back to what it held, a row that was
 * loading is a plain row again, and its reply, if it still comes, matches
 * nothing.
 */
const abandon = (model: Model): Model =>
  modifyFields(model, {
    awaiting: () => Awaiting.Nothing(),
    home: standDown,
    newMusic: standDown,
    search: standDown,
    tracks: standDownTracks,
  });

/** A page takes the screen. The focus follows, unless the screen only moved within the page. */
const showPage =
  (route: AppRoute, entrance: Entrance): Step =>
  (model) => {
    const shown = modifyFields(model, { route: () => route });
    return isSamePage(model.route, route)
      ? { model: shown }
      : { model: shown, commands: focusOn(model.route, route, entrance) };
  };

/** Ask the browser for a new history entry, and note it: its `ChangedUrl` is the app's own. */
const moveUrlTo =
  (route: AppRoute): Step =>
  (model) => ({
    model: modifyFields(model, { maybeAskedRoute: () => Option.some(route) }),
    commands: [NavigateInternal({ url: routeToUrl(route) })],
  });

/**
 * A page chosen by a link takes the screen, and only now does the URL move:
 * one new history entry, for a page that is shown. Behind it is the entry
 * the URL was at. The URL change this asks for comes back as a `ChangedUrl`
 * for the page already on screen, which changes nothing: see `arriveAt`.
 */
const commit =
  (route: AppRoute, behind: AppRoute): Step =>
  (model) =>
    Update.combine(modifyFields(model, { trail: Array.append(behind) }), [
      showPage(route, "Arriving"),
      moveUrlTo(route),
    ]);

/**
 * Whether a page chosen by a link can take the screen. A section does so
 * with its content or with its failure, since a navigation item has no room
 * to state one. A track does so only with the track itself: one that failed
 * to open, or that the catalog does not have, says so on its row.
 */
const canCommit = (model: Model, route: AppRoute): boolean =>
  AppRoute.matchOrElse(
    route,
    {
      Track: ({ trackId }) =>
        Option.exists(AsyncData.getData(trackData(model, trackId)), Option.isSome),
    },
    () => canShow(model, route),
  );

/**
 * How the URL came to be a route's. The app only hears that it changed, so
 * it tells the cases apart by what it knows: the change it asked for itself,
 * and the page it left by a link to get where it was.
 */
type UrlChangeCause = "Asked" | "Back" | "Unplaced";

// NOTE: a jump through the browser's history menu onto a page the same as the
// nearest of the trail reads as Back: the URL is all the app is told. The
// trail then names pages that are not behind the current one.
const causeOfUrlChange = (model: Model, route: AppRoute): UrlChangeCause => {
  if (Option.exists(model.maybeAskedRoute, (asked) => isSameRoute(asked, route))) {
    return "Asked";
  }
  return Option.exists(Array.last(model.trail), (nearest) => isSameRoute(nearest, route))
    ? "Back"
    : "Unplaced";
};

type Trail = Model["trail"];

/**
 * Keep the trail true to the browser's history. The app's own changes need
 * nothing here: a page chosen by a link put the entry it left on the trail
 * as it took the screen, and typing in Search rewrites its own entry and
 * moves nothing. Going back to the nearest page of the trail takes it off.
 * Any other move, Forward or a jump, lands somewhere the app cannot place, so
 * it forgets the trail rather than trust it: a way back that leads nowhere
 * is worse than none.
 */
const retraceTrail = (cause: UrlChangeCause): ((trail: Trail) => Trail) =>
  Match.value(cause).pipe(
    Match.withReturnType<(trail: Trail) => Trail>(),
    Match.when("Asked", () => identity),
    Match.when("Back", () => Array.dropRight(1)),
    Match.when("Unplaced", () => () => []),
    Match.exhaustive,
  );

const retrace =
  (cause: UrlChangeCause) =>
  (model: Model): Model =>
    modifyFields(model, {
      maybeAskedRoute: () => Option.none(),
      trail: retraceTrail(cause),
    });

/**
 * The browser is already at a route: the URL moved first, so only the screen
 * can be held. A page the Model holds takes it at once and refreshes behind
 * it; any other holds the page on screen until its reply comes. Two cases do
 * not wait: a change within the page on screen (typing in Search), and a
 * screen that only holds placeholders, which is nothing worth holding.
 */
const enterByUrl =
  (route: AppRoute, entrance: Entrance): Step =>
  (model) => {
    if (isSamePage(route, model.route)) {
      return Update.combine(model, [
        showPage(route, entrance),
        route._tag === "Search" ? followTyping : load(route, forTheScreen),
      ]);
    }
    const prepared = keepAnswerOnlyFor(route)(model);
    return needsNoWait(prepared, route)
      ? Update.combine(prepared, [showPage(route, entrance), load(route, forTheScreen)])
      : load(route, forArrival(route, entrance))(prepared);
  };

/**
 * The browser says where the URL is. Where the app already takes it to be,
 * there is nothing to do: a page chosen by a link moved the URL as it took
 * the screen, and this is that change coming back. Anywhere else, the
 * listener went Back or Forward, or typed in Search, and whatever was awaited
 * belonged to another destination: it is abandoned.
 */
const arriveAt =
  (route: AppRoute): Step =>
  (model) => {
    const cause = causeOfUrlChange(model, route);
    const retraced = retrace(cause)(model);
    return isSameRoute(route, addressOf(model))
      ? { model: retraced }
      : enterByUrl(route, cause === "Back" ? "Returning" : "Arriving")(abandon(retraced));
  };

/**
 * The listener's next choice leaves the page on screen where it is, so the
 * URL has to be that page's again. It is not when a page reached by Back or
 * Forward was still loading: the page on screen, which the listener is acting
 * from, gets the entry after that one.
 */
const bringUrlToScreen =
  (abandoned: Awaiting): Step =>
  (model) =>
    Awaiting.matchOrElse<UpdateReturn>(
      abandoned,
      {
        Arrival: ({ route }) =>
          moveUrlTo(model.route)(modifyFields(model, { trail: Array.append(route) })),
      },
      () => ({ model }),
    );

/** Give up whatever was awaited, and stay on the page on screen. */
const returnToScreen: Step = (model) => bringUrlToScreen(model.awaiting)(abandon(model));

/**
 * The page on screen loads again where it stands, and the history is left
 * alone. Choosing it twice is still the latest choice, so a request already
 * out for it is abandoned for a new one.
 */
const reload: Step = (model) =>
  Update.combine(model, [
    returnToScreen,
    (stepModel) => load(stepModel.route, forTheScreen)(stepModel),
  ]);

/**
 * Head for a page chosen by a link. One the Model holds takes the screen at
 * once and refreshes behind it, and so does any page when the screen only
 * holds placeholders. Otherwise the intention is recorded and the query sent:
 * the page on screen stays, the URL stays, and the reply decides the rest.
 */
const headFor =
  (route: AppRoute): Step =>
  (model) => {
    const freed = keepAnswerOnlyFor(route)(abandon(model));
    return needsNoWait(freed, route)
      ? Update.combine(freed, [commit(route, addressOf(model)), load(route, forTheScreen)])
      : Update.combine(freed, [
          bringUrlToScreen(model.awaiting),
          load(route, forIntention(route)),
        ]);
  };

/**
 * A link asked for a route. The latest choice wins: whatever was awaited is
 * abandoned first. A track the catalog is known not to have is no longer
 * something to open, so asking for it changes nothing.
 */
const follow =
  (route: AppRoute): Step =>
  (model) => {
    if (
      route._tag === "Track" &&
      isKnownMissing(trackData(model, route.trackId)) &&
      !isPlayersTrack(model, route)
    ) {
      return { model };
    }
    return isSameRoute(route, model.route) ? reload(model) : headFor(route)(model);
  };

/** Choosing the page already on screen asks for its top, as a tab bar does. */
const scrollToTopWhenChosenAgain =
  (route: AppRoute): Step =>
  (model) =>
    isSameRoute(route, model.route)
      ? { model, commands: [ScrollPageToTop({ pageId: pageIdOf(route) })] }
      : { model };

const focusPage: Step = (model) => ({
  model,
  commands: [FocusPage({ pageId: pageIdOf(model.route) })],
});

/** What held the focus in a row is about to go: the row itself takes it. */
const focusTrackRow =
  (trackId: TrackId): Step =>
  (model) => ({
    model,
    commands: [FocusTrackRow({ pageId: pageIdOf(model.route), trackId })],
  });

/**
 * The reply to an intention has been settled into the Model. A page that can
 * take the screen does, and the URL with it. A track that cannot stays where
 * its row is, with what the catalog said: the list, the URL and the history
 * are as they were. A row that turns out to be for a track the catalog does
 * not have stops being a link, and a link that goes takes the focus with it:
 * the row is given it back.
 */
const commitIfOpenable =
  (route: AppRoute): Step =>
  (model) => {
    if (canCommit(model, route)) {
      return commit(route, model.route)(model);
    }
    return route._tag === "Track" && isKnownMissing(trackData(model, route.trackId))
      ? focusTrackRow(route.trackId)(model)
      : { model };
  };

/**
 * A reply counts only if it answers the request awaited. It settles its
 * page: data replaces what was held, a failure keeps it. Then the screen
 * follows, for a page that was being waited for.
 */
const receive = <A>(
  model: Model,
  page: Page<A>,
  requestId: string,
  outcome: Result.Result<A, LoadError>,
): UpdateReturn => {
  if (!Option.contains(maybeAwaitedRequestId(model.awaiting), requestId)) {
    return { model };
  }
  const settled = modifyFields(page.write(model, AsyncData.settle(page.read(model), outcome)), {
    awaiting: () => Awaiting.Nothing(),
  });
  return Awaiting.matchOrElse<UpdateReturn>(
    model.awaiting,
    {
      Intention: ({ route }) => commitIfOpenable(route)(settled),
      Arrival: ({ route, entrance }) => showPage(route, entrance)(settled),
    },
    () => ({ model: settled }),
  );
};

/** A reply about a track is about the one awaited: the one being opened, else the one on screen. */
const receiveTrack = (
  model: Model,
  requestId: string,
  outcome: Result.Result<Option.Option<Track>, LoadError>,
): UpdateReturn =>
  AppRoute.matchOrElse<UpdateReturn>(
    awaitedRoute(model),
    { Track: ({ trackId }) => receive(model, trackPage(trackId), requestId, outcome) },
    () => ({ model }),
  );

const receiveCatalogMessage = (model: Model, message: typeof Catalog.Message.Type): UpdateReturn =>
  Catalog.Message.match<UpdateReturn>(message, {
    SucceededHomeFeed: ({ requestId, result }) =>
      receive(model, homePage, requestId, Result.succeed(result)),
    FailedHomeFeed: ({ requestId, failure }) =>
      receive(model, homePage, requestId, Result.fail(toLoadError(failure))),
    SucceededNewMusic: ({ requestId, result }) =>
      receive(model, newMusicPage, requestId, Result.succeed(result)),
    FailedNewMusic: ({ requestId, failure }) =>
      receive(model, newMusicPage, requestId, Result.fail(toLoadError(failure))),
    SucceededCatalogSearch: ({ requestId, result }) =>
      Option.match(searchedTerm(awaitedRoute(model)), {
        onNone: () => ({ model }),
        onSome: (term) =>
          receive(model, searchPage, requestId, Result.succeed({ term, results: result })),
      }),
    FailedCatalogSearch: ({ requestId, failure }) =>
      receive(model, searchPage, requestId, Result.fail(toLoadError(failure))),
    SucceededTrackDetail: ({ requestId, result }) =>
      receiveTrack(model, requestId, Result.succeed(Option.some(result))),
    FailedTrackDetail: ({ requestId, failure }) =>
      receiveTrack(model, requestId, toTrackOutcome(failure)),
  });

/**
 * Typing goes through the URL: the current history entry is rewritten, so the
 * field's text survives a reload and Back never walks a term back letter by
 * letter. The entry is Search's own, except while a page reached by Back or
 * Forward is still loading: then the current entry is that page's, and Search
 * is given a new one after it instead of rewriting it.
 */
const rewriteSearchTerm =
  (maybeTerm: Option.Option<string>): Step =>
  (model) => {
    const route = AppRoute.Search({ maybeTerm });
    return Awaiting.matchOrElse<UpdateReturn>(
      model.awaiting,
      {
        Arrival: (awaited) =>
          moveUrlTo(route)(
            modifyFields(abandon(model), { trail: Array.append(awaited.route) }),
          ),
      },
      () => ({
        model: modifyFields(model, { maybeAskedRoute: () => Option.some(route) }),
        commands: [ReplaceSearchTerm({ maybeTerm })],
      }),
    );
  };

// PLAYER

const readPlayer = (model: Model) => Option.some(model.player);

/** A player left as it was leaves the Model as it was: nothing is drawn again for it. */
const writePlayer = (model: Model, nextPlayer: Player.Model): Model =>
  nextPlayer === model.player ? model : modifyFields(model, { player: () => nextPlayer });

const toGotPlayerMessage = (message: Player.Message): Message =>
  Message.GotPlayerMessage({ message });

const foldPlayer = Update.foldChild({
  update: Player.update,
  read: readPlayer,
  write: writePlayer,
  toParentMessage: toGotPlayerMessage,
});

const foldPlayerChoice = Update.foldChild({
  update: Player.choose,
  read: readPlayer,
  write: writePlayer,
  toParentMessage: toGotPlayerMessage,
});

/**
 * The list a track was played from, as the page it is on holds it: what
 * plays after it. A track played from its own page is a list of one.
 */
const listPlayedFrom = (
  model: Model,
  from: PlayOrigin,
  trackId: TrackId,
): ReadonlyArray<TrackSummary> =>
  Match.value(from).pipe(
    Match.withReturnType<ReadonlyArray<TrackSummary>>(),
    Match.when("New", () =>
      Option.match(AsyncData.getData(model.newMusic), {
        onNone: () => [],
        onSome: (trending) => trending.tracks,
      }),
    ),
    Match.when("Search", () =>
      Option.match(AsyncData.getData(model.search), {
        onNone: () => [],
        onSome: (answer) => answer.results.tracks,
      }),
    ),
    Match.when("Track", () =>
      Array.fromOption(Option.flatten(AsyncData.getData(trackData(model, trackId)))),
    ),
    Match.exhaustive,
  );

/**
 * The player was expanded and has gone on to another track: the screen and
 * the URL follow it, and what the catalog knows of the new track is asked
 * for. The history entry is rewritten, not added to, so Back still closes
 * the player. Two things already under way are left alone: a page the
 * listener chose and is waiting for keeps being waited for, and where the
 * browser has already moved the URL to a page still loading, that URL is not
 * this page's to rewrite.
 */
const followTrack =
  (trackId: TrackId): Step =>
  (model) => {
    const route = AppRoute.Track({ trackId });
    const shown = modifyFields(model, { route: () => route });
    return Awaiting.match<UpdateReturn>(model.awaiting, {
      Arrival: () => ({ model: shown }),
      // NOTE: a page the listener is waiting for that turns out to be this
      // very one has arrived by another way: its reply must not add an entry.
      Intention: (awaited) =>
        isSamePage(awaited.route, route)
          ? Update.combine(abandon(shown), [rewriteUrlFor(route), load(route, forTheScreen)])
          : rewriteUrlFor(route)(shown),
      TypingPause: () => rewriteUrlFor(route)(shown),
      Nothing: () => Update.combine(shown, [rewriteUrlFor(route), load(route, forTheScreen)]),
      Reply: () =>
        Update.combine(abandon(shown), [rewriteUrlFor(route), load(route, forTheScreen)]),
    });
  };

const rewriteUrlFor =
  (route: Extract<AppRoute, { _tag: "Track" }>): Step =>
  (model) => ({
    model: modifyFields(model, { maybeAskedRoute: () => Option.some(route) }),
    commands: [ReplaceTrackUrl({ trackId: route.trackId })],
  });

/**
 * After the player has had a Message: an expanded player that now holds
 * another track takes the screen and the URL with it. It is told from the
 * Model before and the Model after, not from the Message, so it holds for a
 * press of Next and for a track that follows by itself alike.
 */
const keepUpWithPlayer =
  (before: Model): Step =>
  (model) =>
    isPlayerExpanded(before) && !isPlayerExpanded(model)
      ? Option.match(Player.maybeCurrentTrackId(model.player), {
          onNone: () => ({ model }),
          onSome: (trackId) => followTrack(trackId)(model),
        })
      : { model };

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ClickedLink: ({ request }) =>
      UrlRequest.match<UpdateReturn>(request, {
        Internal: ({ url }) => {
          const route = urlToAppRoute(url);
          return Update.combine(model, [scrollToTopWhenChosenAgain(route), follow(route)]);
        },
        External: ({ href }) => ({ model, commands: [LoadExternal({ href })] }),
      }),

    ChangedUrl: ({ url }) => arriveAt(urlToAppRoute(url))(model),

    ClickedBack: () => ({ model, commands: [NavigateBack()] }),

    ClickedTryAgain: () => Update.combine(model, [reload, focusPage]),

    ClickedTryAgainOnTrack: ({ trackId }) =>
      Update.combine(model, [follow(AppRoute.Track({ trackId })), focusTrackRow(trackId)]),

    UpdatedSearchField: ({ value }) =>
      rewriteSearchTerm(Option.liftPredicate(value, String.isNonEmpty))(model),

    CompletedWaitForTypingPause: ({ pauseId }) =>
      Option.match(searchedTerm(model.route), {
        onNone: () => ({ model }),
        onSome: (term) =>
          isAwaitingPause(model.awaiting, pauseId)
            ? send(model, askCatalogSearch(term), forTheScreen)
            : { model },
      }),

    GotCatalogMessage: ({ message }) => receiveCatalogMessage(model, message),

    // NOTE: playing is no navigation, with one exception. No navigation
    // Message reaches the player, and the player moves the route only while
    // it is expanded, when its page is the page of the track it holds.
    ClickedPlayTrack: ({ trackId, from }) =>
      Update.combine(model, [
        foldPlayerChoice({ trackId, list: listPlayedFrom(model, from, trackId) }),
        keepUpWithPlayer(model),
      ]),

    GotPlayerMessage: ({ message }) =>
      Update.combine(model, [foldPlayer(message), keepUpWithPlayer(model)]),

    CompletedNavigateInternal: () => ({ model }),
    CompletedNavigateBack: () => ({ model }),
    CompletedLoadExternal: () => ({ model }),
    CompletedReplaceSearchTerm: () => ({ model }),
    CompletedReplaceTrackUrl: () => ({ model }),
    CompletedFocusSearchField: () => ({ model }),
    CompletedFocusPage: () => ({ model }),
    CompletedFocusTrackRow: () => ({ model }),
    CompletedScrollPageToTop: () => ({ model }),
  });

// INIT

/**
 * Nothing has been on screen yet, so there is no page to hold and nothing
 * to abandon: the destination is shown at once, as placeholders in its
 * shape, and asks for its data without waiting for any typing to pause.
 */
export const init: Runtime.RoutingApplicationInit<Model, Message, void, Services> = (
  url: Url,
) => {
  const route = urlToAppRoute(url);
  return Update.combine(
    Model.make({
      route,
      awaiting: Awaiting.Nothing(),
      // Replies are matched in memory, so the ids only have to differ within this page load.
      requestIds: { session: "page", sent: 0 },
      home: AsyncData.Idle(),
      newMusic: AsyncData.Idle(),
      search: AsyncData.Idle(),
      tracks: HashMap.empty(),
      maybeAskedRoute: Option.none(),
      // A fresh load knows nothing of the history behind it, so no page has a way back yet.
      trail: [],
      player: Player.init(),
    }),
    [load(route, forTheScreen), focusSearchFieldOnSearch],
  );
};

// VIEW TRANSITION

/**
 * A view transition when the page on screen changes, and when the listener
 * puts another track in the player: the first cross-fades the pages, the
 * second carries the track's cover from where it was pressed to the island.
 * A track that followed the one before by itself asks for none: nobody
 * tapped, and a transition would hold the page still for a moment under a
 * listener who may be scrolling it.
 * Typing, background refreshes, the engine's reports and the URL catching up
 * with a page already shown repaint plainly. Both are read from the two
 * Models, not from the Message: several Messages can share one frame, and
 * only the last is told. The runtime skips the transition under
 * `prefers-reduced-motion`. Opening the player, closing it, and Back out of
 * it are page changes like any other, so they are covered: the island and
 * the expanded player share a name, and the browser grows one into the other.
 */
export const viewTransition: Runtime.ViewTransitionConfig<Model, Message> = ({
  previousModel,
  model,
}) =>
  // NOTE: an expanded player that goes on to another track changes route,
  // and is the same sheet: its words and its picture change where they stand.
  !(isPlayerExpanded(previousModel) && isPlayerExpanded(model)) &&
  (!isSamePage(previousModel.route, model.route) ||
    Player.choseAnotherTrack(previousModel.player, model.player));
