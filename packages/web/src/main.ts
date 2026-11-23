import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import type {
  FeaturedMusic,
  TrendingMusic,
} from "@bafle/domain/Catalog/MusicCatalog.external";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as String from "effect/String";
import { AsyncData, type Runtime, Update } from "foldkit";
import { UrlRequest } from "foldkit/navigation";
import { modifyFields } from "foldkit/struct";
import { toString as urlToString, type Url } from "foldkit/url";
import { Catalog, type CatalogClient, type LoadError, toLoadError } from "./catalog.ts";
import {
  askCatalogSearch,
  askHomeFeed,
  askNewMusic,
  FocusPage,
  FocusSearchField,
  LoadExternal,
  NavigateInternal,
  ReplaceSearchTerm,
  type Request,
  WaitForTypingPause,
} from "./command.ts";
import { Message } from "./message.ts";
import { Awaiting, canShow, Model, type SearchAnswer } from "./model.ts";
import { AppRoute, isSameRoute, routeToUrl, searchedTerm, urlToAppRoute } from "./route.ts";

type UpdateReturn = Update.Return<Model, Message, CatalogClient>;
type Step = Update.Step<Model, Message, CatalogClient>;

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

const isAnswerFor = (search: PageData<SearchAnswer>, term: string): boolean =>
  Option.exists(AsyncData.getData(search), (answer) => answer.term === term);

const forgetAnswer = (model: Model): Model => searchPage.write(model, AsyncData.Idle());

// UPDATE

const isAwaitingReply = (awaiting: Awaiting, requestId: string): boolean =>
  Awaiting.matchOrElse(
    awaiting,
    { Reply: (reply) => reply.requestId === requestId },
    () => false,
  );

const isAwaitingPause = (awaiting: Awaiting, pauseId: string): boolean =>
  Awaiting.matchOrElse(
    awaiting,
    { TypingPause: (pause) => pause.pauseId === pauseId },
    () => false,
  );

/** Search opens with its field focused, ready to be typed into. */
const focusSearchFieldOnSearch: Step = (model) =>
  model.displayed._tag === "Search" ? { model, commands: [FocusSearchField()] } : { model };

/**
 * Decide what is on screen. The destination takes the screen once it has
 * something to show; until then the page on screen stays, whole and usable.
 * Two cases do not wait: a change within the page on screen (typing in
 * Search), and a screen that only holds placeholders, which is nothing
 * worth holding.
 */
const swap: Step = (model) => {
  const isSwapping =
    canShow(model, model.route) ||
    model.displayed._tag === model.route._tag ||
    !canShow(model, model.displayed);
  if (!isSwapping) {
    return { model };
  }
  const swapped = modifyFields(model, { displayed: () => model.route });
  return model.displayed._tag === "Search" ? { model: swapped } : focusSearchFieldOnSearch(swapped);
};

/** Send a query and await its reply. Any earlier request stops being the one awaited. */
const send = (model: Model, ask: Request): UpdateReturn => {
  const allocation = DomainFoldkit.next(model.requestIds);
  return {
    model: modifyFields(model, {
      requestIds: () => allocation.commandIds,
      awaiting: () => Awaiting.Reply({ requestId: allocation.commandId }),
    }),
    commands: [ask(allocation.commandId)],
  };
};

/** Load a page for the first time, or refresh it over what it holds. */
const request = <A>(model: Model, page: Page<A>, ask: Request): UpdateReturn =>
  send(page.write(model, markPending(page.read(model))), ask);

/** Ask the catalog for what the current route shows. */
const load: Step = (model) =>
  AppRoute.match<UpdateReturn>(model.route, {
    Home: () => request(model, homePage, askHomeFeed),
    New: () => request(model, newMusicPage, askNewMusic),
    Search: () =>
      Option.match(searchedTerm(model.route), {
        onNone: () => ({ model }),
        onSome: (term) => request(model, searchPage, askCatalogSearch(term)),
      }),
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
 * Search loads like any page when the listener arrives from elsewhere: at
 * once, and from the answer on hand if it is for the same term. When Search
 * is already on screen the URL changed because they typed, so it waits for
 * a pause instead of asking on every letter.
 */
const loadSearch: Step = (model) =>
  Option.match(searchedTerm(model.route), {
    onNone: () => ({ model: forgetAnswer(model) }),
    onSome: (term) => {
      if (model.displayed._tag === "Search") {
        return waitForTypingPause(model);
      }
      return load(isAnswerFor(model.search, term) ? model : forgetAnswer(model));
    },
  });

/**
 * The route changed, so whatever was awaited belonged to another
 * destination: abandon it. Its reply, if it still comes, matches nothing.
 */
const turnTo =
  (route: AppRoute): Step =>
  (model) => ({
    model: modifyFields(model, {
      route: () => route,
      awaiting: () => Awaiting.Nothing(),
      home: standDown,
      newMusic: standDown,
      search: standDown,
    }),
  });

/** The listener chose a destination: the latest one wins, loads, and takes the screen when it can. */
const arriveAt = (route: AppRoute): Step =>
  Update.combine([
    turnTo(route),
    (stepModel) => (stepModel.route._tag === "Search" ? loadSearch(stepModel) : load(stepModel)),
    swap,
  ]);

/**
 * A link or Try again asked for a route. Anywhere but where the listener
 * already is, it navigates, and the URL change does the rest. Where they
 * already are, the history is left alone and the route loads again in
 * place: choosing it twice is still the latest choice, so a request already
 * out for it is abandoned for a new one. That is also the way out of a
 * request that never answers.
 */
const goTo =
  (route: AppRoute, url: string): Step =>
  (model) =>
    isSameRoute(route, model.route)
      ? Update.combine(model, [turnTo(route), load])
      : { model, commands: [NavigateInternal({ url })] };

const focusPage: Step = (model) => ({ model, commands: [FocusPage()] });

/**
 * A reply counts only if it answers the request awaited. It settles its
 * page: data replaces what was held, a failure keeps it. Then the screen
 * follows.
 */
const receive = <A>(
  model: Model,
  page: Page<A>,
  requestId: string,
  outcome: Result.Result<A, LoadError>,
): UpdateReturn => {
  if (!isAwaitingReply(model.awaiting, requestId)) {
    return { model };
  }
  const settled = page.write(model, AsyncData.settle(page.read(model), outcome));
  return swap(modifyFields(settled, { awaiting: () => Awaiting.Nothing() }));
};

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ClickedLink: ({ request }) =>
      UrlRequest.match<UpdateReturn>(request, {
        Internal: ({ url }) => goTo(urlToAppRoute(url), urlToString(url))(model),
        External: ({ href }) => ({ model, commands: [LoadExternal({ href })] }),
      }),

    ChangedUrl: ({ url }) => arriveAt(urlToAppRoute(url))(model),

    ClickedTryAgain: () =>
      Update.combine(model, [goTo(model.displayed, routeToUrl(model.displayed)), focusPage]),

    UpdatedSearchField: ({ value }) => ({
      model,
      commands: [ReplaceSearchTerm({ maybeTerm: Option.liftPredicate(value, String.isNonEmpty) })],
    }),

    CompletedWaitForTypingPause: ({ pauseId }) =>
      Option.match(searchedTerm(model.route), {
        onNone: () => ({ model }),
        onSome: (term) =>
          isAwaitingPause(model.awaiting, pauseId)
            ? send(model, askCatalogSearch(term))
            : { model },
      }),

    GotCatalogMessage: ({ message }) =>
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
          Option.match(searchedTerm(model.route), {
            onNone: () => ({ model }),
            onSome: (term) =>
              receive(model, searchPage, requestId, Result.succeed({ term, results: result })),
          }),
        FailedCatalogSearch: ({ requestId, failure }) =>
          receive(model, searchPage, requestId, Result.fail(toLoadError(failure))),
      }),

    CompletedNavigateInternal: () => ({ model }),
    CompletedLoadExternal: () => ({ model }),
    CompletedReplaceSearchTerm: () => ({ model }),
    CompletedFocusSearchField: () => ({ model }),
    CompletedFocusPage: () => ({ model }),
  });

// INIT

/**
 * Nothing has been on screen yet, so there is no page to hold and nothing
 * to abandon: the destination is shown at once, as placeholders in its
 * shape, and asks for its data without waiting for any typing to pause.
 */
export const init: Runtime.RoutingApplicationInit<Model, Message, void, CatalogClient> = (
  url: Url,
) => {
  const route = urlToAppRoute(url);
  return Update.combine(
    Model.make({
      route,
      displayed: route,
      awaiting: Awaiting.Nothing(),
      // Replies are matched in memory, so the ids only have to differ within this page load.
      requestIds: { session: "page", sent: 0 },
      home: AsyncData.Idle(),
      newMusic: AsyncData.Idle(),
      search: AsyncData.Idle(),
    }),
    [load, focusSearchFieldOnSearch],
  );
};

// VIEW TRANSITION

/**
 * Cross-fade when the page on screen changes, and only then: typing and
 * background refreshes repaint plainly. The runtime skips the transition
 * under `prefers-reduced-motion`.
 */
export const viewTransition: Runtime.ViewTransitionConfig<Model, Message> = ({
  previousModel,
  model,
}) => previousModel.displayed._tag !== model.displayed._tag;
