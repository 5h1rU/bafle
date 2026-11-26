import { TrackId } from "@bafle/domain/Catalog/Track";
import { Menu } from "@foldkit/ui";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import {
  all,
  click,
  Command,
  expect as see,
  expectAll,
  given,
  inside,
  Mount,
  role,
  selector,
  Subscription,
  text,
} from "foldkit/scene";
import { describe, expect, test } from "vitest";
import { Catalog } from "../src/catalog.ts";
import {
  FocusAlbumTile,
  FocusArtistTile,
  FocusGenreTile,
  FocusPage,
  FocusTrackRow,
  NavigateInternal,
} from "../src/command.ts";
import { update, viewTransition } from "../src/main.ts";
import { Message } from "../src/message.ts";
import type { Model } from "../src/model.ts";
import * as Player from "../src/player/index.ts";
import { documentTitle, view } from "../src/view.ts";
import {
  after,
  aheadUnanswered,
  album,
  albumOpener,
  albumPath,
  answered,
  arrived,
  artist,
  artistPath,
  changedUrl,
  chose,
  choseFromRow,
  clickedLink,
  explicitTrack,
  fullGenre,
  genre,
  genrePath,
  nextId,
  onGenre,
  onGenres,
  onHome,
  opened,
  openingGenreFromTile,
  otherGenre,
  pressedMore,
  reply,
  scene,
  track,
  trackPath,
} from "./fixtures.ts";

const app = { update, view };

const TITLE = "Harder, Better, Faster, Stronger";

const navigation = role("navigation", { name: "Main" });
const destination = (name: string) => role("link", { name });
const circle = role("button", { name: "Show navigation" });
const pageTitle = (name: string | RegExp) => role("heading", { name, level: 1 });
const sectionTitle = (name: string) => role("heading", { name, level: 2 });
const onScreen = selector('[role="region"]:not([inert])');
const keptGenres = selector("#genres-page[inert]");
const keptGenre = selector("#genre-page[inert]");
const grid = role("list", { name: "Genres" });
const topSongs = role("list", { name: "Top songs" });
const more = (title: string) => role("button", { name: `More: ${title}` });
const playRow = (title: string) => role("button", { name: new RegExp(`^Play: ${title}`) });
const item = (name: string) => role("menuitem", { name });
const tryAgain = role("button", { name: "Try again" });
const tryAgainButtons = all.role("button", { name: /^Try again/ });
const backControl = role("button", { name: "Back" });
const homeControl = role("link", { name: "Home" });
const genreTile = role("link", { name: "Electro" });
const otherGenreTile = role("link", { name: "Dance" });
const albumTile = role("link", { name: /Discovery/ });
const artistTile = role("link", { name: /Daft Punk/ });
const playlistTile = role("link", { name: /French Touch/ });
const spinners = all.selector("svg.animate-spin");
/** A tile whose page is on its way: its record is out of its sleeve, and turns. */
const records = all.selector("[data-opening]");
const island = role("region", { name: "Player" });
const placeholders = all.selector('[aria-busy="true"] [aria-hidden="true"]');
const placeholderBlocks = all.selector('[aria-busy="true"] [aria-hidden="true"] .animate-pulse');

/** An open menu entered the document: its backdrop was put behind it and it was placed by its control. */
const menuEnters = Mount.resolveAll(
  [Menu.PortalMenuBackdrop, Menu.Message.CompletedPortalMenuBackdrop()],
  [Menu.AnchorMenu, Menu.Message.CompletedAnchorMenu()],
);

/** The engine took the order, and the system's display was told. The threshold's timer is still running. */
const resolveStart = (order: number) =>
  Command.resolveAll(
    [Player.StartPlayback, Player.Message.CompletedStartPlayback({ order, outcome: "Sounding" })],
    [Player.PublishNowPlaying, Player.Message.CompletedPublishNowPlaying()],
  );

/**
 * The island entered the document: its figure was drawn, its light set to
 * what the Model says, and its title measured and found to fit.
 */
const islandEnters = Mount.resolveAll(
  [Player.DrawIslandFigure, Player.Message.CompletedDrawIslandFigure()],
  [Player.FollowIslandPress, Player.Message.CompletedFollowIslandPress()],
  [Player.StartIslandLight, Player.Message.CompletedStartIslandLight()],
  [
    Player.MeasureTitle,
    Player.Message.MeasuredTitle({ placePixels: 0, maybeTravelPixels: Option.none() }),
  ],
  [
    Player.MeasureArtist,
    Player.Message.MeasuredArtist({ placePixels: 0, maybeTravelPixels: Option.none() }),
  ],
);

/** The threshold passes with nothing heard from the engine. */
const thresholdPasses = (order: number) =>
  Command.resolve(
    Player.WaitBeforeShowingActivity,
    Player.Message.CompletedWaitBeforeShowingActivity({ order }),
  );

/** Home still on screen; the listener chose Genres from the menu, which has never loaded. */
const leavingHomeForGenres: Model = chose(onHome, "/genres");

/** Genres on screen, reached from Home by the menu: both sections hold data. */
const onGenresFromHome: Model = answered(leavingHomeForGenres, reply.genres, "/genres");

/** An album chosen from the genre's shelf: the genre is behind its page. */
const onAlbumFromGenre: Model = answered(
  chose(onGenre, albumPath(album.id)),
  reply.album,
  albumPath(album.id),
);

describe("the menu leads to Genres and Radio", () => {
  test("they stand after New, with Search apart at the far end", () =>
    scene(
      app,
      given(onHome),
      inside(
        navigation,
        see(destination("Genres")).toHaveAttr("href", "/genres"),
        see(destination("Radio")).toHaveAttr("href", "/radio"),
      ),
      see(navigation).toHaveText(/Home.*New.*Genres.*Radio.*Search/),
    ));

  test("each item of the menu keeps its place in it, which is what the circle finds it by", () =>
    scene(
      app,
      given(after(onGenres, Message.ScrolledDown())),
      // Four items of the menu, and Search, which is no item of it.
      expectAll(all.selector("#main-navigation li.dock-item")).toHaveCount(4),
      expectAll(all.selector("#main-navigation li")).toHaveCount(5),
      // Drawn back, the circle shows Genres: its item is the one that stays, as a picture.
      inside(navigation, see(circle).toHaveAttr("data-section", "Genres")),
      expectAll(all.selector("#main-navigation li.dock-current")).toHaveCount(1),
      see(selector("#main-navigation li.dock-current a")).toHaveAttr("href", "/genres"),
      inside(
        navigation,
        see(destination("Genres")).toHaveClass("minimized:invisible"),
        see(selector("a[aria-current] svg")).toHaveClass("minimized:visible"),
        see(destination("Search")).not.toHaveClass("minimized:invisible"),
      ),
    ));

  test("on a genre's page the circle shows Genres, the section behind it", () =>
    scene(
      app,
      given(after(onGenre, Message.ScrolledDown())),
      see(circle).toHaveAttr("data-section", "Genres"),
    ));
});

describe("rule 5: Genres opens in its shape", () => {
  test("a grid of blocks stands where the tiles will be", () =>
    scene(
      app,
      given(opened("/genres")),
      see(pageTitle("Genres")).toExist(),
      expectAll(placeholders).toHaveCount(1),
      expectAll(placeholderBlocks).not.toHaveCount(0),
      see(grid).toBeAbsent(),
      see(text("Loading Genres")).toExist(),
      see(destination("Genres")).toHaveAttr("aria-current", "page"),
    ));

  test("the reply fills it with every genre, each a tile that leads to its page", () =>
    scene(
      app,
      given(opened("/genres")),
      Subscription.emit(arrived(reply.genres("page:0"))),
      Command.resolveAll(...aheadUnanswered(1, "Home", "New", "Radio")),
      expectAll(placeholderBlocks).toHaveCount(0),
      inside(
        grid,
        expectAll(all.role("link")).toHaveCount(2),
        see(genreTile).toHaveAttr("href", "/genre/ge-1"),
        see(genreTile).toHaveAttr("aria-busy", "false"),
        see(otherGenreTile).toHaveAttr("href", "/genre/ge-2"),
        // A genre's picture is the tile's; without one, the mark for none.
        see(selector(`img[src="${otherGenre.picture?.medium}"]`)).toExist(),
        inside(genreTile, expectAll(all.selector("img")).toHaveCount(0)),
      ),
      see(text("Showing Genres")).toExist(),
    ));

  test("a catalog with no genres says so in place of the grid", () =>
    scene(
      app,
      given(answered(opened("/genres"), (id) => reply.genres(id, { genres: [] }))),
      see(text("The catalog lists no genres right now.")).toExist(),
      see(grid).toBeAbsent(),
    ));
});

describe("rule 1: Genres chosen from the menu holds the page and marks its item", () => {
  test("the page stays while the item shows it is loading; then the section swaps in", () =>
    scene(
      app,
      given(onHome),
      Subscription.emit(clickedLink("/genres")),
      see(pageTitle("Home")).toExist(),
      see(destination("Home")).toHaveAttr("aria-current", "page"),
      see(destination("Genres")).toHaveAttr("aria-busy", "true"),
      // Its icon breathes where it stands, and the navigation marks it at once:
      // the page on screen is still the one `aria-current` names.
      inside(destination("Genres"), expectAll(all.selector("svg.nav-breathes")).toHaveCount(1)),
      see(destination("Genres")).toHaveAttr("data-marked", ""),
      see(destination("Genres")).not.toHaveAttr("aria-current"),
      see(text("Loading Genres")).toExist(),
      Command.resolve(Catalog.GenreList, reply.genres(nextId(onHome))),
      // Only now is the URL asked to move.
      Command.expectExact(NavigateInternal),
      Command.resolve(NavigateInternal, Message.CompletedNavigateInternal()),
      inside(onScreen, see(pageTitle("Genres")).toExist(), see(pageTitle("Home")).toBeAbsent()),
      see(destination("Genres")).toHaveAttr("aria-current", "page"),
      see(destination("Genres")).toHaveAttr("aria-busy", "false"),
      see(text("Showing Genres")).toExist(),
    ));
});

describe("rule 6: Genres says its failure on the page", () => {
  test("with Try again, which loads it where it stands", () => {
    const failed = answered(leavingHomeForGenres, reply.genresRefused, "/genres");

    scene(
      app,
      given(failed),
      inside(onScreen, see(pageTitle("Genres")).toExist()),
      inside(
        role("alert"),
        see(text("Genres could not load.")).toExist(),
        see(text("The music catalog is not answering right now.")).toExist(),
      ),
      click(tryAgain),
      Command.resolve(FocusPage, Message.CompletedFocusPage()),
      see(role("alert")).toBeAbsent(),
      expectAll(placeholderBlocks).not.toHaveCount(0),
      Command.resolve(Catalog.GenreList, reply.genres(nextId(failed))),
      inside(onScreen, see(genreTile).toExist()),
    );
  });

  test("a refresh that fails leaves the grid as it was, under a notice over the page", () => {
    const refreshing = chose(after(onGenresFromHome, changedUrl("/")), "/genres");

    scene(
      app,
      given(answered(refreshing, reply.genresLost)),
      inside(onScreen, see(pageTitle("Genres")).toExist(), see(genreTile).toExist()),
      see(role("alert")).toBeAbsent(),
      see(text("You are offline. Showing what loaded earlier.")).toExist(),
    );
  });
});

describe("rules 4 and 9: Genres is kept once loaded", () => {
  test("behind another section it stays in the document, hidden, with its tiles", () =>
    scene(
      app,
      given(after(onGenresFromHome, changedUrl("/"))),
      inside(onScreen, see(pageTitle("Home")).toExist()),
      inside(keptGenres, expectAll(all.role("link")).toHaveCount(2)),
      expectAll(all.selector("main .invisible #genres-page")).toHaveCount(1),
    ));

  test("chosen again it is on screen at once, and refreshes behind what it shows", () =>
    scene(
      app,
      given(after(onGenresFromHome, changedUrl("/"))),
      Subscription.emit(clickedLink("/genres")),
      inside(onScreen, see(pageTitle("Genres")).toExist(), see(genreTile).toExist()),
      see(destination("Genres")).toHaveAttr("aria-busy", "false"),
      expectAll(placeholderBlocks).toHaveCount(0),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [Catalog.GenreList, reply.genres(nextId(after(onGenresFromHome, changedUrl("/"))))],
      ),
    ));
});

describe("a genre's tile leads to the genre's page", () => {
  test("Genres is held and the tile shows that its genre is on its way; then the genre takes the screen", () =>
    scene(
      app,
      given(onGenres),
      inside(genreTile, expectAll(records).toHaveCount(0)),
      Subscription.emit(clickedLink(genrePath(genre.id))),
      inside(
        onScreen,
        see(pageTitle("Genres")).toExist(),
        see(genreTile).toHaveAttr("aria-busy", "true"),
        inside(genreTile, expectAll(records).toHaveCount(1)),
        // Only the tile that was chosen says so.
        expectAll(records).toHaveCount(1),
        see(otherGenreTile).toHaveAttr("aria-busy", "false"),
      ),
      inside(navigation, expectAll(all.selector('[aria-busy="true"]')).toHaveCount(0)),
      // No row speaks for it, so the page's status does.
      see(text("Loading Genre")).toExist(),
      Command.resolve(Catalog.GenreDetail, reply.genre(nextId(onGenres))),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusPage, Message.CompletedFocusPage()],
      ),
      inside(onScreen, see(pageTitle("Electro")).toExist()),
      // Genres is kept behind it, its tile at rest again.
      inside(keptGenres, see(selector("a[data-genre-tile='ge-1']")).toHaveAttr("aria-busy", "false")),
      // A genre is not a section: no item is the current page.
      inside(navigation, expectAll(all.selector("[aria-current]")).toHaveCount(0)),
    ));

  test("the tile's picture and the page's carry one name, on the page on screen only, and travel as a playlist's does", () => {
    const name = "genre-picture-ge-1";
    scene(
      app,
      given(onGenres),
      inside(
        genreTile,
        see(selector(".tile-sleeve")).toHaveStyle("view-transition-name", name),
        see(selector(".tile-sleeve")).toHaveStyle("view-transition-class", "playlist-picture"),
      ),
    );
    scene(
      app,
      given(onGenre),
      inside(
        selector("#genres-page[inert] a[data-genre-tile='ge-1']"),
        see(selector(".tile-sleeve")).not.toHaveStyle("view-transition-name"),
      ),
      see(selector("#genre-page .aspect-square.rounded-xl")).toHaveStyle(
        "view-transition-name",
        name,
      ),
    );
  });

  test("opening it and leaving it are swaps like any other: they ask for a transition that carries its picture", () => {
    expect(
      viewTransition({
        previousModel: openingGenreFromTile,
        model: onGenre,
        message: changedUrl(genrePath(genre.id)),
      }),
    ).toEqual({ types: ["open-detail", `genre-picture-${genre.id}`] });
    expect(
      viewTransition({
        previousModel: onGenre,
        model: after(onGenre, changedUrl("/genres")),
        message: changedUrl("/genres"),
      }),
    ).toEqual({ types: ["close-detail", `genre-picture-${genre.id}`] });
    // Held on Genres while the genre loads, nothing swaps.
    expect(
      viewTransition({
        previousModel: onGenres,
        model: openingGenreFromTile,
        message: clickedLink(genrePath(genre.id)),
      }),
    ).toBe(false);
  });

  test("a failure is said on the genre's page, with Try again: a tile has no room for it", () =>
    scene(
      app,
      given(openingGenreFromTile),
      Subscription.emit(arrived(reply.genreRefused(nextId(onGenres)))),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusPage, Message.CompletedFocusPage()],
      ),
      inside(
        onScreen,
        see(pageTitle("Genre")).toExist(),
        see(role("alert")).toContainText("Genre could not load."),
        see(role("alert")).toContainText("The music catalog is not answering right now."),
        see(tryAgain).toExist(),
      ),
      click(tryAgain),
      Command.expectExact(Catalog.GenreDetail, FocusPage),
      Command.resolve(FocusPage, Message.CompletedFocusPage()),
      Command.resolve(Catalog.GenreDetail, reply.genre("page:3")),
      inside(onScreen, see(pageTitle("Electro")).toExist(), see(role("alert")).toBeAbsent()),
    ));

  test("a genre the catalog does not have says so on its page for good, with no Try again", () =>
    scene(
      app,
      given(answered(openingGenreFromTile, reply.genreMissing, genrePath(genre.id))),
      inside(
        onScreen,
        see(pageTitle("This genre is not available")).toExist(),
        see(text("The catalog no longer has it, or the link to it is wrong.")).toExist(),
        expectAll(tryAgainButtons).toHaveCount(0),
      ),
    ));

  test("back from the genre, Genres is the page on screen again, the focus on its tile, and the genre's page is gone", () =>
    scene(
      app,
      given(onGenre),
      inside(keptGenres, expectAll(all.role("link")).toHaveCount(2)),
      Subscription.emit(changedUrl("/genres")),
      Command.expectHas(FocusGenreTile),
      Command.resolve(FocusGenreTile, Message.CompletedFocusGenreTile()),
      Command.resolve(Catalog.GenreList, reply.genres(nextId(onGenre))),
      inside(onScreen, see(pageTitle("Genres")).toExist()),
      see(selector("#genre-page")).toBeAbsent(),
      expectAll(spinners).toHaveCount(0),
    ));
});

describe("rule 5: a direct link paints the genre page's shape", () => {
  test("placeholders stand for the picture, the name, the rows and the tiles, under the real titles", () =>
    scene(
      app,
      given(opened(genrePath(genre.id))),
      // Said, not shown: the placeholders stand where the name will be.
      see(pageTitle("Genre")).toHaveClass("sr-only"),
      see(sectionTitle("Top songs")).toExist(),
      see(sectionTitle("Top albums")).toExist(),
      see(sectionTitle("Top artists")).toExist(),
      see(sectionTitle("Top playlists")).toExist(),
      expectAll(placeholderBlocks).not.toHaveCount(0),
      see(topSongs).toBeAbsent(),
      // No page has a control of its own to leave it by: the navigation is the way out.
      inside(onScreen, see(homeControl).toBeAbsent(), see(backControl).toBeAbsent()),
      see(text("Loading Genre")).toExist(),
    ));

  test("the document is titled after the genre", () => {
    expect(documentTitle(onGenre)).toBe("Electro · Bafle");
    expect(documentTitle(opened(genrePath(genre.id)))).toBe("Genre · Bafle");
    expect(documentTitle(onGenres)).toBe("Genres · Bafle");
  });
});

describe("the genre page", () => {
  test("shows the genre's name over what is popular in it: its songs in order, then shelves of albums, artists and playlists", () =>
    scene(
      app,
      given(onGenre),
      inside(
        onScreen,
        see(pageTitle("Electro")).toExist(),
        inside(
          topSongs,
          expectAll(all.role("listitem")).toHaveCount(2),
          see(playRow(TITLE)).toContainText("Daft Punk"),
          see(playRow("Technologic")).toContainText("4:05"),
        ),
        // A chart: the rows are numbered.
        see(selector("#genre-page ol[aria-labelledby='genre-top-songs']")).toExist(),
        inside(
          role("list", { name: "Top albums" }),
          see(albumTile).toHaveAttr("href", "/album/al-1"),
        ),
        inside(
          role("list", { name: "Top artists" }),
          see(artistTile).toHaveAttr("href", "/artist/ar-1"),
        ),
        inside(
          role("list", { name: "Top playlists" }),
          see(playlistTile).toHaveAttr("href", "/playlist/pl-1"),
        ),
        // Nor has one opened from a list: the browser's Back is the way back.
        see(backControl).toBeAbsent(),
      ),
    ));

  test("its songs stand in columns of five at most, as even as they can be: the list says how many a column holds, how many there are, and which rows head one", () => {
    // Twelve songs: three columns of four, and not five, five and two.
    const twelve = Array.makeBy(12, (index) => ({ ...track, id: TrackId.make(`tr-top-${index}`) }));
    const withTwelve = answered(
      openingGenreFromTile,
      (requestId) => reply.genre(requestId, { ...fullGenre, topTracks: twelve }),
      genrePath(genre.id),
    );

    scene(
      app,
      given(withTwelve),
      inside(
        onScreen,
        see(selector("#genre-page ol.track-columns")).toHaveStyle("--rows", "4"),
        see(selector("#genre-page ol.track-columns")).toHaveAttr("data-columns", "3"),
        expectAll(all.selector("#genre-page ol.track-columns li")).toHaveCount(12),
        expectAll(all.selector("#genre-page ol.track-columns [data-column-head]")).toHaveCount(2),
        see(selector('#genre-page [data-column-head] [data-track="tr-top-4"]')).toExist(),
        see(selector('#genre-page [data-column-head] [data-track="tr-top-8"]')).toExist(),
      ),
    );
  });

  test("a few songs are one column, with none to head", () => {
    const three = [track, explicitTrack, albumOpener];
    const withThree = answered(
      openingGenreFromTile,
      (requestId) => reply.genre(requestId, { ...fullGenre, topTracks: three }),
      genrePath(genre.id),
    );

    scene(
      app,
      given(withThree),
      inside(
        onScreen,
        see(selector("#genre-page ol.track-columns")).toHaveStyle("--rows", "3"),
        see(selector("#genre-page ol.track-columns")).toHaveAttr("data-columns", "1"),
        expectAll(all.selector("#genre-page ol.track-columns [data-column-head]")).toHaveCount(0),
      ),
    );
  });

  test("a kind with nothing popular has no shelf, and a genre with nothing at all says so", () => {
    scene(
      app,
      given(
        answered(opened(genrePath(genre.id)), (id) =>
          reply.genre(id, { ...reply.genre(id).result, albums: [], playlists: [] }),
        ),
      ),
      see(sectionTitle("Top songs")).toExist(),
      see(sectionTitle("Top artists")).toExist(),
      see(sectionTitle("Top albums")).toBeAbsent(),
      see(sectionTitle("Top playlists")).toBeAbsent(),
    );
    scene(
      app,
      given(
        answered(opened(genrePath(genre.id)), (id) =>
          reply.genre(id, {
            ...reply.genre(id).result,
            topTracks: [],
            albums: [],
            artists: [],
            playlists: [],
          }),
        ),
      ),
      see(pageTitle("Electro")).toExist(),
      see(text("The catalog lists nothing popular in this genre right now.")).toExist(),
      see(sectionTitle("Top songs")).toBeAbsent(),
    );
  });

  test("its rows open their menu, which offers the album and the song", () =>
    scene(
      app,
      given(after(onGenre, pressedMore("Genre", track.id))),
      menuEnters,
      inside(onScreen, see(more(TITLE)).toHaveAttr("aria-expanded", "true")),
      see(item("Go to album")).toExist(),
      see(item("Song details")).toExist(),
    ));

  test("a tap on a row starts its track, and the page stays as it is, with the island over its foot", () =>
    scene(
      app,
      given(onGenre),
      see(island).toBeAbsent(),
      inside(onScreen, click(playRow(TITLE))),
      islandEnters,
      Command.expectExact(
        Player.StartPlayback({
          order: 1,
          source: "https://audio.test/tr-1.mp3",
          positionSeconds: 0,
        }),
        Player.WaitBeforeShowingActivity({ order: 1 }),
        Player.PublishNowPlaying,
      ),
      inside(
        onScreen,
        see(pageTitle("Electro")).toExist(),
        see(playRow(TITLE)).toHaveAttr("aria-current", "true"),
        see(playRow("Technologic")).not.toHaveAttr("aria-current"),
      ),
      see(island).toExist(),
      resolveStart(1),
      thresholdPasses(1),
    ));
});

describe("rules 1 and 9: the pages a genre leads to, and the genre behind them", () => {
  test("an album chosen from its shelf holds the genre and marks the tile; then the album takes the screen over it", () =>
    scene(
      app,
      given(onGenre),
      Subscription.emit(clickedLink(albumPath(album.id))),
      inside(
        onScreen,
        see(pageTitle("Electro")).toExist(),
        see(albumTile).toHaveAttr("aria-busy", "true"),
        expectAll(records).toHaveCount(1),
      ),
      Command.resolve(Catalog.AlbumDetail, reply.album(nextId(onGenre))),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusPage, Message.CompletedFocusPage()],
      ),
      inside(onScreen, see(pageTitle("Discovery")).toExist()),
      // The genre is behind the album, and Genres behind the genre: each as it was left.
      inside(keptGenre, expectAll(all.role("listitem")).not.toHaveCount(0)),
      inside(keptGenres, expectAll(all.role("link")).toHaveCount(2)),
      ...["genres-page", "genre-page", "genre-page-title", "genre-top-songs", "album-page"].map(
        (id) => expectAll(all.selector(`[id="${id}"]`)).toHaveCount(1),
      ),
    ));

  test("back from the album, the genre is the page on screen again, not built anew, the focus on the album's tile", () =>
    scene(
      app,
      given(onAlbumFromGenre),
      Subscription.emit(changedUrl(genrePath(genre.id))),
      Command.expectHas(FocusAlbumTile),
      Command.resolve(FocusAlbumTile, Message.CompletedFocusAlbumTile()),
      Command.resolve(Catalog.GenreDetail, reply.genre(nextId(onAlbumFromGenre))),
      inside(onScreen, see(pageTitle("Electro")).toExist()),
      see(keptGenre).toBeAbsent(),
      see(selector("#album-page")).toBeAbsent(),
    ));

  test("back from an artist chosen from its shelf, the focus goes to the artist's tile on the genre's page", () => {
    const onArtistFromGenre = answered(
      chose(onGenre, artistPath(artist.id)),
      reply.artist,
      artistPath(artist.id),
    );

    scene(
      app,
      given(onArtistFromGenre),
      inside(onScreen, see(pageTitle("Daft Punk")).toExist()),
      inside(keptGenre, expectAll(all.role("listitem")).not.toHaveCount(0)),
      Subscription.emit(changedUrl(genrePath(genre.id))),
      Command.expectHas(FocusArtistTile),
      Command.resolve(FocusArtistTile, Message.CompletedFocusArtistTile()),
      Command.resolve(Catalog.GenreDetail, reply.genre(nextId(onArtistFromGenre))),
      inside(onScreen, see(pageTitle("Electro")).toExist()),
    );
  });

  test("behind a song opened from one of its rows, the genre's page is kept, and comes back with the focus on that row", () => {
    const onSongFromGenre = answered(
      after(onGenre, choseFromRow("Genre", track.id, "OpenSong")),
      reply.track,
      trackPath(track.id),
    );

    scene(
      app,
      given(onSongFromGenre),
      inside(onScreen, see(pageTitle(TITLE)).toExist()),
      inside(keptGenre, inside(topSongs, expectAll(all.role("listitem")).toHaveCount(2))),
      expectAll(all.selector("main .invisible #genre-page")).toHaveCount(1),
      Subscription.emit(changedUrl(genrePath(genre.id))),
      Command.resolve(FocusTrackRow, Message.CompletedFocusTrackRow()),
      Command.resolve(Catalog.GenreDetail, reply.genre(nextId(onSongFromGenre))),
      inside(onScreen, see(pageTitle("Electro")).toExist()),
      see(selector("#track-page")).toBeAbsent(),
    );
  });
});
