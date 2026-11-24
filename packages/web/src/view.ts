import type { TrackId, TrackSummary } from "@bafle/domain/Catalog/Track";
import { Nav } from "@foldkit/ui";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import { createLazy, type Document, type Html, type HtmlBuilder } from "foldkit/html";
import { Message, type PlayOrigin } from "./message.ts";
import {
  Awaiting,
  canShow,
  maybeHeadedFor,
  type Model,
  trackData,
  trackDataIn,
  wayBackOn,
} from "./model.ts";
import * as Player from "./player/index.ts";
import * as Home from "./page/home.ts";
import * as NewMusic from "./page/newMusic.ts";
import * as NotFound from "./page/notFound.ts";
import * as Search from "./page/search.ts";
import * as Track from "./page/track.ts";
import {
  AppRoute,
  homeRouter,
  newRouter,
  searchedTerm,
  searchRouter,
  trackRouter,
} from "./route.ts";
import { reason } from "./view/feedback.ts";
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

// NOTE: the page places below are drawn from the parts of the Model they
// show, each part passed as it is held, and kept by `createLazy` while those
// parts are the very same. The player reports the engine's position every
// second, which changes none of them, so no page is drawn again for it. What
// a page needs of the player is therefore passed as two plain values that
// compare by `===`, the id of the track it holds and that track's status: an
// `Option` made on each draw would be a new object and miss every time.

/** What a list reads of the Model, from the parts a kept drawing is checked against. */
const listContext = (
  presence: Presence,
  from: PlayOrigin,
  tracks: Model["tracks"],
  playingTrackId: TrackId | undefined,
  playingStatus: Player.TrackStatus,
): TrackListContext => ({
  presence,
  from,
  trackDataOf: (trackId) => trackDataIn(tracks, trackId),
  statusOf: (trackId) => Player.statusFor(playingTrackId, playingStatus, trackId),
});

const homePlaceView = (home: Model["home"], presence: Presence, h: HtmlBuilder<Message>): Html =>
  pagePlaceView(presence, isInDocument(presence, home) ? [Home.view(home, presence, h)] : [], h);

const newPlaceView = (
  newMusic: Model["newMusic"],
  presence: Presence,
  tracks: Model["tracks"],
  playingTrackId: TrackId | undefined,
  playingStatus: Player.TrackStatus,
  h: HtmlBuilder<Message>,
): Html =>
  pagePlaceView(
    presence,
    isInDocument(presence, newMusic)
      ? [
          NewMusic.view(
            newMusic,
            listContext(presence, "New", tracks, playingTrackId, playingStatus),
            h,
          ),
        ]
      : [],
    h,
  );

/**
 * On screen, Search shows what its route says. Kept, it has no route: its
 * field holds the term its results are for, which is how it was left unless
 * the listener was still typing.
 */
const searchPlaceView = (
  route: AppRoute,
  search: Model["search"],
  tracks: Model["tracks"],
  playingTrackId: TrackId | undefined,
  playingStatus: Player.TrackStatus,
  h: HtmlBuilder<Message>,
): Html => {
  const presence: Presence = route._tag === "Search" ? "OnScreen" : "Kept";
  const context = listContext(presence, "Search", tracks, playingTrackId, playingStatus);

  return pagePlaceView(
    presence,
    AppRoute.matchOrElse(
      route,
      {
        Search: (shown) => [
          Search.view(shown.maybeTerm, searchedTerm(shown), search, context, h),
        ],
      },
      () =>
        Option.match(AsyncData.getData(search), {
          onNone: () => [],
          onSome: ({ term }) => [
            Search.view(Option.some(term), Option.some(term), search, context, h),
          ],
        }),
    ),
    h,
  );
};

/** The pages that are not kept: each is built when it takes the screen and gone when it leaves. */
const passingPlaceView = (
  route: AppRoute,
  tracks: Model["tracks"],
  trail: Model["trail"],
  playingTrackId: TrackId | undefined,
  playingStatus: Player.TrackStatus,
  h: HtmlBuilder<Message>,
): Html =>
  AppRoute.matchOrElse(
    route,
    {
      Track: ({ trackId }) =>
        pagePlaceView(
          "OnScreen",
          [
            Track.view(
              trackId,
              trackDataIn(tracks, trackId),
              wayBackOn(trail),
              Player.statusFor(playingTrackId, playingStatus, trackId),
              h,
            ),
          ],
          h,
        ),
      NotFound: ({ path }) => pagePlaceView("OnScreen", [NotFound.view(path, h)], h),
    },
    () => pagePlaceView("Kept", [], h),
  );

const lazyHomePlace = createLazy();
const lazyNewPlace = createLazy();
const lazySearchPlace = createLazy();
const lazyPassingPlace = createLazy();

/**
 * Every page has its place, always in the same order, and the sections stay
 * in theirs once loaded. Going from one to another, or back from a track,
 * changes which place is drawn and rebuilds nothing.
 */
const pagesView = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> => {
  const playingTrackId = Option.getOrUndefined(Player.maybeCurrentTrackId(model.player));
  const playingStatus = Player.currentTrackStatus(model.player);

  return [
    lazyHomePlace(homePlaceView, [model.home, presenceOf(model, "Home"), h]),
    lazyNewPlace(newPlaceView, [
      model.newMusic,
      presenceOf(model, "New"),
      model.tracks,
      playingTrackId,
      playingStatus,
      h,
    ]),
    lazySearchPlace(searchPlaceView, [
      model.route,
      model.search,
      model.tracks,
      playingTrackId,
      playingStatus,
      h,
    ]),
    lazyPassingPlace(passingPlaceView, [
      model.route,
      model.tracks,
      model.trail,
      playingTrackId,
      playingStatus,
      h,
    ]),
  ];
};

/**
 * The shell's way from the island to the page of the track it holds: a link
 * like a row's, around the island's words for the track. While that page
 * loads the link is busy and shows it, since no row may be on screen to do so.
 */
const trackPageLinkView =
  (model: Model, h: HtmlBuilder<Message>) =>
  (track: TrackSummary, content: ReadonlyArray<Html>): Html => {
    const isOpening = AsyncData.isLoading(trackData(model, track.id));

    return h.a(
      [
        h.Href(trackRouter({ trackId: track.id })),
        h.AriaLabel(`Open the page of ${track.title} by ${track.artist.name}`),
        h.AriaBusy(isOpening),
        h.Class(
          "flex h-12 min-w-0 flex-1 touch-manipulation items-center gap-2 rounded-lg px-1 hover:bg-tile focus-visible:outline-2 focus-visible:outline-accent active:bg-tile",
        ),
      ],
      [
        ...content,
        isOpening
          ? spinnerIcon("size-4 shrink-0 animate-spin text-muted motion-reduce:animate-pulse")
          : h.empty,
      ],
    );
  };

/** What there is to say of opening the page of the island's track, and whether it is shown or only said. */
const trackPageNotice = (
  data: ReturnType<typeof trackData>,
): Readonly<{ words: string; isShown: boolean }> =>
  AsyncData.match(data, {
    onIdle: () => ({ words: "", isShown: false }),
    onLoading: () => ({ words: "Opening…", isShown: false }),
    onRefreshing: () => ({ words: "", isShown: false }),
    onStale: () => ({ words: "", isShown: false }),
    onSuccess: () => ({ words: "", isShown: false }),
    onFailure: (error) => ({
      words: `This song's page could not be opened. ${reason(error)}`,
      isShown: true,
    }),
  });

/**
 * Where the island says what became of opening that page: that it is
 * opening, to assistive technology, which does not see the link's spinner;
 * that it failed, to everyone. A row says it too when one is on screen; from
 * any other page this is the only place. The place is always there, so that
 * what is said in it is heard as a change.
 */
const trackPageNoticeView =
  (model: Model, h: HtmlBuilder<Message>) =>
  (track: TrackSummary): Html => {
    const notice = trackPageNotice(trackData(model, track.id));

    return h.p(
      [
        h.Role("status"),
        h.DataAttribute("track-page-notice", ""),
        h.Class(notice.isShown ? "pb-2 text-sm text-muted" : "sr-only"),
      ],
      [notice.words],
    );
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
 * ones. The player's island floats over the foot of the box the pages are
 * in: above the navigation where that is a bar, at the foot of the window
 * where it is beside. Once there is one, the shell says so in `data-player`,
 * which every page reads to leave room for it. The page drawn is `model.route`; what the app is heading for only
 * says what is loading: which navigation item is busy, and the status line.
 */
export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: documentTitle(model),
  body: h.div(
    [
      ...(Player.hasSession(model.player) ? [h.DataAttribute("player", "")] : []),
      h.Class(
        "group/shell flex h-dvh flex-col-reverse bg-canvas font-sans text-ink antialiased md:flex-row",
      ),
    ],
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
      h.div(
        [h.Class("relative min-h-0 min-w-0 flex-1")],
        [
          h.main([h.Class("absolute inset-0")], pagesView(model, h)),
          h.submodel({
            slotId: Player.PLAYER_ID,
            model: model.player,
            view: Player.view,
            viewInputs: {
              toTrackPageLink: trackPageLinkView(model, h),
              toTrackPageNotice: trackPageNoticeView(model, h),
            },
            toParentMessage: (message) => Message.GotPlayerMessage({ message }),
          }),
        ],
      ),
      h.p([h.Role("status"), h.Class("sr-only")], [pageStatus(model)]),
    ],
  ),
});
