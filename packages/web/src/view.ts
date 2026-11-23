import { Nav } from "@foldkit/ui";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import type { Document, Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "./message.ts";
import { Awaiting, canShow, maybeHeadedFor, type Model, trackData, wayBack } from "./model.ts";
import * as Home from "./page/home.ts";
import * as NewMusic from "./page/newMusic.ts";
import * as NotFound from "./page/notFound.ts";
import * as Search from "./page/search.ts";
import * as Track from "./page/track.ts";
import { AppRoute, homeRouter, newRouter, searchedTerm, searchRouter } from "./route.ts";
import { homeIcon, newIcon, searchIcon, spinnerIcon } from "./view/icon.ts";
import { pagePlaceView, type Presence } from "./view/layout.ts";
import type { TrackListContext } from "./view/trackList.ts";

// VIEW

const APP_NAME = "Bafle";

/** The pages the navigation leads to: the sections of the app, each kept once it has loaded. */
type Destination = Exclude<AppRoute["_tag"], "Track" | "NotFound">;

const DESTINATIONS: ReadonlyArray<Destination> = ["Home", "New", "Search"];

const DESTINATION_HREFS: Readonly<Record<Destination, string>> = {
  Home: homeRouter(),
  New: newRouter(),
  Search: searchRouter({ maybeTerm: Option.none() }),
};

const DESTINATION_ICONS: Readonly<Record<Destination, (className: string) => Html>> = {
  Home: homeIcon,
  New: newIcon,
  Search: searchIcon,
};

const DESTINATION_NAMES: Readonly<Record<Destination, string>> = {
  Home: "Home",
  New: "New",
  Search: "Search",
};

const pageName = (model: Model, route: AppRoute): string =>
  AppRoute.match(route, {
    Home: () => DESTINATION_NAMES.Home,
    New: () => DESTINATION_NAMES.New,
    Search: () => DESTINATION_NAMES.Search,
    Track: ({ trackId }) => Track.titleOf(trackData(model, trackId)),
    NotFound: () => NotFound.TITLE,
  });

/**
 * The app is heading for this destination and its page is not on screen yet.
 * A track is no destination of the navigation: the row it was opened from
 * says that it is loading.
 */
const isLoadingDestination = (model: Model, destination: Destination): boolean =>
  model.route._tag !== destination &&
  Option.exists(maybeHeadedFor(model), (route) => route._tag === destination);

const destinationView = (
  item: Nav.ItemInfo<Destination>,
  isLoading: boolean,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed("li")(
    item.value,
    [h.Class("flex-1 md:flex-none")],
    [
      h.a(
        [
          ...item.link,
          h.AriaBusy(isLoading),
          h.Class(
            "flex flex-col items-center gap-1 px-3 py-2 text-xs font-medium text-muted hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent data-current:text-accent md:flex-row md:gap-3 md:rounded-lg md:text-sm md:data-current:bg-accent-wash",
          ),
        ],
        [
          // The spinner takes the icon's place, so the item keeps its size while it loads.
          isLoading
            ? spinnerIcon("size-5 animate-spin motion-reduce:animate-pulse")
            : DESTINATION_ICONS[item.value]("size-5"),
          h.span([], [DESTINATION_NAMES[item.value]]),
        ],
      ),
    ],
  );

/**
 * The current item is the page on screen: while a destination loads, the
 * listener is still where they were, and the item they chose is the one
 * marked busy.
 */
const navigationView = (model: Model, h: HtmlBuilder<Message>): Html =>
  Nav.view<Destination>({
    items: DESTINATIONS,
    ariaLabel: "Main",
    toHref: (destination) => DESTINATION_HREFS[destination],
    isItemCurrent: (destination) => model.route._tag === destination,
    toView: ({ nav, items }) =>
      h.nav(
        [...nav],
        [
          h.ul(
            [h.Role("list"), h.Class("flex md:flex-col md:gap-1")],
            Array.map(items, (item) =>
              destinationView(item, isLoadingDestination(model, item.value), h),
            ),
          ),
        ],
      ),
  });

const presenceOf = (model: Model, destination: Destination): Presence =>
  model.route._tag === destination ? "OnScreen" : "Kept";

/**
 * A section is in the document while it is on screen and, once it holds
 * data, for as long as it does: hidden behind the page on screen, with its
 * scroll positions and its pictures as the listener left them.
 */
const isInDocument = <A, E>(presence: Presence, data: AsyncData.AsyncData<A, E>): boolean =>
  presence === "OnScreen" || AsyncData.hasData(data);

const homePlaceView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const presence = presenceOf(model, "Home");
  return pagePlaceView(
    presence,
    isInDocument(presence, model.home) ? [Home.view(model.home, presence, h)] : [],
    h,
  );
};

const newPlaceView = (model: Model, context: TrackListContext, h: HtmlBuilder<Message>): Html =>
  pagePlaceView(
    context.presence,
    isInDocument(context.presence, model.newMusic)
      ? [NewMusic.view(model.newMusic, context, h)]
      : [],
    h,
  );

/**
 * On screen, Search shows what its route says. Kept, it has no route: its
 * field holds the term its results are for, which is how it was left unless
 * the listener was still typing.
 */
const searchPlaceView = (
  model: Model,
  context: TrackListContext,
  h: HtmlBuilder<Message>,
): Html =>
  pagePlaceView(
    context.presence,
    AppRoute.matchOrElse(
      model.route,
      {
        Search: (route) => [
          Search.view(route.maybeTerm, searchedTerm(route), model.search, context, h),
        ],
      },
      () =>
        Option.match(AsyncData.getData(model.search), {
          onNone: () => [],
          onSome: ({ term }) => [
            Search.view(Option.some(term), Option.some(term), model.search, context, h),
          ],
        }),
    ),
    h,
  );

/** The pages that are not kept: each is built when it takes the screen and gone when it leaves. */
const passingPlaceView = (model: Model, h: HtmlBuilder<Message>): Html =>
  AppRoute.matchOrElse(
    model.route,
    {
      Track: ({ trackId }) =>
        pagePlaceView(
          "OnScreen",
          [Track.view(trackId, trackData(model, trackId), wayBack(model), h)],
          h,
        ),
      NotFound: ({ path }) => pagePlaceView("OnScreen", [NotFound.view(path, h)], h),
    },
    () => pagePlaceView("Kept", [], h),
  );

/**
 * Every page has its place, always in the same order, and the sections stay
 * in theirs once loaded. Going from one to another, or back from a track,
 * changes which place is drawn and rebuilds nothing.
 */
const pagesView = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> => {
  const listContext = (destination: Destination): TrackListContext => ({
    presence: presenceOf(model, destination),
    trackDataOf: (trackId) => trackData(model, trackId),
  });

  return [
    homePlaceView(model, h),
    newPlaceView(model, listContext("New"), h),
    searchPlaceView(model, listContext("Search"), h),
    passingPlaceView(model, h),
  ];
};

/**
 * The page said to be loading. A track opened from a row is not: its row
 * says that it is opening, and how that ended, so the two never speak of the
 * same thing at once.
 */
const maybeAnnouncedDestination = (model: Model): Option.Option<AppRoute> =>
  Option.filter(
    maybeHeadedFor(model),
    (route) => !(Awaiting.guards.Intention(model.awaiting) && route._tag === "Track"),
  );

/**
 * Said to assistive technology, which sees neither the spinner nor the swap:
 * that the chosen destination is loading, then which page is on screen.
 */
const pageStatus = (model: Model): string =>
  Option.match(maybeAnnouncedDestination(model), {
    onSome: (route) => `Loading ${pageName(model, route)}`,
    onNone: () =>
      canShow(model, model.route)
        ? `Showing ${pageName(model, model.route)}`
        : `Loading ${pageName(model, model.route)}`,
  });

/** The document is titled after the page on screen: a track's page, after its track. */
export const documentTitle = (model: Model): string =>
  `${pageName(model, model.route)} · ${APP_NAME}`;

/**
 * The shell: navigation beside the page on wide screens, under it on narrow
 * ones. The page drawn is `model.route`; what the app is heading for only
 * says what is loading: which navigation item is busy, and the status line.
 */
export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: documentTitle(model),
  body: h.div(
    [h.Class("flex h-dvh flex-col-reverse bg-canvas font-sans text-ink antialiased md:flex-row")],
    [
      h.header(
        [
          h.Class(
            "shrink-0 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] [view-transition-name:navigation] md:w-60 md:border-t-0 md:border-r md:px-3 md:py-6",
          ),
        ],
        [
          h.p(
            [h.Class("sr-only md:not-sr-only md:px-3 md:pb-6 md:text-2xl md:font-bold md:tracking-tight")],
            [APP_NAME],
          ),
          navigationView(model, h),
        ],
      ),
      h.main([h.Class("relative min-h-0 min-w-0 flex-1")], pagesView(model, h)),
      h.p([h.Role("status"), h.Class("sr-only")], [pageStatus(model)]),
    ],
  ),
});
