import type { AlbumId } from "@bafle/domain/Catalog/Album";
import type { ArtistId } from "@bafle/domain/Catalog/Artist";
import type { GenreId } from "@bafle/domain/Catalog/Genre";
import type { PlaylistId } from "@bafle/domain/Catalog/Playlist";
import type { StationId } from "@bafle/domain/Catalog/Station";
import type { TrackId, TrackSummary } from "@bafle/domain/Catalog/Track";
import { Button, Nav } from "@foldkit/ui";
import { clsx } from "clsx";
import * as Array from "effect/Array";
import { pipe } from "effect/Function";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import {
  childAttributes,
  createLazy,
  type Document,
  type Html,
  type HtmlBuilder,
} from "foldkit/html";
import { Message, type PlayOrigin } from "./message.ts";
import { HoldDockMotion } from "./mount.ts";
import {
  albumData,
  albumDataIn,
  artistData,
  artistDataIn,
  Awaiting,
  canShow,
  genreData,
  genreDataIn,
  hasWayBackFromAlbum,
  hasWayBackFromArtist,
  hasWayBackFromGenre,
  hasWayBackFromPlaylist,
  hasWayBackFromStation,
  isPlayerExpanded,
  isPlayersTrack,
  maybeAlbumIdInDocument,
  maybeArtistIdInDocument,
  maybeGenreIdInDocument,
  maybeHeadedFor,
  maybePlaylistIdInDocument,
  maybeStaleError,
  maybeStationIdInDocument,
  type Model,
  playlistData,
  playlistDataIn,
  stationData,
  stationDataIn,
  trackData,
  trackDataIn,
  wayBackOn,
} from "./model.ts";
import * as Player from "./player/index.ts";
import * as Sheet from "./sheet/index.ts";
import { rowMenuIn } from "./rowMenu.ts";
import * as Album from "./page/album.ts";
import * as Artist from "./page/artist.ts";
import * as Genre from "./page/genre.ts";
import * as Genres from "./page/genres.ts";
import * as Home from "./page/home.ts";
import * as NewMusic from "./page/newMusic.ts";
import * as NotFound from "./page/notFound.ts";
import * as Playlist from "./page/playlist.ts";
import * as Radio from "./page/radio.ts";
import * as Search from "./page/search.ts";
import * as Station from "./page/station.ts";
import * as Track from "./page/track.ts";
import {
  AppRoute,
  genresRouter,
  homeRouter,
  newRouter,
  radioRouter,
  searchedTerm,
  searchRouter,
  trackRouter,
} from "./route.ts";
import { artworkFlightRules, routeArtwork } from "./view/artwork.ts";
import { staleBannerView } from "./view/feedback.ts";
import {
  genresIcon,
  homeIcon,
  newIcon,
  radioIcon,
  searchIcon,
} from "./view/icon.ts";
import {
  NAVIGATION_ID,
  PAGE_IDS,
  pagePlaceView,
  pageTitleIdOf,
  type Presence,
} from "./view/layout.ts";
import type { IsAlbumOpening, TilesOpening } from "./view/shelf.ts";
import type { TrackListContext } from "./view/trackList.ts";

// VIEW

const APP_NAME = "Bafle";

/** The pages the navigation leads to: the sections of the app, each kept once it has loaded. */
type Destination = Exclude<
  AppRoute["_tag"],
  "Track" | "Album" | "Artist" | "Playlist" | "Genre" | "Station" | "NotFound"
>;

// NOTE: the order is the menu's, and the style sheet counts on it: Search is
// last, apart from the menu, and each item of the menu is told by its place
// to find its way into the circle (`dock-current` in styles.css).
const DESTINATIONS: ReadonlyArray<Destination> = ["Home", "New", "Genres", "Radio", "Search"];

const DESTINATION_HREFS: Readonly<Record<Destination, string>> = {
  Home: homeRouter(),
  New: newRouter(),
  Genres: genresRouter(),
  Radio: radioRouter(),
  Search: searchRouter({ maybeTerm: Option.none() }),
};

const DESTINATION_ICONS: Readonly<Record<Destination, (className: string) => Html>> = {
  Home: homeIcon,
  New: newIcon,
  Genres: genresIcon,
  Radio: radioIcon,
  Search: searchIcon,
};

const DESTINATION_NAMES: Readonly<Record<Destination, string>> = {
  Home: "Home",
  New: "New",
  Genres: "Genres",
  Radio: "Radio",
  Search: "Search",
};

const pageName = (model: Model, route: AppRoute): string =>
  AppRoute.match(route, {
    Home: () => DESTINATION_NAMES.Home,
    New: () => DESTINATION_NAMES.New,
    Genres: () => DESTINATION_NAMES.Genres,
    Radio: () => DESTINATION_NAMES.Radio,
    Search: () => DESTINATION_NAMES.Search,
    Track: ({ trackId }) =>
      isPlayersTrack(model, route)
        ? Option.match(model.player.maybeSession, {
            onNone: () => Track.titleOf(trackData(model, trackId)),
            onSome: (session) => session.current.title,
          })
        : Track.titleOf(trackData(model, trackId)),
    Album: ({ albumId }) => Album.titleOf(albumData(model, albumId)),
    Artist: ({ artistId }) => Artist.titleOf(artistData(model, artistId)),
    Playlist: ({ playlistId }) => Playlist.titleOf(playlistData(model, playlistId)),
    Genre: ({ genreId }) => Genre.titleOf(genreData(model, genreId)),
    Station: ({ stationId }) => Station.titleOf(stationData(model, stationId)),
    NotFound: () => NotFound.TITLE,
  });

/**
 * The app is heading for this destination and its page is not on screen yet.
 * A track is no destination of the navigation, and neither is an album, an
 * artist, a playlist, a genre or a station: the row it was opened from says
 * that it is loading, or the tile.
 */
const isLoadingDestination = (model: Model, destination: Destination): boolean =>
  model.route._tag !== destination &&
  Option.exists(maybeHeadedFor(model), (route) => route._tag === destination);

const maybeDestinationOf = (route: AppRoute): Option.Option<Destination> =>
  Array.findFirst(DESTINATIONS, (destination) => destination === route._tag);

/**
 * The destination the navigation marks: the one the listener chose, from the
 * moment they choose it, and otherwise the one on screen. The mark answers
 * the press and does not wait for the page: a mark that moved only once the
 * page had come would read as the app being slow to hear. Which page is on
 * screen is still said by `aria-current`, which moves when the page does. A
 * page that is no destination of the navigation, an album chosen from a
 * tile, leaves the mark where it is.
 */
const maybeMarkedDestination = (model: Model): Option.Option<Destination> =>
  Option.orElse(Option.flatMap(maybeHeadedFor(model), maybeDestinationOf), () =>
    maybeDestinationOf(model.route),
  );

/**
 * The sections of the menu. Search is a section too, and stands apart from
 * them on a narrow screen: a control of its own at the far end, there
 * whether the menu is whole or drawn back.
 */
type MenuSection = Exclude<Destination, "Search">;

const maybeMenuSection = (route: AppRoute): Option.Option<MenuSection> =>
  route._tag === "Home" ||
  route._tag === "New" ||
  route._tag === "Genres" ||
  route._tag === "Radio"
    ? Option.some(route._tag)
    : Option.none();

/**
 * What the circle shows when the menu has drawn back to it: the section on
 * screen. On a page that is none of the menu's, Search, a track, an album,
 * an artist, a playlist, a genre or a station, it shows the nearest one
 * behind the page, and Home when there is none.
 */
const circleSection = (model: Model): MenuSection =>
  Option.getOrElse(maybeMenuSection(model.route), () =>
    Option.getOrElse(Array.findLast(model.trail, maybeMenuSection), () => "Home" as const),
  );

/** A surface that floats over the page: the page is seen through it, blurred. */
const FLOATING_CLASS = "border border-line bg-panel/85 shadow-lg backdrop-blur-xl";

const ITEM_FOCUS_CLASS =
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";

/** Beside the page, on a wide screen, every item is a row of the same kind. */
const WIDE_LINK_CLASS =
  "md:h-auto md:w-auto md:flex-row md:justify-start md:gap-3 md:rounded-lg md:border-0 md:bg-transparent md:px-3 md:py-2 md:text-muted md:shadow-none md:backdrop-blur-none md:hover:text-ink md:data-marked:bg-accent-wash md:data-marked:text-accent";

const MENU_ITEM_CLASS =
  "dock-item min-w-0 grow basis-0 p-1 md:grow-0 md:basis-auto md:p-0";

const CIRCLE_ITEM_CLASS = "dock-current";
const LEAVING_ITEM_CLASS = "minimized:invisible minimized:opacity-0";

const MENU_LINK_CLASS = clsx(
  "pointer-events-auto flex h-full touch-manipulation flex-col items-center justify-center rounded-full text-muted transition-colors duration-200 hover:text-ink data-marked:text-accent minimized:pointer-events-none minimized:text-ink minimized:data-marked:text-accent",
  ITEM_FOCUS_CLASS,
  WIDE_LINK_CLASS,
);

// NOTE: drawn back, the item in the circle is a picture of where the listener
// is and no longer a way there: the control that brings the menu out lies
// over it and is the one thing in the circle to press or to focus. A link
// that only ignored the pointer would still be reached with the keyboard,
// and Enter on it would open its section again, from the top. So the link
// stops being there (`invisible` takes it out of the order of focus and out
// of what is said aloud) and its icon alone is still drawn.
const CIRCLE_LINK_CLASS = "minimized:invisible";
const CIRCLE_ICON_CLASS = "minimized:visible";

/** An item's name under its icon. Drawn back, the circle has room for the icon alone. */
const MENU_NAME_CLASS =
  "dock-name text-[0.625rem] leading-4 font-medium minimized:opacity-0 md:text-sm md:leading-normal";

/**
 * Search keeps its place at the far end, and is a little smaller while the
 * menu is drawn back: the row is then the island's, with a circle at each end.
 */
// NOTE: the margin before Search takes whatever of the row the menu does not:
// nothing while the menu is whole, and the island's room once it has drawn
// back. Search itself never moves.
const SEARCH_ITEM_CLASS =
  "ml-auto flex h-14 w-16 shrink-0 items-center justify-center pl-2 md:ml-0 md:block md:h-auto md:w-auto md:pl-0";

const SEARCH_LINK_CLASS = clsx(
  "dock-search pointer-events-auto flex size-14 touch-manipulation items-center justify-center rounded-full text-ink data-marked:text-accent",
  FLOATING_CLASS,
  ITEM_FOCUS_CLASS,
  WIDE_LINK_CLASS,
);

const destinationView = (
  item: Nav.ItemInfo<Destination>,
  isLoading: boolean,
  isMarked: boolean,
  isShownInCircle: boolean,
  h: HtmlBuilder<Message>,
): Html => {
  const isSearch = item.value === "Search";
  const iconClass = { [CIRCLE_ICON_CLASS]: isShownInCircle && !isSearch };

  return h.keyed("li")(
    item.value,
    [
      h.Class(
        isSearch
          ? SEARCH_ITEM_CLASS
          : clsx(MENU_ITEM_CLASS, isShownInCircle ? CIRCLE_ITEM_CLASS : LEAVING_ITEM_CLASS),
      ),
    ],
    [
      h.a(
        [
          ...item.link,
          h.AriaBusy(isLoading),
          ...(isMarked ? [h.DataAttribute("marked", "")] : []),
          h.Class(
            isSearch
              ? SEARCH_LINK_CLASS
              : clsx(MENU_LINK_CLASS, { [CIRCLE_LINK_CLASS]: isShownInCircle }),
          ),
        ],
        [
          // While its page is on its way the icon itself breathes: it is the
          // thing that was pressed, and it stays what it is (`nav-breathes`).
          DESTINATION_ICONS[item.value](
            clsx("size-6 md:size-5", iconClass, {
              "nav-breathes motion-reduce:animate-pulse": isLoading,
            }),
          ),
          // NOTE: at the foot of a narrow screen Search is its icon alone: its name is still said.
          h.span(
            [h.Class(isSearch ? "max-md:sr-only md:text-sm md:font-medium" : MENU_NAME_CLASS)],
            [DESTINATION_NAMES[item.value]],
          ),
        ],
      ),
    ],
  );
};

/** The section of the menu that is marked, when what is marked is one of the menu's. */
const maybeMarkedMenuSection = (model: Model): Option.Option<MenuSection> =>
  Option.filter(
    maybeMarkedDestination(model),
    (destination): destination is MenuSection => destination !== "Search",
  );

/** Where each of the menu's sections stands in it, from its near end. */
const MENU_PLACES: Readonly<Record<MenuSection, number>> = { Home: 0, New: 1, Genres: 2, Radio: 3 };

/**
 * The menu's own surface on a narrow screen: one piece behind its items,
 * which draws back to a circle around the item that stays. The circle is a
 * little smaller than the menu is tall, and stands where the menu's near
 * end was, so nothing is seen to jump.
 *
 * Over the surface, under the items, is the navigation's mark. It is one
 * piece for the whole menu and not each item's own ground, so that it
 * travels from the item the listener left to the one they chose, and it
 * sets off as they choose (`maybeMarkedDestination`; `dock-mark` in
 * styles.css). When what is marked is none of the menu's, it is not shown,
 * and waits where the circle's section is.
 */
const menuSurfaceView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.AriaHidden(true), h.Class("pointer-events-none md:hidden")],
    [
      h.div([h.Class(clsx("dock-circle absolute top-1.5 left-1.5 size-11 rounded-full opacity-0 minimized:opacity-100", FLOATING_CLASS))]),
      h.div([h.Class(clsx("dock-surface absolute inset-y-0 right-16 left-0 rounded-full", FLOATING_CLASS))]),
      h.div([
        ...(Option.isSome(maybeMarkedMenuSection(model)) ? [h.DataAttribute("shown", "")] : []),
        h.Style({
          "--dock-place": String(
            MENU_PLACES[Option.getOrElse(maybeMarkedMenuSection(model), () => circleSection(model))],
          ),
        }),
        h.Class("dock-mark"),
      ]),
    ],
  );

/**
 * What a press of the circle does. The circle shows the item for where the
 * listener is and leads nowhere: a press brings the menu out again, where
 * the page stands. This control lies over the circle, and is only there
 * while the menu is drawn back, on a narrow screen.
 */
const showNavigationView = (model: Model, h: HtmlBuilder<Message>): Html =>
  Button.view(
    {
      onClick: Message.ClickedShowNavigation(),
      toView: (attributes) =>
        h.button(
          [
            ...attributes.button,
            h.AriaLabel("Show navigation"),
            h.AriaExpanded(false),
            h.DataAttribute("section", circleSection(model)),
            h.Class(
              "pointer-events-auto absolute top-1.5 left-1.5 hidden size-11 cursor-pointer touch-manipulation rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent minimized:block",
            ),
          ],
          [],
        ),
    },
    h,
  );

/**
 * The current item is the page on screen: while a destination loads, the
 * listener is still where they were, and the item they chose is the one
 * marked busy.
 */
const navigationView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const inCircle = circleSection(model);
  const marked = maybeMarkedDestination(model);

  return Nav.view<Destination>({
    items: DESTINATIONS,
    ariaLabel: "Main",
    toHref: (destination) => DESTINATION_HREFS[destination],
    isItemCurrent: (destination) => model.route._tag === destination,
    toView: ({ nav, items }) =>
      h.nav(
        [...nav, h.Id(NAVIGATION_ID), h.Class("relative max-md:h-14")],
        [
          menuSurfaceView(model, h),
          h.ul(
            [
              h.Role("list"),
              h.Class("relative flex h-full md:flex-col md:gap-1"),
            ],
            Array.map(items, (item) =>
              destinationView(
                item,
                isLoadingDestination(model, item.value),
                Option.contains(marked, item.value),
                item.value === inCircle,
                h,
              ),
            ),
          ),
          showNavigationView(model, h),
        ],
      ),
  });
};

/**
 * Whether the expanded player's sheet is short of whole: on its way off the
 * screen under the listener's finger, or already off it. What is behind the
 * sheet is drawn only then. With the sheet whole nothing of it could be seen,
 * and it stays as it is behind any other page: hidden, and out of reach.
 */
const isSheetAway = (model: Model): boolean =>
  isPlayerExpanded(model) && model.playerSheet.reach !== "Whole";

/**
 * How the page of one kind stands: on screen, kept, or uncovered by the
 * player's sheet as it goes. The page a sheet uncovers is the one the player
 * was opened over, which is where closing it leads.
 */
const presenceOf = (model: Model, kind: AppRoute["_tag"]): Presence => {
  if (model.route._tag === kind) {
    return "OnScreen";
  }
  return isSheetAway(model) && Option.exists(wayBackOn(model.trail), (behind) => behind._tag === kind)
    ? "Uncovered"
    : "Kept";
};

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

/**
 * What the pages read of the Model to draw their rows and their tiles: the
 * parts a kept drawing is checked against, each as the Model holds it.
 */
type Listed = Readonly<{
  tracks: Model["tracks"];
  albums: Model["albums"];
  albumRows: Model["albumRows"];
  rowMenus: Model["rowMenus"];
  rowDone: Model["rowDone"];
}>;

/** What a list reads of the Model. */
const listContext = (
  presence: Presence,
  from: PlayOrigin,
  { tracks, albums, albumRows, rowMenus, rowDone }: Listed,
  playingTrackId: TrackId | undefined,
  playingStatus: Player.TrackStatus,
): TrackListContext => ({
  presence,
  from,
  trackDataOf: (trackId) => trackDataIn(tracks, trackId),
  albumDataOf: (albumId) => albumDataIn(albums, albumId),
  isAlbumAskedFrom: (track) =>
    Option.exists(
      HashMap.get(albumRows, track.album.id),
      (row) => row.from === from && row.trackId === track.id,
    ),
  statusOf: (trackId) => Player.statusFor(playingTrackId, playingStatus, trackId),
  isPlayerHolding: playingTrackId !== undefined,
  menuOf: (trackId) => rowMenuIn(rowMenus, { from, trackId }),
  queuedOf: (trackId) =>
    pipe(
      rowDone.maybeRow,
      Option.filter((row) => row.from === from && row.trackId === trackId),
      Option.map((row) => row.place),
    ),
});

/**
 * Whether an album chosen from a shelf is on its way: the catalog is being
 * asked for it for the first time, and no row asked. An album asked from a
 * row's menu is that row's to speak for.
 */
const isAlbumOpeningIn =
  (albums: Model["albums"], albumRows: Model["albumRows"]): IsAlbumOpening =>
  (albumId) =>
    AsyncData.isLoading(albumDataIn(albums, albumId)) && !HashMap.has(albumRows, albumId);

/**
 * Whether each kind of thing chosen from a shelf is on its way. An artist
 * and a playlist are only ever chosen from one, so each is opening whenever
 * the catalog is being asked for it for the first time.
 */
const tilesOpeningIn = (
  albums: Model["albums"],
  albumRows: Model["albumRows"],
  artists: Model["artists"],
  playlists: Model["playlists"],
): TilesOpening => ({
  isAlbumOpening: isAlbumOpeningIn(albums, albumRows),
  isArtistOpening: (artistId) => AsyncData.isLoading(artistDataIn(artists, artistId)),
  isPlaylistOpening: (playlistId) => AsyncData.isLoading(playlistDataIn(playlists, playlistId)),
});

/**
 * The Genres section's place. Its tiles are the only way to a genre, so one
 * is opening whenever the catalog is being asked for it for the first time.
 */
const genresPlaceView = (
  genreList: Model["genreList"],
  presence: Presence,
  genres: Model["genres"],
  h: HtmlBuilder<Message>,
): Html =>
  pagePlaceView(
    presence,
    isInDocument(presence, genreList)
      ? [
          Genres.view(
            genreList,
            presence,
            (genreId) => AsyncData.isLoading(genreDataIn(genres, genreId)),
            h,
          ),
        ]
      : [],
    h,
  );

/** The Radio section's place. Its tiles are the only way to a station, as the Genres section's are to a genre. */
const radioPlaceView = (
  stationList: Model["stationList"],
  presence: Presence,
  stations: Model["stations"],
  h: HtmlBuilder<Message>,
): Html =>
  pagePlaceView(
    presence,
    isInDocument(presence, stationList)
      ? [
          Radio.view(
            stationList,
            presence,
            (stationId) => AsyncData.isLoading(stationDataIn(stations, stationId)),
            h,
          ),
        ]
      : [],
    h,
  );

const homePlaceView = (
  home: Model["home"],
  presence: Presence,
  albums: Model["albums"],
  albumRows: Model["albumRows"],
  artists: Model["artists"],
  playlists: Model["playlists"],
  h: HtmlBuilder<Message>,
): Html =>
  pagePlaceView(
    presence,
    isInDocument(presence, home)
      ? [Home.view(home, presence, tilesOpeningIn(albums, albumRows, artists, playlists), h)]
      : [],
    h,
  );

const newPlaceView = (
  newMusic: Model["newMusic"],
  presence: Presence,
  tracks: Model["tracks"],
  albums: Model["albums"],
  albumRows: Model["albumRows"],
  playingTrackId: TrackId | undefined,
  playingStatus: Player.TrackStatus,
  rowMenus: Model["rowMenus"],
  rowDone: Model["rowDone"],
  h: HtmlBuilder<Message>,
): Html =>
  pagePlaceView(
    presence,
    isInDocument(presence, newMusic)
      ? [
          NewMusic.view(
            newMusic,
            listContext(
              presence,
              "New",
              { tracks, albums, albumRows, rowMenus, rowDone },
              playingTrackId,
              playingStatus,
            ),
            isAlbumOpeningIn(albums, albumRows),
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
  presence: Presence,
  search: Model["search"],
  tracks: Model["tracks"],
  albums: Model["albums"],
  albumRows: Model["albumRows"],
  artists: Model["artists"],
  playlists: Model["playlists"],
  playingTrackId: TrackId | undefined,
  playingStatus: Player.TrackStatus,
  rowMenus: Model["rowMenus"],
  rowDone: Model["rowDone"],
  h: HtmlBuilder<Message>,
): Html => {
  const context = listContext(
    presence,
    "Search",
    { tracks, albums, albumRows, rowMenus, rowDone },
    playingTrackId,
    playingStatus,
  );
  const opening = tilesOpeningIn(albums, albumRows, artists, playlists);

  return pagePlaceView(
    presence,
    AppRoute.matchOrElse(
      route,
      {
        Search: (shown) => [
          Search.view(shown.maybeTerm, searchedTerm(shown), search, context, opening, h),
        ],
      },
      () =>
        Option.match(AsyncData.getData(search), {
          onNone: () => [],
          onSome: ({ term }) => [
            Search.view(Option.some(term), Option.some(term), search, context, opening, h),
          ],
        }),
    ),
    h,
  );
};

/**
 * The album's place. Its page is a list, so it is in the document while it
 * is on screen and, once it holds data, while the listener is on a page
 * reached from it: hidden behind that page, to be found as it was left.
 */
const albumPlaceView = (
  albumId: AlbumId | undefined,
  presence: Presence,
  hasWayBack: boolean,
  tracks: Model["tracks"],
  albums: Model["albums"],
  albumRows: Model["albumRows"],
  playingTrackId: TrackId | undefined,
  playingStatus: Player.TrackStatus,
  rowMenus: Model["rowMenus"],
  rowDone: Model["rowDone"],
  h: HtmlBuilder<Message>,
): Html => {
  if (albumId === undefined) {
    return pagePlaceView("Kept", [], h);
  }
  const album = albumDataIn(albums, albumId);

  return pagePlaceView(
    presence,
    isInDocument(presence, album)
      ? [
          Album.view(
            albumId,
            album,
            hasWayBack,
            listContext(
              presence,
              "Album",
              { tracks, albums, albumRows, rowMenus, rowDone },
              playingTrackId,
              playingStatus,
            ),
            h,
          ),
        ]
      : [],
    h,
  );
};

/**
 * The artist's place. Their page is a list and a shelf, so it is kept as an
 * album's is: in the document while it is on screen and, once it holds data,
 * while the listener is on a page reached from it.
 */
const artistPlaceView = (
  artistId: ArtistId | undefined,
  presence: Presence,
  hasWayBack: boolean,
  artists: Model["artists"],
  tracks: Model["tracks"],
  albums: Model["albums"],
  albumRows: Model["albumRows"],
  playingTrackId: TrackId | undefined,
  playingStatus: Player.TrackStatus,
  rowMenus: Model["rowMenus"],
  rowDone: Model["rowDone"],
  h: HtmlBuilder<Message>,
): Html => {
  if (artistId === undefined) {
    return pagePlaceView("Kept", [], h);
  }
  const artist = artistDataIn(artists, artistId);

  return pagePlaceView(
    presence,
    isInDocument(presence, artist)
      ? [
          Artist.view(
            artistId,
            artist,
            hasWayBack,
            listContext(
              presence,
              "Artist",
              { tracks, albums, albumRows, rowMenus, rowDone },
              playingTrackId,
              playingStatus,
            ),
            isAlbumOpeningIn(albums, albumRows),
            h,
          ),
        ]
      : [],
    h,
  );
};

/** The playlist's place. Its page is a list, so it is kept as an album's is. */
const playlistPlaceView = (
  playlistId: PlaylistId | undefined,
  presence: Presence,
  hasWayBack: boolean,
  playlists: Model["playlists"],
  tracks: Model["tracks"],
  albums: Model["albums"],
  albumRows: Model["albumRows"],
  playingTrackId: TrackId | undefined,
  playingStatus: Player.TrackStatus,
  rowMenus: Model["rowMenus"],
  rowDone: Model["rowDone"],
  h: HtmlBuilder<Message>,
): Html => {
  if (playlistId === undefined) {
    return pagePlaceView("Kept", [], h);
  }
  const playlist = playlistDataIn(playlists, playlistId);

  return pagePlaceView(
    presence,
    isInDocument(presence, playlist)
      ? [
          Playlist.view(
            playlistId,
            playlist,
            hasWayBack,
            listContext(
              presence,
              "Playlist",
              { tracks, albums, albumRows, rowMenus, rowDone },
              playingTrackId,
              playingStatus,
            ),
            h,
          ),
        ]
      : [],
    h,
  );
};

/**
 * The genre's place. Its page is a list and shelves of every kind, so it is
 * kept as an album's is: in the document while it is on screen and, once it
 * holds data, while the listener is on a page reached from it.
 */
const genrePlaceView = (
  genreId: GenreId | undefined,
  presence: Presence,
  hasWayBack: boolean,
  genres: Model["genres"],
  tracks: Model["tracks"],
  albums: Model["albums"],
  albumRows: Model["albumRows"],
  artists: Model["artists"],
  playlists: Model["playlists"],
  playingTrackId: TrackId | undefined,
  playingStatus: Player.TrackStatus,
  rowMenus: Model["rowMenus"],
  rowDone: Model["rowDone"],
  h: HtmlBuilder<Message>,
): Html => {
  if (genreId === undefined) {
    return pagePlaceView("Kept", [], h);
  }
  const genre = genreDataIn(genres, genreId);

  return pagePlaceView(
    presence,
    isInDocument(presence, genre)
      ? [
          Genre.view(
            genreId,
            genre,
            hasWayBack,
            listContext(
              presence,
              "Genre",
              { tracks, albums, albumRows, rowMenus, rowDone },
              playingTrackId,
              playingStatus,
            ),
            tilesOpeningIn(albums, albumRows, artists, playlists),
            h,
          ),
        ]
      : [],
    h,
  );
};

/** The station's place. Its page is a list, so it is kept as an album's is. */
const stationPlaceView = (
  stationId: StationId | undefined,
  presence: Presence,
  hasWayBack: boolean,
  stations: Model["stations"],
  tracks: Model["tracks"],
  albums: Model["albums"],
  albumRows: Model["albumRows"],
  playingTrackId: TrackId | undefined,
  playingStatus: Player.TrackStatus,
  rowMenus: Model["rowMenus"],
  rowDone: Model["rowDone"],
  h: HtmlBuilder<Message>,
): Html => {
  if (stationId === undefined) {
    return pagePlaceView("Kept", [], h);
  }
  const station = stationDataIn(stations, stationId);

  return pagePlaceView(
    presence,
    isInDocument(presence, station)
      ? [
          Station.view(
            stationId,
            station,
            hasWayBack,
            listContext(
              presence,
              "Station",
              { tracks, albums, albumRows, rowMenus, rowDone },
              playingTrackId,
              playingStatus,
            ),
            h,
          ),
        ]
      : [],
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
  rowDone: Model["rowDone"],
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
              {
                // A queue is what comes after a track: there is one once something plays.
                isOffered: playingTrackId !== undefined,
                maybeQueued: pipe(
                  rowDone.maybeRow,
                  Option.filter((row) => row.from === "Track" && row.trackId === trackId),
                  Option.map((row) => row.place),
                ),
              },
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
const lazyAlbumPlace = createLazy();
const lazyArtistPlace = createLazy();
const lazyPlaylistPlace = createLazy();
const lazyGenresPlace = createLazy();
const lazyRadioPlace = createLazy();
const lazyGenrePlace = createLazy();
const lazyStationPlace = createLazy();
const lazyPassingPlace = createLazy();

/**
 * Every page has its place, always in the same order, and the sections stay
 * in theirs once loaded, as an album, an artist, a playlist, a genre and a
 * station do while a page reached from them is on screen. Going from one to
 * another, or back from a track, changes which place is drawn and rebuilds
 * nothing.
 */
const pagesView = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> => {
  const playingTrackId = Option.getOrUndefined(Player.maybeCurrentTrackId(model.player));
  const playingStatus = Player.currentTrackStatus(model.player);

  return [
    lazyHomePlace(homePlaceView, [
      model.home,
      presenceOf(model, "Home"),
      model.albums,
      model.albumRows,
      model.artists,
      model.playlists,
      h,
    ]),
    lazyNewPlace(newPlaceView, [
      model.newMusic,
      presenceOf(model, "New"),
      model.tracks,
      model.albums,
      model.albumRows,
      playingTrackId,
      playingStatus,
      model.rowMenus,
      model.rowDone,
      h,
    ]),
    lazySearchPlace(searchPlaceView, [
      model.route,
      presenceOf(model, "Search"),
      model.search,
      model.tracks,
      model.albums,
      model.albumRows,
      model.artists,
      model.playlists,
      playingTrackId,
      playingStatus,
      model.rowMenus,
      model.rowDone,
      h,
    ]),
    // NOTE: an `Option` made on each draw would be a new object, so the
    // album in the document is passed as its id, or as nothing.
    lazyAlbumPlace(albumPlaceView, [
      Option.getOrUndefined(maybeAlbumIdInDocument(model.route, model.trail)),
      presenceOf(model, "Album"),
      hasWayBackFromAlbum(model.route, model.trail),
      model.tracks,
      model.albums,
      model.albumRows,
      playingTrackId,
      playingStatus,
      model.rowMenus,
      model.rowDone,
      h,
    ]),
    lazyArtistPlace(artistPlaceView, [
      Option.getOrUndefined(maybeArtistIdInDocument(model.route, model.trail)),
      presenceOf(model, "Artist"),
      hasWayBackFromArtist(model.route, model.trail),
      model.artists,
      model.tracks,
      model.albums,
      model.albumRows,
      playingTrackId,
      playingStatus,
      model.rowMenus,
      model.rowDone,
      h,
    ]),
    lazyPlaylistPlace(playlistPlaceView, [
      Option.getOrUndefined(maybePlaylistIdInDocument(model.route, model.trail)),
      presenceOf(model, "Playlist"),
      hasWayBackFromPlaylist(model.route, model.trail),
      model.playlists,
      model.tracks,
      model.albums,
      model.albumRows,
      playingTrackId,
      playingStatus,
      model.rowMenus,
      model.rowDone,
      h,
    ]),
    lazyGenresPlace(genresPlaceView, [
      model.genreList,
      presenceOf(model, "Genres"),
      model.genres,
      h,
    ]),
    lazyRadioPlace(radioPlaceView, [
      model.stationList,
      presenceOf(model, "Radio"),
      model.stations,
      h,
    ]),
    lazyGenrePlace(genrePlaceView, [
      Option.getOrUndefined(maybeGenreIdInDocument(model.route, model.trail)),
      presenceOf(model, "Genre"),
      hasWayBackFromGenre(model.route, model.trail),
      model.genres,
      model.tracks,
      model.albums,
      model.albumRows,
      model.artists,
      model.playlists,
      playingTrackId,
      playingStatus,
      model.rowMenus,
      model.rowDone,
      h,
    ]),
    lazyStationPlace(stationPlaceView, [
      Option.getOrUndefined(maybeStationIdInDocument(model.route, model.trail)),
      presenceOf(model, "Station"),
      hasWayBackFromStation(model.route, model.trail),
      model.stations,
      model.tracks,
      model.albums,
      model.albumRows,
      playingTrackId,
      playingStatus,
      model.rowMenus,
      model.rowDone,
      h,
    ]),
    // NOTE: the expanded player is drawn from the player itself, which
    // changes every second: it is the one place that is never a kept drawing.
    isPlayerExpanded(model)
      ? expandedPlaceView(model, h)
      : lazyPassingPlace(passingPlaceView, [
          model.route,
          model.tracks,
          model.trail,
          playingTrackId,
          playingStatus,
          model.rowDone,
          h,
        ]),
  ];
};

/**
 * The shell's way from the island to the expanded player: a link to the page
 * of the track the island holds, around the island's words for it. Nothing
 * here waits or says that it is opening: that page is the player itself, and
 * takes the screen as the link is pressed.
 */
const trackPageLinkView =
  (h: HtmlBuilder<Message>) =>
  (track: TrackSummary, content: ReadonlyArray<Html>): Html =>
    h.a(
      [
        h.Href(trackRouter({ trackId: track.id })),
        h.AriaLabel(`Open the player: ${track.title} by ${track.artist.name}`),
        h.Class(
          "flex h-full min-w-0 flex-1 touch-manipulation items-center gap-2.5 rounded-full pr-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-island-light",
        ),
      ],
      content,
    );

/**
 * The player's place among the pages when it is expanded: the page of the
 * track it holds. The box is that page's, with its id, its name and its
 * scrolling, so the focus and the title find it as they find any page; what
 * is in it is the player's own view, lent the way back and what the catalog
 * knows of the track. It is not keyed by the track: another track becoming
 * the current one is the same sheet with other words.
 */
// NOTE: the sheet is the shell's and what is on it is the player's, so the
// two meet here: the sheet draws the box that scrolls and asks for the piece
// that travels, and the player draws that piece with what the sheet hands it.
// The page's id, its name and its focus go on the one piece in the sheet that
// scrolls, since arrow keys and Space scroll whatever holds the focus.
const expandedPlaceView = (model: Model, h: HtmlBuilder<Message>): Html =>
  pagePlaceView(
    "OnScreen",
    [
      h.submodel({
        slotId: model.playerSheet.id,
        model: model.playerSheet,
        view: Sheet.view,
        viewInputs: {
          continuesPastEdge: true,
          // Over the navigation and the island, which float over the pages.
          overlayAttributes: childAttributes([h.Class("z-40")]),
          backdropClassName: "bg-canvas",
          backdropFollows: { keyframes: "sheet-backdrop" },
          stageClassName: "pt-3 md:pt-6",
          toView: (sheet) =>
            h.submodel({
              slotId: "player-expanded",
              model: model.player,
              view: Player.expandedView,
              viewInputs: {
                titleId: pageTitleIdOf(PAGE_IDS.Track),
                toCollapseControl: () => Track.collapseControlView(wayBackOn(model.trail), h),
                toDetail: (track) => Track.expandedDetailView(trackData(model, track.id), h),
                isAlbumOpening: Option.exists(
                  maybeHeadedFor(model),
                  (route) =>
                    route._tag === "Album" &&
                    Option.contains(Player.maybeCurrentAlbumId(model.player), route.albumId),
                ),
                sheetAttributes: sheet.sheet,
                contentAttributes: [
                  ...sheet.content,
                  ...childAttributes([
                    h.Id(PAGE_IDS.Track),
                    h.Role("region"),
                    h.AriaLabelledBy(pageTitleIdOf(PAGE_IDS.Track)),
                    h.Tabindex(0),
                  ]),
                ],
                isSheetWhole: sheet.isWhole,
              },
              toParentMessage: (message) => Message.GotPlayerMessage({ message }),
            }),
        },
        toParentMessage: (message) => Message.GotPlayerSheetMessage({ message }),
      }),
    ],
    h,
  );

/**
 * Whether a page chosen from the island's menu is on its way: the page of
 * the album the track the player holds is on, or that track's own. A row can
 * ask for either too, and then the row is the one to say so.
 */
const isIslandsPageOpening = (model: Model): boolean =>
  Option.exists(maybeHeadedFor(model), (route) =>
    AppRoute.matchOrElse(
      route,
      {
        Album: ({ albumId }) =>
          Option.contains(Player.maybeCurrentAlbumId(model.player), albumId) &&
          !HashMap.has(model.albumRows, albumId),
        Track: () => isSaidOnPage(model.awaiting),
      },
      () => false,
    ),
  );

/** Whether what is awaited is a page that takes the screen with whatever there is to say of it. */
const isSaidOnPage = (awaiting: Awaiting): boolean =>
  Awaiting.matchOrElse(awaiting, { Intention: ({ onPage }) => onPage === true }, () => false);

/** A page a row speaks for while it opens: its track's, or the album's when the row asked for it. */
const isRowsToSay = (model: Model, route: AppRoute): boolean =>
  AppRoute.matchOrElse(
    route,
    {
      Track: () => true,
      Album: ({ albumId }) => HashMap.has(model.albumRows, albumId),
    },
    () => false,
  );

/**
 * The page said to be loading. A track opened from a row is not, nor an
 * album asked from one: the row says that it is opening, and how that ended,
 * so the two never speak of the same thing at once.
 */
const maybeAnnouncedDestination = (model: Model): Option.Option<AppRoute> =>
  Option.filter(
    maybeHeadedFor(model),
    (route) =>
      !(
        Awaiting.guards.Intention(model.awaiting) &&
        !isSaidOnPage(model.awaiting) &&
        isRowsToSay(model, route)
      ),
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
 * The shell: navigation beside the page on wide screens, floating over its
 * foot on narrow ones. There it is a menu and, apart from it, Search; a page
 * scrolled down draws the menu back to a circle, and the island comes down
 * into the row between the two. The shell says how the navigation stands in
 * `data-navigation`, which the island and the menu read. The island floats
 * over the foot of the box the pages are in. Once there is one, the shell
 * says so in `data-player`, which every page reads to leave room for it.
 * Expanded, the player is the screen: on a narrow screen there is no
 * navigation under it, and closing it is the way out. The page drawn is
 * `model.route`; what the app is heading for only says what is loading: which
 * navigation item is busy, and the status line.
 */
export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: documentTitle(model),
  body: h.div(
    [
      // NOTE: a page the sheet uncovers leaves room for the island as it
      // did before the player was opened over it, and will once it is closed.
      ...(Player.hasSession(model.player) && (!isPlayerExpanded(model) || isSheetAway(model))
        ? [h.DataAttribute("player", "")]
        : []),
      // NOTE: read by the mark the page opened with, which stands over the
      // app for as long as this is here (`#splash` in index.html).
      ...(model.launch === "Launching" ? [h.DataAttribute("launching", "")] : []),
      h.DataAttribute("input", model.inputMethod),
      h.DataAttribute("navigation", model.navigation === "Minimized" ? "minimized" : "open"),
      h.OnMount(HoldDockMotion()),
      h.Class(
        "group/shell relative flex h-dvh flex-col bg-canvas font-sans text-ink antialiased md:flex-row",
      ),
    ],
    [
      artworkFlightRules(Option.toArray(routeArtwork(model.route)), h),
      h.header(
        [
          h.Class(
            clsx(
              // NOTE: on a desktop's screen the navigation is narrower, as
              // the design draws it: the page keeps its room when the queue
              // opens beside it.
              "pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-linear-to-t from-canvas/90 to-transparent px-5 pt-8 pb-3.5 md:pointer-events-auto md:static md:w-60 md:shrink-0 md:border-r md:border-line md:bg-panel md:bg-none md:px-3 md:py-6 lg:w-44",
              {
                // Under the player there is no navigation. It is drawn again,
                // out of reach, as the player's sheet uncovers it.
                "max-md:hidden": isPlayerExpanded(model) && !isSheetAway(model),
                "[view-transition-name:navigation]": !isPlayerExpanded(model),
              },
            ),
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
          // NOTE: over the page and no part of it: the page does not move
          // when this comes or is put away. Under the expanded player there
          // is no page to speak of.
          model.staleNotice === "Open" && !isPlayerExpanded(model)
            ? Option.match(maybeStaleError(model), {
                onNone: () => h.empty,
                onSome: (error) => staleBannerView(error, h),
              })
            : h.empty,
          // NOTE: expanded, the player is the page on screen and is drawn in
          // its place among the pages: there is no island under itself. The
          // island is drawn again as the player's sheet uncovers the page it
          // stands on, so that a sheet swiped away leaves the screen as it
          // will be, with nothing to come in after it.
          isPlayerExpanded(model) && !isSheetAway(model)
            ? h.empty
            : h.submodel({
                slotId: Player.PLAYER_ID,
                model: model.player,
                view: Player.view,
                viewInputs: {
                  toTrackPageLink: trackPageLinkView(h),
                  isUnderSheet: isPlayerExpanded(model),
                  screen: model.screen,
                  isPageOpening: model.screen === "Desktop" && isIslandsPageOpening(model),
                },
                toParentMessage: (message) => Message.GotPlayerMessage({ message }),
              }),
        ],
      ),
      // NOTE: on a desktop's screen the queue opens here, in a column of its
      // own past the page. It is the player's, as the island is, and the
      // page beside it is the page on screen: nothing of the route changes.
      model.screen === "Desktop"
        ? h.submodel({
            slotId: Player.QUEUE_COLUMN_ID,
            model: model.player,
            view: Player.queueColumnView,
            toParentMessage: (message) => Message.GotPlayerMessage({ message }),
          })
        : h.empty,
      h.p([h.Role("status"), h.Class("sr-only")], [pageStatus(model)]),
      // NOTE: a song of the queue being carried is drawn here and not in the
      // player's sheet. It is placed by the screen, and the sheet is a box
      // that what is in it is placed by.
      Player.queueGhostView(model.player, model.screen === "Desktop", h),
    ],
  ),
});
