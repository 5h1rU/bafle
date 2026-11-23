import { Nav } from "@foldkit/ui";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import type { Document, Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "./message.ts";
import { canShow, type Model } from "./model.ts";
import * as Home from "./page/home.ts";
import * as NewMusic from "./page/newMusic.ts";
import * as NotFound from "./page/notFound.ts";
import * as Search from "./page/search.ts";
import { AppRoute, homeRouter, newRouter, searchedTerm, searchRouter } from "./route.ts";
import { homeIcon, newIcon, searchIcon, spinnerIcon } from "./view/icon.ts";

// VIEW

const APP_NAME = "Bafle";

/** The pages the navigation leads to: every route but the one for unknown addresses. */
type Destination = Exclude<AppRoute["_tag"], "NotFound">;

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

const pageName = (route: AppRoute): string =>
  AppRoute.matchOrElse(
    route,
    { NotFound: () => NotFound.TITLE },
    (destination) => DESTINATION_NAMES[destination._tag],
  );

/** The listener chose this destination and its page is not on screen yet. */
const isLoadingDestination = (model: Model, destination: Destination): boolean =>
  model.route._tag === destination && model.displayed._tag !== destination;

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
 * The current item is the page on screen, not the route: while a destination
 * loads, the listener is still where they were, and the item they chose is
 * the one marked busy.
 */
const navigationView = (model: Model, h: HtmlBuilder<Message>): Html =>
  Nav.view<Destination>({
    items: DESTINATIONS,
    ariaLabel: "Main",
    toHref: (destination) => DESTINATION_HREFS[destination],
    isItemCurrent: (destination) => model.displayed._tag === destination,
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

const pageView = (model: Model, h: HtmlBuilder<Message>): Html =>
  AppRoute.match(model.displayed, {
    Home: () => Home.view(model.home, h),
    New: () => NewMusic.view(model.newMusic, h),
    Search: (route) => Search.view(route.maybeTerm, searchedTerm(route), model.search, h),
    NotFound: ({ path }) => NotFound.view(path, h),
  });

/**
 * Said to assistive technology, which sees neither the spinner nor the swap:
 * that the chosen destination is loading, then which page is on screen.
 */
const pageStatus = (model: Model): string =>
  canShow(model, model.route)
    ? `Showing ${pageName(model.displayed)}`
    : `Loading ${pageName(model.route)}`;

/**
 * The shell: navigation beside the page on wide screens, under it on narrow
 * ones. The page drawn is `model.displayed`; `model.route` only says what
 * is loading: which navigation item is busy, and the status line.
 */
export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: `${pageName(model.displayed)} · ${APP_NAME}`,
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
      h.main([h.Class("min-h-0 min-w-0 flex-1")], [pageView(model, h)]),
      h.p([h.Role("status"), h.Class("sr-only")], [pageStatus(model)]),
    ],
  ),
});
