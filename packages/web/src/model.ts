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
import { Menu } from "@foldkit/ui";
import * as Array from "effect/Array";
import { pipe } from "effect/Function";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { AsyncData } from "foldkit";
import { defineTaggedUnion } from "foldkit/schema";
import { LoadError } from "./catalog.ts";
import { InputMethod, PlayOrigin } from "./message.ts";
import { maybeCurrentTrackId, Model as PlayerModel, QueuePlace } from "./player/model.ts";
import { AppRoute, searchedTerm } from "./route.ts";
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
  Intention: { requestId: Schema.String, route: AppRoute, viaKeyboard: Schema.optionalKey(Schema.Literal(true)) },
  /**
   * A reply for a page the browser has already moved the URL to, by Back or
   * Forward. The page on screen is held until it comes, and how the listener
   * got there is kept for then: it decides where the focus goes.
   */
  Arrival: { requestId: Schema.String, route: AppRoute, entrance: Entrance, viaKeyboard: Schema.optionalKey(Schema.Literal(true)) },
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

/** A row, as the Model names it: the page it is on and its track. */
export const Row = Schema.Struct({ from: PlayOrigin, trackId: TrackId });
export type Row = typeof Row.Type;

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
  albumRows: Schema.HashMap(AlbumId, Row),
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
  inputMethod: InputMethod,
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

/**
 * The pages that are lists of their own and no section: an album's, an
 * artist's, a playlist's, a genre's, a station's.
 */
type ListPage = "Album" | "Artist" | "Playlist" | "Genre" | "Station";

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
 * Whether the page of a kind that is in the document has a page behind it in
 * the browser's history. On screen, that is any page behind the current one;
 * kept, any page behind its own entry.
 */
const hasWayBackFrom =
  (page: ListPage) =>
  (route: AppRoute, trail: Model["trail"]): boolean =>
    route._tag === page
      ? Array.isReadonlyArrayNonEmpty(trail)
      : Option.exists(
          Array.findLastIndex(trail, (behind) => behind._tag === page),
          (index) => index > 0,
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
 * Whether the album's page in the document has a page behind it in the
 * browser's history. On screen, that is any page behind the current one;
 * kept, any page behind its own entry.
 */
export const hasWayBackFromAlbum: (route: AppRoute, trail: Model["trail"]) => boolean =
  hasWayBackFrom("Album");

/**
 * The artist whose page is in the document, as an album's is: an artist's
 * page is a list and a shelf, kept behind the album or the song reached from
 * it. One artist's page is kept at a time.
 */
export const maybeArtistIdInDocument: (
  route: AppRoute,
  trail: Model["trail"],
) => Option.Option<ArtistId> = maybeIdInDocument(maybeArtistIdOf);

/** Whether the artist's page in the document has a page behind it, as for an album's. */
export const hasWayBackFromArtist: (route: AppRoute, trail: Model["trail"]) => boolean =
  hasWayBackFrom("Artist");

/**
 * The playlist whose page is in the document, as an album's is: a playlist's
 * page is a list, kept behind the song or the album reached from it. One
 * playlist's page is kept at a time.
 */
export const maybePlaylistIdInDocument: (
  route: AppRoute,
  trail: Model["trail"],
) => Option.Option<PlaylistId> = maybeIdInDocument(maybePlaylistIdOf);

/** Whether the playlist's page in the document has a page behind it, as for an album's. */
export const hasWayBackFromPlaylist: (route: AppRoute, trail: Model["trail"]) => boolean =
  hasWayBackFrom("Playlist");

/**
 * The genre whose page is in the document, as an album's is: a genre's page
 * is a list and shelves, kept behind the song, the album, the artist or the
 * playlist reached from it. One genre's page is kept at a time.
 */
export const maybeGenreIdInDocument: (
  route: AppRoute,
  trail: Model["trail"],
) => Option.Option<GenreId> = maybeIdInDocument(maybeGenreIdOf);

/** Whether the genre's page in the document has a page behind it, as for an album's. */
export const hasWayBackFromGenre: (route: AppRoute, trail: Model["trail"]) => boolean =
  hasWayBackFrom("Genre");

/**
 * The station whose page is in the document, as an album's is: a station's
 * page is a list, kept behind the song or the album reached from it. One
 * station's page is kept at a time.
 */
export const maybeStationIdInDocument: (
  route: AppRoute,
  trail: Model["trail"],
) => Option.Option<StationId> = maybeIdInDocument(maybeStationIdOf);

/** Whether the station's page in the document has a page behind it, as for an album's. */
export const hasWayBackFromStation: (route: AppRoute, trail: Model["trail"]) => boolean =
  hasWayBackFrom("Station");

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
    Genres: () => hasSomethingToShow(model.genreList),
    Radio: () => hasSomethingToShow(model.stationList),
    Search: () => Option.isNone(searchedTerm(route)) || hasSomethingToShow(model.search),
    Track: ({ trackId }) =>
      hasSomethingToShow(trackData(model, trackId)) || isPlayersTrack(model, route),
    Album: ({ albumId }) => hasSomethingToShow(albumData(model, albumId)),
    Artist: ({ artistId }) => hasSomethingToShow(artistData(model, artistId)),
    Playlist: ({ playlistId }) => hasSomethingToShow(playlistData(model, playlistId)),
    Genre: ({ genreId }) => hasSomethingToShow(genreData(model, genreId)),
    Station: ({ stationId }) => hasSomethingToShow(stationData(model, stationId)),
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
