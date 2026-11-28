import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { AlbumId } from "@bafle/domain/Catalog/Album";
import { ArtistId } from "@bafle/domain/Catalog/Artist";
import { Album } from "@bafle/domain/Catalog/FullAlbum";
import { Artist } from "@bafle/domain/Catalog/FullArtist";
import { Genre } from "@bafle/domain/Catalog/FullGenre";
import { Playlist } from "@bafle/domain/Catalog/FullPlaylist";
import { Station } from "@bafle/domain/Catalog/FullStation";
import { GenreId } from "@bafle/domain/Catalog/Genre";
import {
  FeaturedMusic,
  MusicGenres,
  RadioStations,
  SearchResults,
  TrendingMusic,
} from "@bafle/domain/Catalog/MusicCatalog.external";
import { PlaylistId } from "@bafle/domain/Catalog/Playlist";
import { StationId } from "@bafle/domain/Catalog/Station";
import { Track, TrackId } from "@bafle/domain/Catalog/Track";
import { Popover } from "@foldkit/ui";
import * as Array from "effect/Array";
import { pipe } from "effect/Function";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { AsyncData } from "foldkit";
import { defineTaggedUnion } from "foldkit/schema";
import { LoadError } from "./catalog.ts";
import { InputMethod } from "./message.ts";
import * as Rows from "./rows/model.ts";
import { Model as PlayerModel, followsSound, maybeCurrentTrackId } from "./player/model.ts";
import { AppRoute, searchedTerm } from "./route.ts";
import { Screen } from "./screen.ts";
import * as Sheet from "./sheet/index.ts";

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

/** What the Genres section shows: every genre the catalog files music under. */
export const GenreListData = AsyncData.Schema(MusicGenres, LoadError);
export type GenreListData = typeof GenreListData.schema.Type;

/** What the Radio section shows: the catalog's stations, under the genre each belongs to. */
export const StationListData = AsyncData.Schema(RadioStations, LoadError);
export type StationListData = typeof StationListData.schema.Type;

/**
 * What the catalog said about one track. No track is an answer too: the
 * catalog does not have it, and asking again will not change that.
 */
export const TrackData = AsyncData.Schema(Schema.Option(Track), LoadError);
export type TrackData = typeof TrackData.schema.Type;

/** What the catalog said about one album. As with a track, no album is an answer too. */
export const AlbumData = AsyncData.Schema(Schema.Option(Album), LoadError);
export type AlbumData = typeof AlbumData.schema.Type;

/** What the catalog said about one artist. As with a track, no artist is an answer too. */
export const ArtistData = AsyncData.Schema(Schema.Option(Artist), LoadError);
export type ArtistData = typeof ArtistData.schema.Type;

/** What the catalog said about one playlist. As with a track, no playlist is an answer too. */
export const PlaylistData = AsyncData.Schema(Schema.Option(Playlist), LoadError);
export type PlaylistData = typeof PlaylistData.schema.Type;

/** What the catalog said about one genre. As with a track, no genre is an answer too. */
export const GenreData = AsyncData.Schema(Schema.Option(Genre), LoadError);
export type GenreData = typeof GenreData.schema.Type;

/** What the catalog said about one station. As with a track, no station is an answer too. */
export const StationData = AsyncData.Schema(Schema.Option(Station), LoadError);
export type StationData = typeof StationData.schema.Type;

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
  // NOTE: `onPage` marks a page asked for from where there is no room to
  // say how the asking ended: a track's from the island's menu. It takes the
  // screen with whatever there is to say, as a page chosen from a tile does,
  // where a track asked from a row stays behind its row.
  Intention: {
    requestId: Schema.String,
    route: AppRoute,
    viaKeyboard: Schema.optionalKey(Schema.Literal(true)),
    onPage: Schema.optionalKey(Schema.Literal(true)),
  },
  /**
   * A reply for a page the browser has already moved the URL to, by Back or
   * Forward. The page on screen is held until it comes, and how the listener
   * got there is kept for then: it decides where the focus goes.
   */
  Arrival: {
    requestId: Schema.String,
    route: AppRoute,
    entrance: Entrance,
    viaKeyboard: Schema.optionalKey(Schema.Literal(true)),
  },
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
 * Whether the app has yet had anything of its own to show. Launching, the
 * first page is still placeholders, and the mark the page opened with stands
 * over them (`#splash` in index.html). Launched, the mark has given way, and
 * it never comes back: a page that waits after that waits in the app.
 */
export const Launch = Schema.Literals(["Launching", "Launched"]);
export type Launch = typeof Launch.Type;

/** A section whose page is one list from the catalog, the same for every listener. */
export const ListedSection = Schema.Literals(["Home", "New", "Genres", "Radio"]);
export type ListedSection = typeof ListedSection.Type;

/**
 * The sections asked for ahead of the listener, so that the one they choose
 * is already held and takes the screen at once. They are asked for one at a
 * time, once the first page has taken the screen: `maybeAsked` is the one
 * the catalog is being asked for now, and `toAsk` those that follow it.
 *
 * Asking ahead is no intention. Nothing on screen says it is happening, a
 * failure is said nowhere, and whatever the listener does goes before it.
 */
export const Ahead = Schema.Struct({
  maybeAsked: Schema.Option(Schema.Struct({ requestId: Schema.String, section: ListedSection })),
  toAsk: Schema.Array(ListedSection),
});
export type Ahead = typeof Ahead.Type;

/**
 * The notice over a page that shows what it held because it could not be
 * refreshed: there to be read, or put away by the listener.
 */
export const StaleNotice = Schema.Literals(["Open", "Dismissed"]);
export type StaleNotice = typeof StaleNotice.Type;

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
  /** The sections being asked for before the listener chooses them. */
  ahead: Ahead,
  home: HomeData.schema,
  newMusic: NewMusicData.schema,
  genreList: GenreListData.schema,
  stationList: StationListData.schema,
  search: SearchData.schema,
  /**
   * What every search answered since the app loaded found, under its term.
   * `search` is the one on the page; this is what lets the listener go back
   * to an earlier one, through the browser's history or by typing its term
   * again, and find its results there at once.
   */
  searched: Schema.HashMap(Schema.String, SearchResults),
  /**
   * What Search's field held when Search was last on screen, as the listener
   * left it: what they typed, whether or not the catalog had answered it.
   * While Search is on screen its field's text is in the URL, and this says
   * the same; once the listener is elsewhere it is all that is left of it.
   * The navigation leads back to it, so Search is found as it was left.
   */
  maybeSearchText: Schema.Option(Schema.String),
  /**
   * What the catalog said about every track asked for since the app loaded.
   * Opening one again needs no wait, and a row reads here whether its track
   * is loading, failed to open, or is gone from the catalog.
   */
  tracks: Schema.HashMap(TrackId, TrackData.schema),
  /**
   * What the catalog said about every album asked for since the app loaded,
   * kept as `tracks` is: opening one again needs no wait.
   */
  albums: Schema.HashMap(AlbumId, AlbumData.schema),
  /**
   * The row each album was last asked from, for an album asked from a row's
   * menu. An album can be on many rows of a list, so what the catalog said of
   * it does not tell which of them was used: that row says that the album is
   * opening, or how that ended. An album chosen from a shelf has no entry,
   * and its tile says that it is opening.
   */
  albumRows: Schema.HashMap(AlbumId, Rows.RowId),
  /**
   * What the catalog said about every artist asked for since the app loaded,
   * kept as `albums` is. An artist is only ever chosen from a shelf, so their
   * tile says that they are opening.
   */
  artists: Schema.HashMap(ArtistId, ArtistData.schema),
  /** What the catalog said about every playlist asked for since the app loaded, kept as `artists` is. */
  playlists: Schema.HashMap(PlaylistId, PlaylistData.schema),
  /**
   * What the catalog said about every genre asked for since the app loaded,
   * kept as `artists` is. A genre is only ever chosen from its tile on the
   * Genres section, which says that it is opening.
   */
  genres: Schema.HashMap(GenreId, GenreData.schema),
  /**
   * What the catalog said about every station asked for since the app
   * loaded, kept as `artists` is. A station is only ever chosen from a shelf
   * of the Radio section, so its tile says that it is opening.
   */
  stations: Schema.HashMap(StationId, StationData.schema),
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
   * It is empty unless this visit left a page behind, which is what the
   * handle of the expanded player relies on: see `retrace` in main.ts.
   */
  trail: Schema.Array(AppRoute),
  /**
   * Whether the navigation is whole or drawn back. Scrolling a page down
   * draws it back; reaching the top of a page, pressing its circle, or
   * choosing a section brings it out again.
   */
  navigation: Navigation,
  /**
   * Whether the first page has had more than placeholders to show yet. The
   * mark the page opened with gives way when it has, and not before.
   */
  launch: Launch,
  /**
   * Whether the listener has put away the notice that the page on screen
   * could not be brought up to date. It is put away until the next time the
   * catalog cannot be asked: a notice closed says nothing of the next one.
   */
  staleNotice: StaleNotice,
  /**
   * Whether the screen is a desktop's, as the document last said. It decides
   * what the player is: on a compact screen it expands into a sheet, on a
   * desktop's it stays an island and its queue opens beside the page.
   */
  screen: Screen,
  inputMethod: InputMethod,
  /**
   * The rows of every list, between them: the menus at their ends, and
   * which of them shows that something was done (`rows/`).
   */
  rows: Rows.Model,
  /**
   * What Home's control opens on a narrow screen: who made the app
   * (`about.ts`). It is Home's, and is closed when another page takes the
   * screen.
   */
  about: Popover.Model,
  /**
   * The player: what was asked to be heard, and what the engine says is
   * sounding. It belongs to no page, so no change of page touches it.
   */
  player: PlayerModel,
  /**
   * The sheet the expanded player is drawn on: how much of it is on screen,
   * as the document says it. That there is a sheet at all is not here, since
   * expanded is derived from the route: this is only the sheet's own state
   * while it is drawn.
   */
  playerSheet: Sheet.Model,
});
export type Model = typeof Model.Type;

/** The expanded player's sheet as it enters the document: whole, brought on screen by the island growing into it. */
export const initialPlayerSheet: Sheet.Model = Sheet.init({
  id: "player-sheet",
  edge: "Bottom",
  entrance: "AtRest",
});

/** What is held about a track among those asked for: nothing yet when it never was. */
export const trackDataIn = (tracks: Model["tracks"], trackId: TrackId): TrackData =>
  AsyncData.fromOptionOrIdle(HashMap.get(tracks, trackId));

/** What the app holds about a track. */
export const trackData = (model: Model, trackId: TrackId): TrackData =>
  trackDataIn(model.tracks, trackId);

/** What is held about an album among those asked for: nothing yet when it never was. */
export const albumDataIn = (albums: Model["albums"], albumId: AlbumId): AlbumData =>
  AsyncData.fromOptionOrIdle(HashMap.get(albums, albumId));

/** What the app holds about an album. */
export const albumData = (model: Model, albumId: AlbumId): AlbumData =>
  albumDataIn(model.albums, albumId);

/** What is held about an artist among those asked for: nothing yet when they never were. */
export const artistDataIn = (artists: Model["artists"], artistId: ArtistId): ArtistData =>
  AsyncData.fromOptionOrIdle(HashMap.get(artists, artistId));

/** What the app holds about an artist. */
export const artistData = (model: Model, artistId: ArtistId): ArtistData =>
  artistDataIn(model.artists, artistId);

/** What is held about a playlist among those asked for: nothing yet when it never was. */
export const playlistDataIn = (
  playlists: Model["playlists"],
  playlistId: PlaylistId,
): PlaylistData => AsyncData.fromOptionOrIdle(HashMap.get(playlists, playlistId));

/** What the app holds about a playlist. */
export const playlistData = (model: Model, playlistId: PlaylistId): PlaylistData =>
  playlistDataIn(model.playlists, playlistId);

/** What is held about a genre among those asked for: nothing yet when it never was. */
export const genreDataIn = (genres: Model["genres"], genreId: GenreId): GenreData =>
  AsyncData.fromOptionOrIdle(HashMap.get(genres, genreId));

/** What the app holds about a genre. */
export const genreData = (model: Model, genreId: GenreId): GenreData =>
  genreDataIn(model.genres, genreId);

/** What is held about a station among those asked for: nothing yet when it never was. */
export const stationDataIn = (stations: Model["stations"], stationId: StationId): StationData =>
  AsyncData.fromOptionOrIdle(HashMap.get(stations, stationId));

/** What the app holds about a station. */
export const stationData = (model: Model, stationId: StationId): StationData =>
  stationDataIn(model.stations, stationId);

/**
 * The catalog has already said it has no such track, album, artist,
 * playlist, genre or station: asking again would say the same.
 */
export const isKnownMissing = <A>(
  data: AsyncData.AsyncData<Option.Option<A>, LoadError>,
): boolean => Option.exists(AsyncData.getData(data), Option.isNone);

const maybeAlbumIdOf = (route: AppRoute): Option.Option<AlbumId> =>
  route._tag === "Album" ? Option.some(route.albumId) : Option.none();

const maybeArtistIdOf = (route: AppRoute): Option.Option<ArtistId> =>
  route._tag === "Artist" ? Option.some(route.artistId) : Option.none();

const maybePlaylistIdOf = (route: AppRoute): Option.Option<PlaylistId> =>
  route._tag === "Playlist" ? Option.some(route.playlistId) : Option.none();

const maybeGenreIdOf = (route: AppRoute): Option.Option<GenreId> =>
  route._tag === "Genre" ? Option.some(route.genreId) : Option.none();

const maybeStationIdOf = (route: AppRoute): Option.Option<StationId> =>
  route._tag === "Station" ? Option.some(route.stationId) : Option.none();

/** Whose page of a kind is in the document: the one on screen, else the nearest one behind it. */
const maybeIdInDocument =
  <Id>(maybeIdOf: (route: AppRoute) => Option.Option<Id>) =>
  (route: AppRoute, trail: Model["trail"]): Option.Option<Id> =>
    pipe(
      maybeIdOf(route),
      Option.orElse(() => Array.findLast(trail, maybeIdOf)),
    );

/**
 * The album whose page is in the document: the one on screen, else the
 * nearest one behind the page on screen. An album's page is a list, and a
 * list is found as it was left: while the listener is on a page reached from
 * it, it stays in the document, hidden, as a section does. One album's page
 * is kept at a time.
 */
export const maybeAlbumIdInDocument: (
  route: AppRoute,
  trail: Model["trail"],
) => Option.Option<AlbumId> = maybeIdInDocument(maybeAlbumIdOf);

/**
 * The artist whose page is in the document, as an album's is: an artist's
 * page is a list and a shelf, kept behind the album or the song reached from
 * it. One artist's page is kept at a time.
 */
export const maybeArtistIdInDocument: (
  route: AppRoute,
  trail: Model["trail"],
) => Option.Option<ArtistId> = maybeIdInDocument(maybeArtistIdOf);

/**
 * The playlist whose page is in the document, as an album's is: a playlist's
 * page is a list, kept behind the song or the album reached from it. One
 * playlist's page is kept at a time.
 */
export const maybePlaylistIdInDocument: (
  route: AppRoute,
  trail: Model["trail"],
) => Option.Option<PlaylistId> = maybeIdInDocument(maybePlaylistIdOf);

/**
 * The genre whose page is in the document, as an album's is: a genre's page
 * is a list and shelves, kept behind the song, the album, the artist or the
 * playlist reached from it. One genre's page is kept at a time.
 */
export const maybeGenreIdInDocument: (
  route: AppRoute,
  trail: Model["trail"],
) => Option.Option<GenreId> = maybeIdInDocument(maybeGenreIdOf);

/**
 * The station whose page is in the document, as an album's is: a station's
 * page is a list, kept behind the song or the album reached from it. One
 * station's page is kept at a time.
 */
export const maybeStationIdInDocument: (
  route: AppRoute,
  trail: Model["trail"],
) => Option.Option<StationId> = maybeIdInDocument(maybeStationIdOf);

/** A page with data, or with a failure to state, has more to show than placeholders. */
const hasSomethingToShow = <A>(data: AsyncData.AsyncData<A, LoadError>): boolean =>
  AsyncData.hasData(data) || AsyncData.hasError(data);

/**
 * Whether the catalog has answered what Search's field asks, or an earlier
 * term: with what it found, with nothing, or with a failure. Then the page
 * has something to say under the field, and the field stands at its head.
 * Until then, with nothing asked or the first answer on its way, the field
 * is in the middle of the page.
 */
// NOTE: an answer that found nothing keeps the field at the head. It would
// otherwise travel down for a term with a slip in it and back up when the
// slip is put right, under the listener's fingers.
export const hasSearchAnswer = (
  maybeSearchedTerm: Option.Option<string>,
  search: SearchData,
): boolean => Option.isSome(maybeSearchedTerm) && hasSomethingToShow(search);

/** Whether Search is on screen with its field at the head of the page. */
export const isSearchFieldAtHead = (model: Model): boolean =>
  hasSearchAnswer(searchedTerm(model.route), model.search);

/**
 * Whether a route's page has more than placeholders to show. Search with a
 * blank field always has: its prompt needs nothing from the catalog. So has
 * the page of the track the player holds, which is the player itself.
 */
export const canShow = (model: Model, route: AppRoute): boolean =>
  AppRoute.match(route, {
    Home: () => hasSomethingToShow(model.home),
    New: () => hasSomethingToShow(model.newMusic),
    Genres: () => hasSomethingToShow(model.genreList),
    Radio: () => hasSomethingToShow(model.stationList),
    Search: () => Option.isNone(searchedTerm(route)) || hasSomethingToShow(model.search),
    Track: ({ trackId }) =>
      hasSomethingToShow(trackData(model, trackId)) || isPlayersPage(model, route),
    Album: ({ albumId }) => hasSomethingToShow(albumData(model, albumId)),
    Artist: ({ artistId }) => hasSomethingToShow(artistData(model, artistId)),
    Playlist: ({ playlistId }) => hasSomethingToShow(playlistData(model, playlistId)),
    Genre: ({ genreId }) => hasSomethingToShow(genreData(model, genreId)),
    Station: ({ stationId }) => hasSomethingToShow(stationData(model, stationId)),
    NotFound: () => true,
  });

/** Why what a page holds could not be refreshed, when it holds something and could not. */
const staleErrorOf = <A>(data: AsyncData.AsyncData<A, LoadError>): Option.Option<LoadError> =>
  AsyncData.hasData(data) ? AsyncData.getError(data) : Option.none();

/** What is read of whatever the page on screen holds, of whichever kind it is. */
type ReadError = <A>(data: AsyncData.AsyncData<A, LoadError>) => Option.Option<LoadError>;

const errorOnScreen = (model: Model, read: ReadError): Option.Option<LoadError> =>
  AppRoute.match(model.route, {
    Home: () => read(model.home),
    New: () => read(model.newMusic),
    Genres: () => read(model.genreList),
    Radio: () => read(model.stationList),
    Search: () => read(model.search),
    Track: ({ trackId }) => read(trackData(model, trackId)),
    Album: ({ albumId }) => read(albumData(model, albumId)),
    Artist: ({ artistId }) => read(artistData(model, artistId)),
    Playlist: ({ playlistId }) => read(playlistData(model, playlistId)),
    Genre: ({ genreId }) => read(genreData(model, genreId)),
    Station: ({ stationId }) => read(stationData(model, stationId)),
    NotFound: () => Option.none(),
  });

/**
 * Why the page on screen shows what it loaded earlier instead of what the
 * catalog has now, when that is the case: a refresh behind it failed.
 */
export const maybeStaleError = (model: Model): Option.Option<LoadError> =>
  errorOnScreen(model, staleErrorOf);

/**
 * Why the page on screen could not be asked, when it could not: whether it
 * shows what it loaded earlier, or has nothing to show but that.
 */
export const maybeLoadError = (model: Model): Option.Option<LoadError> =>
  errorOnScreen(model, AsyncData.getError);

/**
 * Whether the Model already holds what a route's page shows, so the page can
 * take the screen without a wait. A search is held only for the term it
 * answered.
 */
export const isLoaded = (model: Model, route: AppRoute): boolean =>
  AppRoute.match(route, {
    Home: () => AsyncData.hasData(model.home),
    New: () => AsyncData.hasData(model.newMusic),
    Genres: () => AsyncData.hasData(model.genreList),
    Radio: () => AsyncData.hasData(model.stationList),
    Search: () =>
      Option.match(searchedTerm(route), {
        onNone: () => true,
        onSome: (term) =>
          Option.exists(AsyncData.getData(model.search), (answer) => answer.term === term),
      }),
    Track: ({ trackId }) => AsyncData.hasData(trackData(model, trackId)),
    Album: ({ albumId }) => AsyncData.hasData(albumData(model, albumId)),
    Artist: ({ artistId }) => AsyncData.hasData(artistData(model, artistId)),
    Playlist: ({ playlistId }) => AsyncData.hasData(playlistData(model, playlistId)),
    Genre: ({ genreId }) => AsyncData.hasData(genreData(model, genreId)),
    Station: ({ stationId }) => AsyncData.hasData(stationData(model, stationId)),
    NotFound: () => true,
  });

/** Whether a route is the page of the track the player holds. */
export const isPlayersTrack = (model: Model, route: AppRoute): boolean =>
  route._tag === "Track" && Option.contains(maybeCurrentTrackId(model.player), route.trackId);

/**
 * Whether a route's page is the player itself, expanded: the page of the
 * track it holds, on a compact screen. The queue already holds what that
 * page shows, so it never has to be waited for. On a desktop's screen the
 * player does not expand, and the page of the track it holds is a track's
 * page like any other.
 */
export const isPlayersPage = (model: Model, route: AppRoute): boolean =>
  model.screen === "Compact" && isPlayersTrack(model, route);

/**
 * Whether the player is expanded: the screen is the page of the track it
 * holds, and is a compact one. Nothing records this. The route says which
 * track is on screen, the player says which is current, and the two are
 * compared: on any other track's page, and on every other page, the player
 * is its island. On a desktop's screen it is always its island.
 */
export const isPlayerExpanded = (model: Model): boolean => isPlayersPage(model, model.route);

/**
 * Whether the progress of the sound is being drawn as it goes on: a bar for
 * it is on screen, in the expanded player or in the island of a desktop's
 * screen, and it follows the sound (`followsSound`). Only then is the engine
 * asked where the sound is several times a second: an island with no bar,
 * on a compact screen, has nothing to draw it on.
 */
export const drawsSoundProgress = (model: Model): boolean =>
  (model.screen === "Desktop" || isPlayerExpanded(model)) && followsSound(model.player);

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
 * knows of one: where the browser's Back leads, and the handle that closes
 * the expanded player.
 */
export const wayBackOn = (trail: Model["trail"]): Option.Option<AppRoute> => Array.last(trail);

export const wayBack = (model: Model): Option.Option<AppRoute> => wayBackOn(model.trail);
