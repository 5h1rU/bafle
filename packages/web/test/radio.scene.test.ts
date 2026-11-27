import { Menu } from "@foldkit/ui";
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
  FocusPage,
  FocusStationTile,
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
  barPainted,
  album,
  albumPath,
  answered,
  arrived,
  changedUrl,
  chose,
  choseFromRow,
  clickedLink,
  genre,
  nextId,
  onHome,
  onRadio,
  onStation,
  opened,
  openingStationFromTile,
  otherGenre,
  otherStation,
  pressedMore,
  reply,
  scene,
  station,
  stationPath,
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
const keptRadio = selector("#radio-page[inert]");
const keptStation = selector("#station-page[inert]");
const songs = role("list", { name: "Songs" });
const more = (title: string) => role("button", { name: `More: ${title}` });
const playRow = (title: string) => role("button", { name: new RegExp(`^Play: ${title}`) });
const item = (name: string) => role("menuitem", { name });
const items = all.role("menuitem");
const tryAgain = role("button", { name: "Try again" });
const tryAgainButtons = all.role("button", { name: /^Try again/ });
const backControl = role("button", { name: "Back" });
const homeControl = role("link", { name: "Home" });
const stationTile = role("link", { name: "French House" });
const otherStationTile = role("link", { name: "Club Classics" });
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

const picture = {
  small: "https://img.test/st-1/small.jpg",
  medium: "https://img.test/st-1/medium.jpg",
  large: "https://img.test/st-1/large.jpg",
  placeholder: null,
};

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

/** Home still on screen; the listener chose Radio from the menu, which has never loaded. */
const leavingHomeForRadio: Model = chose(onHome, "/radio");

/** Radio on screen, reached from Home by the menu: both sections hold data. */
const onRadioFromHome: Model = answered(leavingHomeForRadio, reply.radio, "/radio");

/** A song of the station opened from the station's own row: the station is behind its page. */
const onSongFromStation: Model = answered(
  after(onStation, choseFromRow("Station", track.id, "OpenSong")),
  reply.track,
  trackPath(track.id),
);

describe("rule 5: Radio opens in its shape", () => {
  test("shelves of blocks stand where the stations will be, each under a block for its title", () =>
    scene(
      app,
      given(opened("/radio")),
      see(pageTitle("Radio")).toExist(),
      // Which genres have stations is the catalog's to say: no title is drawn before it does.
      expectAll(all.role("heading", { level: 2 })).toHaveCount(0),
      expectAll(placeholders).not.toHaveCount(0),
      expectAll(placeholderBlocks).not.toHaveCount(0),
      see(text("Loading Radio")).toExist(),
      see(destination("Radio")).toHaveAttr("aria-current", "page"),
    ));

  test("the reply fills it: a shelf of stations under the name of the genre each belongs to", () =>
    scene(
      app,
      given(opened("/radio")),
      Subscription.emit(arrived(reply.radio("page:0"))),
      Command.resolveAll(barPainted, ...aheadUnanswered(1, "Home", "New", "Genres")),
      expectAll(placeholderBlocks).toHaveCount(0),
      see(sectionTitle("Electro")).toExist(),
      see(sectionTitle("Dance")).toExist(),
      inside(
        role("list", { name: "Electro" }),
        expectAll(all.role("link")).toHaveCount(1),
        see(stationTile).toHaveAttr("href", "/station/st-1"),
        see(stationTile).toHaveAttr("aria-busy", "false"),
        // No picture: the mark for none.
        inside(stationTile, expectAll(all.selector("img")).toHaveCount(0)),
      ),
      inside(
        role("list", { name: "Dance" }),
        see(otherStationTile).toHaveAttr("href", "/station/st-2"),
        see(selector(`img[src="${otherStation.picture?.medium}"]`)).toExist(),
      ),
      // A shelf's tiles are all links: the row takes no focus of its own.
      see(role("list", { name: "Electro" })).not.toHaveAttr("tabindex"),
      see(text("Showing Radio")).toExist(),
    ));

  test("a genre left with no station has no shelf, and a catalog with no stations says so", () => {
    scene(
      app,
      given(
        answered(opened("/radio"), (id) =>
          reply.radio(id, {
            groups: [
              { genre: { id: genre.id, name: genre.name }, stations: [] },
              { genre: { id: otherGenre.id, name: otherGenre.name }, stations: [otherStation] },
            ],
          }),
        ),
      ),
      see(sectionTitle("Dance")).toExist(),
      see(sectionTitle("Electro")).toBeAbsent(),
    );
    scene(
      app,
      given(answered(opened("/radio"), (id) => reply.radio(id, { groups: [] }))),
      see(text("The catalog has no stations right now.")).toExist(),
      expectAll(all.role("heading", { level: 2 })).toHaveCount(0),
    );
  });
});

describe("rule 1: Radio chosen from the menu holds the page and marks its item", () => {
  test("the page stays while the item shows it is loading; then the section swaps in", () =>
    scene(
      app,
      given(onHome),
      Subscription.emit(clickedLink("/radio")),
      see(pageTitle("Home")).toExist(),
      see(destination("Home")).toHaveAttr("aria-current", "page"),
      see(destination("Radio")).toHaveAttr("aria-busy", "true"),
      // Its icon breathes where it stands, and the navigation marks it at once:
      // the page on screen is still the one `aria-current` names.
      inside(destination("Radio"), expectAll(all.selector("svg.nav-breathes")).toHaveCount(1)),
      see(destination("Radio")).toHaveAttr("data-marked", ""),
      see(destination("Radio")).not.toHaveAttr("aria-current"),
      see(destination("Genres")).toHaveAttr("aria-busy", "false"),
      see(text("Loading Radio")).toExist(),
      Command.resolve(Catalog.StationList, reply.radio(nextId(onHome))),
      Command.expectExact(NavigateInternal),
      Command.resolve(NavigateInternal, Message.CompletedNavigateInternal()),
      inside(onScreen, see(pageTitle("Radio")).toExist(), see(pageTitle("Home")).toBeAbsent()),
      see(destination("Radio")).toHaveAttr("aria-current", "page"),
      see(destination("Radio")).toHaveAttr("aria-busy", "false"),
      see(text("Showing Radio")).toExist(),
    ));

  test("drawn back, the circle shows Radio, and on a station's page too", () => {
    scene(
      app,
      given(after(onRadio, Message.ScrolledDown())),
      see(circle).toHaveAttr("data-section", "Radio"),
      see(selector("#main-navigation li.dock-current a")).toHaveAttr("href", "/radio"),
    );
    scene(
      app,
      given(after(onStation, Message.ScrolledDown())),
      see(circle).toHaveAttr("data-section", "Radio"),
    );
  });
});

describe("rule 6: Radio says its failure on the page", () => {
  test("with Try again, which loads it where it stands", () => {
    const failed = answered(leavingHomeForRadio, reply.radioLost, "/radio");

    scene(
      app,
      given(failed),
      inside(onScreen, see(pageTitle("Radio")).toExist()),
      inside(
        role("alert"),
        see(text("Radio could not load.")).toExist(),
        see(text("Bafle could not be reached. Check your connection.")).toExist(),
      ),
      click(tryAgain),
      Command.resolve(FocusPage, Message.CompletedFocusPage()),
      see(role("alert")).toBeAbsent(),
      expectAll(placeholderBlocks).not.toHaveCount(0),
      Command.resolve(Catalog.StationList, reply.radio(nextId(failed))),
      inside(onScreen, see(stationTile).toExist()),
    );
  });
});

describe("rules 4 and 9: Radio is kept once loaded", () => {
  test("behind another section it stays in the document, hidden, with its shelves; chosen again it is there at once", () =>
    scene(
      app,
      given(after(onRadioFromHome, changedUrl("/"))),
      inside(onScreen, see(pageTitle("Home")).toExist()),
      inside(keptRadio, expectAll(all.role("link")).toHaveCount(2)),
      expectAll(all.selector("main .invisible #radio-page")).toHaveCount(1),
      Subscription.emit(clickedLink("/radio")),
      inside(onScreen, see(pageTitle("Radio")).toExist(), see(stationTile).toExist()),
      expectAll(placeholderBlocks).toHaveCount(0),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [Catalog.StationList, reply.radio(nextId(after(onRadioFromHome, changedUrl("/"))))],
      ),
    ));
});

describe("a station's tile leads to the station's page", () => {
  test("Radio is held and the tile shows that its station is on its way; then the station takes the screen", () =>
    scene(
      app,
      given(onRadio),
      inside(stationTile, expectAll(records).toHaveCount(0)),
      Subscription.emit(clickedLink(stationPath(station.id))),
      inside(
        onScreen,
        see(pageTitle("Radio")).toExist(),
        see(stationTile).toHaveAttr("aria-busy", "true"),
        inside(stationTile, expectAll(records).toHaveCount(1)),
        // Only the tile that was chosen says so.
        expectAll(records).toHaveCount(1),
        see(otherStationTile).toHaveAttr("aria-busy", "false"),
      ),
      inside(navigation, expectAll(all.selector('[aria-busy="true"]')).toHaveCount(0)),
      // No row speaks for it, so the page's status does.
      see(text("Loading Station")).toExist(),
      Command.resolve(Catalog.StationDetail, reply.station(nextId(onRadio))),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusPage, Message.CompletedFocusPage()],
      ),
      inside(onScreen, see(pageTitle("French House")).toExist()),
      // Radio is kept behind it, its tile at rest again.
      inside(
        keptRadio,
        see(selector("a[data-station-tile='st-1']")).toHaveAttr("aria-busy", "false"),
      ),
      // A station is not a section: no item is the current page.
      inside(navigation, expectAll(all.selector("[aria-current]")).toHaveCount(0)),
    ));

  test("the tile's picture and the page's carry one name, on the page on screen only", () => {
    const name = "station-picture-st-1";
    scene(
      app,
      given(onRadio),
      inside(stationTile, see(selector("[data-sleeve]")).toHaveStyle("view-transition-name", name)),
    );
    scene(
      app,
      given(onStation),
      inside(
        selector("#radio-page[inert] a[data-station-tile='st-1']"),
        see(selector("[data-sleeve]")).not.toHaveStyle("view-transition-name"),
      ),
      see(selector("#station-page .aspect-square.rounded-xl")).toHaveStyle(
        "view-transition-name",
        name,
      ),
    );
    expect(
      viewTransition({
        previousModel: openingStationFromTile,
        model: onStation,
        message: changedUrl(stationPath(station.id)),
      }),
    ).toEqual({ types: ["open-detail", name] });
  });

  test("a failure is said on the station's page, with Try again: a tile has no room for it", () =>
    scene(
      app,
      given(openingStationFromTile),
      Subscription.emit(arrived(reply.stationRefused(nextId(onRadio)))),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusPage, Message.CompletedFocusPage()],
      ),
      inside(
        onScreen,
        see(pageTitle("Station")).toExist(),
        see(role("alert")).toContainText("Station could not load."),
        see(role("alert")).toContainText("The music catalog is not answering right now."),
        see(tryAgain).toExist(),
      ),
      click(tryAgain),
      Command.expectExact(Catalog.StationDetail, FocusPage),
      Command.resolve(FocusPage, Message.CompletedFocusPage()),
      Command.resolve(Catalog.StationDetail, reply.station("page:3")),
      inside(
        onScreen,
        see(pageTitle("French House")).toExist(),
        see(role("alert")).toBeAbsent(),
      ),
    ));

  test("a station the catalog does not have says so on its page for good, with no Try again", () =>
    scene(
      app,
      given(answered(openingStationFromTile, reply.stationMissing, stationPath(station.id))),
      inside(
        onScreen,
        see(pageTitle("This station is not available")).toExist(),
        see(text("The catalog no longer has it, or the link to it is wrong.")).toExist(),
        expectAll(tryAgainButtons).toHaveCount(0),
      ),
    ));

  test("back from the station, Radio is the page on screen again, the focus on its tile, and the station's page is gone", () =>
    scene(
      app,
      given(onStation),
      inside(keptRadio, expectAll(all.role("link")).toHaveCount(2)),
      Subscription.emit(changedUrl("/radio")),
      Command.expectHas(FocusStationTile),
      Command.resolve(FocusStationTile, Message.CompletedFocusStationTile()),
      Command.resolve(Catalog.StationList, reply.radio(nextId(onStation))),
      inside(onScreen, see(pageTitle("Radio")).toExist()),
      see(selector("#station-page")).toBeAbsent(),
      expectAll(spinners).toHaveCount(0),
    ));
});

describe("rule 5: a direct link paints the station page's shape", () => {
  test("placeholders stand for the picture, the title and the rows, under the list's real title", () =>
    scene(
      app,
      given(opened(stationPath(station.id))),
      // Said, not shown: the placeholders stand where the title will be.
      see(pageTitle("Station")).toHaveClass("sr-only"),
      see(sectionTitle("Songs")).toExist(),
      expectAll(placeholderBlocks).not.toHaveCount(0),
      see(songs).toBeAbsent(),
      // No page has a control of its own to leave it by: the navigation is the way out.
      inside(onScreen, see(homeControl).toBeAbsent(), see(backControl).toBeAbsent()),
      see(text("Loading Station")).toExist(),
    ));

  test("the reply fills the page in", () =>
    scene(
      app,
      given(opened(stationPath(station.id))),
      Subscription.emit(arrived(reply.station("page:0"))),
      Command.resolveAll(barPainted, ...aheadUnanswered(1, "Home", "New", "Genres", "Radio")),
      see(pageTitle("French House")).toExist(),
      expectAll(placeholderBlocks).toHaveCount(0),
      inside(songs, expectAll(all.role("listitem")).toHaveCount(3)),
      see(text("Showing French House")).toExist(),
    ));
});

describe("the station page", () => {
  test("shows the title, what it is and how many songs, over the songs in the order the station plays them", () =>
    scene(
      app,
      given(onStation),
      inside(
        onScreen,
        see(pageTitle("French House")).toExist(),
        see(text("Station")).toExist(),
        see(text("3 songs")).toExist(),
        see(sectionTitle("Songs")).toExist(),
        inside(
          songs,
          expectAll(all.role("listitem")).toHaveCount(3),
          // Each row plays, as a row of any list does, with its own cover: the songs come from many albums.
          see(playRow("Technologic")).toContainText("4:05"),
          see(playRow(TITLE)).toContainText("Daft Punk"),
          see(selector('img[src="https://img.test/al-1/small.jpg"]')).toExist(),
          see(text("This song has no audio to play.")).toExist(),
        ),
        // The order is the station's, not a chart: the rows are not numbered.
        see(selector("#station-page ul[aria-labelledby='station-songs']")).toExist(),
        see(selector("#station-page ol")).toBeAbsent(),
        // Nor has one opened from a list: the browser's Back is the way back.
        see(backControl).toBeAbsent(),
      ),
    ));

  test("its picture is drawn from the rendition the tile loaded, under the larger one; without one, the mark for none", () => {
    scene(
      app,
      given(
        answered(opened(stationPath(station.id)), (id) =>
          reply.station(id, { ...reply.station(id).result, picture }),
        ),
      ),
      see(selector(`img[src="${picture.small}"][decoding="sync"]`)).toExist(),
      see(selector(`img[src="${picture.medium}"][decoding="async"]`)).toExist(),
    );
    scene(
      app,
      given(onStation),
      inside(
        selector("#station-page .aspect-square.rounded-xl"),
        expectAll(all.selector("img")).toHaveCount(0),
        expectAll(all.selector("svg")).toHaveCount(1),
      ),
    );
  });

  test("the document is titled after the station", () => {
    expect(documentTitle(onStation)).toBe("French House · Bafle");
    expect(documentTitle(opened(stationPath(station.id)))).toBe("Station · Bafle");
    expect(documentTitle(onRadio)).toBe("Radio · Bafle");
  });

  test("its rows open their menu, which offers the album and the song", () =>
    scene(
      app,
      given(after(onStation, pressedMore("Station", track.id))),
      menuEnters,
      inside(onScreen, see(more(TITLE)).toHaveAttr("aria-expanded", "true")),
      expectAll(items).toHaveCount(2),
      see(item("Go to album")).toExist(),
      see(item("Song details")).toExist(),
    ));

  test("a station of one song says so in the singular, and one with none says so in place of its list", () => {
    scene(
      app,
      given(
        answered(opened(stationPath(station.id)), (id) =>
          reply.station(id, { ...reply.station(id).result, tracks: [track] }),
        ),
      ),
      see(text("1 song")).toExist(),
    );
    scene(
      app,
      given(
        answered(opened(stationPath(station.id)), (id) =>
          reply.station(id, { ...reply.station(id).result, tracks: [] }),
        ),
      ),
      see(pageTitle("French House")).toExist(),
      see(text("0 songs")).toExist(),
      see(text("The catalog lists no songs for this station.")).toExist(),
    );
  });
});

describe("rule 1: Go to album on a row of the station holds it and marks the row", () => {
  test("the row that asked says so, and the album takes the screen when it arrives", () =>
    scene(
      app,
      given(after(onStation, pressedMore("Station", track.id))),
      menuEnters,
      click(item("Go to album")),
      inside(onScreen, see(pageTitle("French House")).toExist()),
      see(more(TITLE)).toHaveAttr("aria-expanded", "true"),
      inside(item("Go to album"), expectAll(spinners).toHaveCount(1)),
      // The row speaks for it: the page's own status does not.
      see(text("Showing French House")).toExist(),
      Command.resolve(Catalog.AlbumDetail, reply.album(nextId(onStation))),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusPage, Message.CompletedFocusPage()],
      ),
      // The menu went with the page it was on.
      Mount.expectEnded(Menu.PortalMenuBackdrop, Menu.AnchorMenu),
      inside(onScreen, see(pageTitle("Discovery")).toExist()),
      // The station is behind the album, as it was left.
      inside(keptStation, expectAll(all.role("listitem")).toHaveCount(3)),
    ));
});

describe("rule 9: the pages around a station are found as they were left", () => {
  test("behind a song opened from it, the station's page is kept: in the document, hidden, with its rows", () =>
    scene(
      app,
      given(onSongFromStation),
      inside(onScreen, see(pageTitle(TITLE)).toExist()),
      inside(keptStation, expectAll(all.role("listitem")).toHaveCount(3)),
      expectAll(all.selector("main .invisible #station-page")).toHaveCount(1),
      // Every id is still the id of one element.
      ...[
        "radio-page",
        "station-page",
        "station-page-title",
        "station-songs",
        "track-page",
        "track-page-title",
      ].map((id) => expectAll(all.selector(`[id="${id}"]`)).toHaveCount(1)),
      // Back from the song, the station is the page on screen again, not built anew.
      Subscription.emit(changedUrl(stationPath(station.id))),
      // The station is not asked for again: it would be dealt other songs.
      Command.expectExact(FocusTrackRow),
      Command.resolve(FocusTrackRow, Message.CompletedFocusTrackRow()),
      inside(onScreen, see(pageTitle("French House")).toExist()),
      see(keptStation).toBeAbsent(),
      see(selector("#track-page")).toBeAbsent(),
    ));

  test("behind an album asked from one of its rows, the station and the album are both pages of their own", () => {
    const onAlbumFromStation = answered(
      after(onStation, choseFromRow("Station", track.id, "OpenAlbum")),
      reply.album,
      albumPath(album.id),
    );

    scene(
      app,
      given(onAlbumFromStation),
      inside(onScreen, see(pageTitle("Discovery")).toExist()),
      inside(keptStation, expectAll(all.role("listitem")).toHaveCount(3)),
      ...["station-page", "station-songs", "album-page", "album-songs"].map((id) =>
        expectAll(all.selector(`[id="${id}"]`)).toHaveCount(1),
      ),
    );
  });
});

describe("playing from the station's page", () => {
  test("a tap on a row starts its track, and the page stays as it is, with the island over its foot", () =>
    scene(
      app,
      given(onStation),
      see(island).toBeAbsent(),
      inside(onScreen, click(playRow("Technologic"))),
      islandEnters,
      Command.expectExact(
        Player.StartPlayback({
          order: 1,
          source: "https://audio.test/tr-2.mp3",
          positionSeconds: 0,
        }),
        Player.WaitBeforeShowingActivity({ order: 1 }),
        Player.PublishNowPlaying,
      ),
      // Playing is no navigation: the page on screen is the one it was.
      inside(
        onScreen,
        see(pageTitle("French House")).toExist(),
        // The row shows it was chosen, and only that row.
        see(playRow("Technologic")).toHaveAttr("aria-current", "true"),
        see(playRow(TITLE)).not.toHaveAttr("aria-current"),
      ),
      see(island).toExist(),
      resolveStart(1),
      thresholdPasses(1),
    ));
});
