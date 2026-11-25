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
  scene,
  selector,
  Subscription,
  text,
} from "foldkit/scene";
import { describe, expect, test } from "vitest";
import { Catalog } from "../src/catalog.ts";
import {
  FocusAlbumTile,
  FocusArtistTile,
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
  album,
  albumPath,
  answered,
  arrived,
  artist,
  artistPath,
  changedUrl,
  chose,
  choseFromRow,
  clickedLink,
  nextId,
  onArtist,
  onHome,
  onSearch,
  opened,
  openingArtistFromTile,
  pressedMore,
  reply,
  track,
} from "./fixtures.ts";

const app = { update, view };

const TITLE = "Harder, Better, Faster, Stronger";

const navigation = role("navigation", { name: "Main" });
const pageTitle = (name: string | RegExp) => role("heading", { name, level: 1 });
const sectionTitle = (name: string) => role("heading", { name, level: 2 });
const onScreen = selector('[role="region"]:not([inert])');
const keptArtist = selector("#artist-page[inert]");
const topSongs = role("list", { name: "Top songs" });
const albums = role("list", { name: "Albums" });
const more = (title: string) => role("button", { name: `More: ${title}` });
const playRow = (title: string) => role("button", { name: new RegExp(`^Play: ${title}`) });
const item = (name: string) => role("menuitem", { name });
const items = all.role("menuitem");
const tryAgain = role("button", { name: "Try again" });
const tryAgainButtons = all.role("button", { name: /^Try again/ });
const backControl = role("button", { name: "Back" });
const homeControl = role("link", { name: "Home" });
// NOTE: by its mark and not by its name: an album's tile names its artist too.
const artistTile = selector(`a[data-artist-tile="${artist.id}"]`);
const albumTile = role("link", { name: /Discovery/ });
const spinners = all.selector("svg.animate-spin");
const island = role("region", { name: "Player" });
const placeholderBlocks = all.selector('[aria-busy="true"] [aria-hidden="true"] .animate-pulse');

/** An open menu entered the document: its backdrop was put behind it and it was placed by its control. */
const menuEnters = Mount.resolveAll(
  [Menu.PortalMenuBackdrop, Menu.Message.CompletedPortalMenuBackdrop()],
  [Menu.AnchorMenu, Menu.Message.CompletedAnchorMenu()],
);

/** An album chosen from the artist's own shelf: the artist is behind its page. */
const openingAlbumFromArtist: Model = chose(onArtist, albumPath(album.id));
const onAlbumFromArtist: Model = answered(openingAlbumFromArtist, reply.album, albumPath(album.id));

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
);

/** The threshold passes with nothing heard from the engine. */
const thresholdPasses = (order: number) =>
  Command.resolve(
    Player.WaitBeforeShowingActivity,
    Player.Message.CompletedWaitBeforeShowingActivity({ order }),
  );

describe("rule 5: a direct link paints the artist page's shape", () => {
  test("placeholders stand for the picture, the name, the rows and the tiles, under the real titles", () =>
    scene(
      app,
      given(opened(artistPath(artist.id))),
      // Said, not shown: the placeholders stand where the name will be.
      see(pageTitle("Artist")).toHaveClass("sr-only"),
      see(sectionTitle("Top songs")).toExist(),
      see(sectionTitle("Albums")).toExist(),
      expectAll(placeholderBlocks).not.toHaveCount(0),
      // The picture's place is round, as the picture will be.
      see(selector('#artist-page [aria-hidden="true"] .rounded-full.animate-pulse')).toExist(),
      see(topSongs).toBeAbsent(),
      see(albums).toBeAbsent(),
      // Nothing is behind a page reached by its address: its way out leads Home.
      see(homeControl).toHaveAttr("href", "/"),
      see(backControl).toBeAbsent(),
      see(text("Loading Artist")).toExist(),
    ));

  test("the reply fills the page in", () =>
    scene(
      app,
      given(opened(artistPath(artist.id))),
      Subscription.emit(arrived(reply.artist("page:0"))),
      see(pageTitle("Daft Punk")).toExist(),
      expectAll(placeholderBlocks).toHaveCount(0),
      inside(topSongs, expectAll(all.role("listitem")).toHaveCount(2)),
      inside(albums, expectAll(all.role("link")).toHaveCount(1)),
      see(text("Showing Daft Punk")).toExist(),
    ));
});

describe("the artist page", () => {
  test("shows the picture, round, beside the name, over their top songs in order and their albums", () =>
    scene(
      app,
      given(onArtist),
      inside(
        onScreen,
        see(pageTitle("Daft Punk")).toExist(),
        // The rendition the tile already loaded is drawn at once, in a round box.
        see(selector('img[src="https://img.test/ar-1/small.jpg"][decoding="sync"]')).toExist(),
        see(selector('img[src="https://img.test/ar-1/medium.jpg"][decoding="async"]')).toExist(),
        see(selector(".aspect-square.rounded-full img")).toExist(),
        see(sectionTitle("Top songs")).toExist(),
        inside(
          topSongs,
          expectAll(all.role("listitem")).toHaveCount(2),
          // Each row plays, as a row of any list does, and is numbered: most played first.
          see(playRow(TITLE)).toContainText("3:44"),
          see(playRow(TITLE)).toContainText("1"),
          see(playRow("Technologic")).toContainText("2"),
        ),
        see(sectionTitle("Albums")).toExist(),
        inside(
          albums,
          expectAll(all.role("link")).toHaveCount(1),
          see(albumTile).toHaveAttr("href", "/album/al-1"),
          see(albumTile).toHaveAttr("aria-busy", "false"),
        ),
        // Opened from a shelf: the way out goes back through the history.
        see(backControl).toExist(),
      ),
      // An artist is not a section: no item is the current page.
      inside(navigation, expectAll(all.selector("[aria-current]")).toHaveCount(0)),
    ));

  test("the document is titled after the artist", () => {
    expect(documentTitle(onArtist)).toBe("Daft Punk · Bafle");
    expect(documentTitle(opened(artistPath(artist.id)))).toBe("Artist · Bafle");
  });

  test("its rows open their menu, which offers the album and the song", () =>
    scene(
      app,
      given(after(onArtist, pressedMore("Artist", track.id))),
      menuEnters,
      inside(onScreen, see(more(TITLE)).toHaveAttr("aria-expanded", "true")),
      expectAll(items).toHaveCount(2),
      see(item("Go to album")).toExist(),
      see(item("Song details")).toExist(),
    ));

  test("an artist with no songs and no albums says so in place of both", () =>
    scene(
      app,
      given(
        answered(opened(artistPath(artist.id)), (id) =>
          reply.artist(id, { ...reply.artist(id).result, topTracks: [], albums: [] }),
        ),
      ),
      see(pageTitle("Daft Punk")).toExist(),
      see(sectionTitle("Top songs")).toBeAbsent(),
      see(sectionTitle("Albums")).toBeAbsent(),
      see(text("The catalog lists no songs or albums for this artist.")).toExist(),
    ));

  test("an artist the catalog has no picture of gets the mark that stands for none", () =>
    scene(
      app,
      given(
        answered(opened(artistPath(artist.id)), (id) =>
          reply.artist(id, { ...reply.artist(id).result, picture: null, albums: [] }),
        ),
      ),
      inside(
        selector("#artist-page .aspect-square.rounded-full"),
        expectAll(all.selector("img")).toHaveCount(0),
        expectAll(all.selector("svg")).toHaveCount(1),
      ),
    ));

  test("opening it and leaving it are swaps like any other: they ask for a transition", () => {
    expect(
      viewTransition({
        previousModel: openingArtistFromTile,
        model: onArtist,
        message: changedUrl(artistPath(artist.id)),
      }),
    ).toEqual({ types: ["show-detail", `artist-picture-${artist.id}`] });
    // Held on the shelf while the artist loads, nothing swaps.
    expect(
      viewTransition({
        previousModel: onHome,
        model: openingArtistFromTile,
        message: clickedLink(artistPath(artist.id)),
      }),
    ).toBe(false);
  });
});

describe("artist tiles lead to the artist's page", () => {
  test("on Home and Search an artist's tile is a link to their page", () => {
    scene(
      app,
      given(onHome),
      inside(
        role("list", { name: "Top artists" }),
        expectAll(all.role("link")).toHaveCount(1),
        see(artistTile).toHaveAttr("href", "/artist/ar-1"),
        see(artistTile).toHaveAttr("aria-busy", "false"),
        see(artistTile).toContainText("Daft Punk"),
      ),
    );
    scene(
      app,
      given(onSearch),
      inside(
        role("list", { name: "Artists" }),
        see(artistTile).toHaveAttr("href", "/artist/ar-1"),
      ),
    );
  });

  test("the page is held and the tile shows that the artist is on their way; then they take the screen", () =>
    scene(
      app,
      given(onHome),
      inside(artistTile, expectAll(spinners).toHaveCount(0)),
      Subscription.emit(clickedLink(artistPath(artist.id))),
      inside(
        onScreen,
        see(pageTitle("Home")).toExist(),
        see(artistTile).toHaveAttr("aria-busy", "true"),
        // The spinner lies over the picture, which stays; it is round, as the picture is.
        inside(
          artistTile,
          expectAll(spinners).toHaveCount(1),
          expectAll(all.selector("img")).toHaveCount(1),
          see(selector("span.rounded-full")).toExist(),
        ),
        // Only the tile that was chosen says so.
        expectAll(spinners).toHaveCount(1),
        see(albumTile).toHaveAttr("aria-busy", "false"),
      ),
      inside(navigation, expectAll(all.selector('[aria-busy="true"]')).toHaveCount(0)),
      // No row speaks for them, so the page's status does.
      see(text("Loading Artist")).toExist(),
      Command.resolve(Catalog.ArtistDetail, reply.artist(nextId(onHome))),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusPage, Message.CompletedFocusPage()],
      ),
      inside(onScreen, see(pageTitle("Daft Punk")).toExist()),
      // Home is kept behind them, its tile at rest again.
      inside(
        selector("#home-page[inert]"),
        see(selector("a[data-artist-tile]")).toHaveAttr("aria-busy", "false"),
      ),
    ));

  test("the tile's picture and the page's carry one name, on the page on screen only", () => {
    const name = "artist-picture-ar-1";
    scene(
      app,
      given(onHome),
      inside(artistTile, see(selector("div.relative")).toHaveStyle("view-transition-name", name)),
    );
    scene(
      app,
      given(onArtist),
      // Kept behind the artist, Home's tile gives the name up: the page's picture has it.
      inside(
        selector("#home-page[inert]"),
        inside(artistTile, see(selector("div.relative")).not.toHaveStyle("view-transition-name")),
      ),
      see(selector("#artist-page .aspect-square.rounded-full")).toHaveStyle(
        "view-transition-name",
        name,
      ),
    );
  });

  test("a failure is said on the artist's page, with Try again: a tile has no room for it", () =>
    scene(
      app,
      given(openingArtistFromTile),
      Subscription.emit(arrived(reply.artistRefused(nextId(onHome)))),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusPage, Message.CompletedFocusPage()],
      ),
      inside(
        onScreen,
        see(pageTitle("Artist")).toExist(),
        see(role("alert")).toContainText("Artist could not load."),
        see(role("alert")).toContainText("The music catalog is not answering right now."),
        see(tryAgain).toExist(),
        see(backControl).toExist(),
      ),
      click(tryAgain),
      Command.expectExact(Catalog.ArtistDetail, FocusPage),
      Command.resolve(FocusPage, Message.CompletedFocusPage()),
      Command.resolve(Catalog.ArtistDetail, reply.artist("page:2")),
      inside(onScreen, see(pageTitle("Daft Punk")).toExist(), see(role("alert")).toBeAbsent()),
    ));

  test("a lost connection is worded as one", () =>
    scene(
      app,
      given(answered(openingArtistFromTile, reply.artistLost, artistPath(artist.id))),
      see(role("alert")).toContainText("Bafle could not be reached. Check your connection."),
    ));

  test("an artist the catalog does not have says so on their page for good: a way out, and no Try again", () =>
    scene(
      app,
      given(answered(openingArtistFromTile, reply.artistMissing, artistPath(artist.id))),
      inside(
        onScreen,
        see(pageTitle("This artist is not available")).toExist(),
        see(text("The catalog no longer has them, or the link to them is wrong.")).toExist(),
        see(backControl).toExist(),
        expectAll(tryAgainButtons).toHaveCount(0),
      ),
    ));
});

describe("rule 1: an album chosen on the artist's page holds it", () => {
  test("from their shelf: the tile says the album is on its way, and the album takes the screen when it arrives", () =>
    scene(
      app,
      given(onArtist),
      Subscription.emit(clickedLink(albumPath(album.id))),
      inside(
        onScreen,
        see(pageTitle("Daft Punk")).toExist(),
        see(albumTile).toHaveAttr("aria-busy", "true"),
        inside(albumTile, expectAll(spinners).toHaveCount(1)),
      ),
      see(text("Loading Album")).toExist(),
      Command.resolve(Catalog.AlbumDetail, reply.album(nextId(onArtist))),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusPage, Message.CompletedFocusPage()],
      ),
      inside(onScreen, see(pageTitle("Discovery")).toExist()),
    ));

  test("from a row's menu: the row that asked says so, and the tile of the same album is a plain tile", () =>
    scene(
      app,
      given(after(onArtist, choseFromRow("Artist", track.id, "OpenAlbum"))),
      inside(
        onScreen,
        see(pageTitle("Daft Punk")).toExist(),
        see(more(TITLE)).toHaveAttr("aria-busy", "true"),
        see(text("Opening the album…")).toHaveAttr("role", "status"),
        see(albumTile).toHaveAttr("aria-busy", "false"),
      ),
      // The page's own status leaves it to the row.
      see(text("Showing Daft Punk")).toExist(),
    ));
});

describe("rule 9: the pages around an artist are found as they were left", () => {
  test("back from the artist, the shelf is the page on screen again, the focus on their tile, and their page is gone", () =>
    scene(
      app,
      given(onArtist),
      inside(selector("#home-page[inert]"), expectAll(all.role("listitem")).not.toHaveCount(0)),
      Subscription.emit(changedUrl("/")),
      Command.expectHas(FocusArtistTile),
      Command.resolve(FocusArtistTile, Message.CompletedFocusArtistTile()),
      Command.resolve(Catalog.HomeFeed, reply.home(nextId(onArtist))),
      inside(onScreen, see(pageTitle("Home")).toExist()),
      see(selector("#artist-page")).toBeAbsent(),
      expectAll(spinners).toHaveCount(0),
    ));

  test("behind an album chosen from it, the artist's page is kept: in the document, hidden, with its rows and its shelf", () =>
    scene(
      app,
      given(onAlbumFromArtist),
      inside(onScreen, see(pageTitle("Discovery")).toExist()),
      inside(
        keptArtist,
        expectAll(all.selector("[data-track]")).toHaveCount(2),
        expectAll(all.selector("a[data-album-tile]")).toHaveCount(1),
      ),
      expectAll(all.selector("main .invisible #artist-page")).toHaveCount(1),
      // Every id is still the id of one element.
      ...[
        "artist-page",
        "artist-page-title",
        "artist-top-songs",
        "artist-albums",
        "album-page",
        "album-page-title",
        "album-songs",
      ].map((id) => expectAll(all.selector(`[id="${id}"]`)).toHaveCount(1)),
      // Back from the album, the artist is the page on screen again, not built anew.
      Subscription.emit(changedUrl(artistPath(artist.id))),
      Command.expectHas(FocusAlbumTile),
      Command.resolve(FocusAlbumTile, Message.CompletedFocusAlbumTile()),
      Command.resolve(Catalog.ArtistDetail, reply.artist(nextId(onAlbumFromArtist))),
      inside(onScreen, see(pageTitle("Daft Punk")).toExist()),
      see(keptArtist).toBeAbsent(),
      see(selector("#album-page")).toBeAbsent(),
    ));

  test("back from a song opened from one of their rows, the focus is on that row", () => {
    const onSongFromArtist = answered(
      after(onArtist, choseFromRow("Artist", track.id, "OpenSong")),
      reply.track,
      `/track/${track.id}`,
    );

    scene(
      app,
      given(onSongFromArtist),
      inside(keptArtist, expectAll(all.selector("[data-track]")).toHaveCount(2)),
      Subscription.emit(changedUrl(artistPath(artist.id))),
      Command.resolve(FocusTrackRow, Message.CompletedFocusTrackRow()),
      Command.resolve(Catalog.ArtistDetail, reply.artist(nextId(onSongFromArtist))),
      inside(onScreen, see(pageTitle("Daft Punk")).toExist()),
      see(selector("#track-page")).toBeAbsent(),
    );
  });
});

describe("playing from the artist's page", () => {
  test("a tap on a row starts its track, and the page stays as it is, with the island over its foot", () =>
    scene(
      app,
      given(onArtist),
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
      // Playing is no navigation: the page on screen is the one it was.
      inside(
        onScreen,
        see(pageTitle("Daft Punk")).toExist(),
        // The row shows it was chosen, and only that row.
        see(playRow(TITLE)).toHaveAttr("aria-current", "true"),
        see(playRow("Technologic")).not.toHaveAttr("aria-current"),
      ),
      see(island).toExist(),
      resolveStart(1),
      thresholdPasses(1),
    ));
});
