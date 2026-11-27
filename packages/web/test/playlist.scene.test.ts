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
  FocusPlaylistTile,
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
  choseFromRow,
  clickedLink,
  foundMore,
  nextId,
  onHome,
  onPlaylist,
  opened,
  openingPlaylistFromTile,
  playlist,
  playlistPath,
  pressedMore,
  reply,
  scene,
  track,
  trackPath,
} from "./fixtures.ts";

const app = { update, view };

const TITLE = "Harder, Better, Faster, Stronger";

const navigation = role("navigation", { name: "Main" });
const pageTitle = (name: string | RegExp) => role("heading", { name, level: 1 });
const sectionTitle = (name: string) => role("heading", { name, level: 2 });
const onScreen = selector('[role="region"]:not([inert])');
const keptPlaylist = selector("#playlist-page[inert]");
const songs = role("list", { name: "Songs" });
const more = (title: string) => role("button", { name: `More: ${title}` });
const playRow = (title: string) => role("button", { name: new RegExp(`^Play: ${title}`) });
const item = (name: string) => role("menuitem", { name });
const items = all.role("menuitem");
const tryAgain = role("button", { name: "Try again" });
const tryAgainButtons = all.role("button", { name: /^Try again/ });
const backControl = role("button", { name: "Back" });
const homeControl = role("link", { name: "Home" });
const playlistTile = role("link", { name: /French Touch/ });
const albumTile = role("link", { name: /Discovery/ });
const spinners = all.selector("svg.animate-spin");
/** A tile whose page is on its way: its record is out of its sleeve, and turns. */
const records = all.selector("[data-opening]");
const island = role("region", { name: "Player" });
const placeholderBlocks = all.selector('[aria-busy="true"] [aria-hidden="true"] .animate-pulse');

/** An open menu entered the document: its backdrop was put behind it and it was placed by its control. */
const menuEnters = Mount.resolveAll(
  [Menu.PortalMenuBackdrop, Menu.Message.CompletedPortalMenuBackdrop()],
  [Menu.AnchorMenu, Menu.Message.CompletedAnchorMenu()],
);

const picture = {
  small: "https://img.test/pl-1/small.jpg",
  medium: "https://img.test/pl-1/medium.jpg",
  large: "https://img.test/pl-1/large.jpg",
  placeholder: null,
};

/** A song of the playlist opened from the playlist's own row: the playlist is behind its page. */
const onSongFromPlaylist: Model = answered(
  after(onPlaylist, choseFromRow("Playlist", track.id, "OpenSong")),
  reply.track,
  trackPath(track.id),
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

describe("rule 5: a direct link paints the playlist page's shape", () => {
  test("placeholders stand for the picture, the title and the rows, under the list's real title", () =>
    scene(
      app,
      given(opened(playlistPath(playlist.id))),
      // Said, not shown: the placeholders stand where the title will be.
      see(pageTitle("Playlist")).toHaveClass("sr-only"),
      see(sectionTitle("Songs")).toExist(),
      expectAll(placeholderBlocks).not.toHaveCount(0),
      see(songs).toBeAbsent(),
      // No page has a control of its own to leave it by: the navigation is the way out.
      inside(onScreen, see(homeControl).toBeAbsent(), see(backControl).toBeAbsent()),
      see(text("Loading Playlist")).toExist(),
    ));

  test("the reply fills the page in", () =>
    scene(
      app,
      given(opened(playlistPath(playlist.id))),
      Subscription.emit(arrived(reply.playlist("page:0"))),
      Command.resolveAll(barPainted, ...aheadUnanswered(1, "Home", "New", "Genres", "Radio")),
      see(pageTitle("French Touch")).toExist(),
      expectAll(placeholderBlocks).toHaveCount(0),
      inside(songs, expectAll(all.role("listitem")).toHaveCount(3)),
      see(text("Showing French Touch")).toExist(),
    ));
});

describe("the playlist page", () => {
  test("shows the title, who keeps it and how many songs, over the songs in the playlist's order", () =>
    scene(
      app,
      given(onPlaylist),
      inside(
        onScreen,
        see(pageTitle("French Touch")).toExist(),
        see(text("Bafle Editors")).toExist(),
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
        // The order is the keeper's, not a chart: the rows are not numbered.
        see(selector("#playlist-page ul[aria-labelledby='playlist-songs']")).toExist(),
        see(selector("#playlist-page ol")).toBeAbsent(),
        // Nor has one opened from a list: the browser's Back is the way back.
        see(backControl).toBeAbsent(),
      ),
      // A playlist is not a section: no item is the current page.
      inside(navigation, expectAll(all.selector("[aria-current]")).toHaveCount(0)),
    ));

  test("its picture is drawn from the rendition the tile loaded, under the larger one; without one, the mark for none", () => {
    scene(
      app,
      given(
        answered(opened(playlistPath(playlist.id)), (id) =>
          reply.playlist(id, { ...reply.playlist(id).result, picture }),
        ),
      ),
      see(selector(`img[src="${picture.small}"][decoding="sync"]`)).toExist(),
      see(selector(`img[src="${picture.medium}"][decoding="async"]`)).toExist(),
    );
    scene(
      app,
      given(onPlaylist),
      inside(
        selector("#playlist-page .aspect-square.rounded-xl"),
        expectAll(all.selector("img")).toHaveCount(0),
        expectAll(all.selector("svg")).toHaveCount(1),
      ),
    );
  });

  test("the document is titled after the playlist", () => {
    expect(documentTitle(onPlaylist)).toBe("French Touch · Bafle");
    expect(documentTitle(opened(playlistPath(playlist.id)))).toBe("Playlist · Bafle");
  });

  test("its rows open their menu, which offers the album and the song", () =>
    scene(
      app,
      given(after(onPlaylist, pressedMore("Playlist", track.id))),
      menuEnters,
      inside(onScreen, see(more(TITLE)).toHaveAttr("aria-expanded", "true")),
      expectAll(items).toHaveCount(2),
      see(item("Go to album")).toExist(),
      see(item("Song details")).toExist(),
    ));

  test("a playlist of one song says so in the singular, and one with none says so in place of its list", () => {
    scene(
      app,
      given(
        answered(opened(playlistPath(playlist.id)), (id) =>
          reply.playlist(id, { ...reply.playlist(id).result, tracks: [track] }),
        ),
      ),
      see(text("1 song")).toExist(),
    );
    scene(
      app,
      given(
        answered(opened(playlistPath(playlist.id)), (id) =>
          reply.playlist(id, { ...reply.playlist(id).result, tracks: [] }),
        ),
      ),
      see(pageTitle("French Touch")).toExist(),
      see(text("0 songs")).toExist(),
      see(text("The catalog lists no songs for this playlist.")).toExist(),
    );
  });

  test("opening it and leaving it are swaps like any other: they ask for a transition", () => {
    expect(
      viewTransition({
        previousModel: openingPlaylistFromTile,
        model: onPlaylist,
        message: changedUrl(playlistPath(playlist.id)),
      }),
    ).toEqual({ types: ["open-detail", `playlist-picture-${playlist.id}`] });
    // Held on the shelf while the playlist loads, nothing swaps.
    expect(
      viewTransition({
        previousModel: onHome,
        model: openingPlaylistFromTile,
        message: clickedLink(playlistPath(playlist.id)),
      }),
    ).toBe(false);
  });
});

describe("playlist tiles lead to the playlist's page", () => {
  test("on Home and Search a playlist's tile is a link to its page", () => {
    scene(
      app,
      given(onHome),
      inside(
        role("list", { name: "Top playlists" }),
        expectAll(all.role("link")).toHaveCount(1),
        see(playlistTile).toHaveAttr("href", "/playlist/pl-1"),
        see(playlistTile).toHaveAttr("aria-busy", "false"),
        see(playlistTile).toContainText("Bafle Editors"),
      ),
    );
    scene(
      app,
      given(answered(opened("/search?q=touch"), (id) => reply.search(id, foundMore))),
      inside(
        role("list", { name: "Playlists" }),
        see(playlistTile).toHaveAttr("href", "/playlist/pl-1"),
      ),
    );
  });

  test("a shelf's tiles are all links: the row takes no focus of its own", () =>
    scene(
      app,
      given(onHome),
      see(role("list", { name: "Top playlists" })).not.toHaveAttr("tabindex"),
      see(role("list", { name: "Top artists" })).not.toHaveAttr("tabindex"),
    ));

  test("the page is held and the tile shows that its playlist is on its way; then the playlist takes the screen", () =>
    scene(
      app,
      given(onHome),
      inside(playlistTile, expectAll(records).toHaveCount(0)),
      Subscription.emit(clickedLink(playlistPath(playlist.id))),
      inside(
        onScreen,
        see(pageTitle("Home")).toExist(),
        see(playlistTile).toHaveAttr("aria-busy", "true"),
        // The record comes out from behind the picture, which stays.
        inside(playlistTile, expectAll(records).toHaveCount(1)),
        // Only the tile that was chosen says so.
        expectAll(records).toHaveCount(1),
        see(albumTile).toHaveAttr("aria-busy", "false"),
      ),
      inside(navigation, expectAll(all.selector('[aria-busy="true"]')).toHaveCount(0)),
      // No row speaks for it, so the page's status does.
      see(text("Loading Playlist")).toExist(),
      Command.resolve(Catalog.PlaylistDetail, reply.playlist(nextId(onHome))),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusPage, Message.CompletedFocusPage()],
      ),
      inside(onScreen, see(pageTitle("French Touch")).toExist()),
      // Home is kept behind it, its tile at rest again.
      inside(
        selector("#home-page[inert]"),
        see(selector("a[data-playlist-tile]")).toHaveAttr("aria-busy", "false"),
      ),
    ));

  test("the tile's picture and the page's carry one name, on the page on screen only", () => {
    const name = "playlist-picture-pl-1";
    scene(
      app,
      given(onHome),
      inside(playlistTile, see(selector("[data-sleeve]")).toHaveStyle("view-transition-name", name)),
    );
    scene(
      app,
      given(onPlaylist),
      // Kept behind the playlist, Home's tile gives the name up: the page's picture has it.
      inside(
        selector("#home-page[inert] a[data-playlist-tile]"),
        see(selector("[data-sleeve]")).not.toHaveStyle("view-transition-name"),
      ),
      see(selector("#playlist-page .aspect-square.rounded-xl")).toHaveStyle(
        "view-transition-name",
        name,
      ),
    );
  });

  test("a failure is said on the playlist's page, with Try again: a tile has no room for it", () =>
    scene(
      app,
      given(openingPlaylistFromTile),
      Subscription.emit(arrived(reply.playlistRefused(nextId(onHome)))),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusPage, Message.CompletedFocusPage()],
      ),
      inside(
        onScreen,
        see(pageTitle("Playlist")).toExist(),
        see(role("alert")).toContainText("Playlist could not load."),
        see(role("alert")).toContainText("The music catalog is not answering right now."),
        see(tryAgain).toExist(),
      ),
      click(tryAgain),
      Command.expectExact(Catalog.PlaylistDetail, FocusPage),
      Command.resolve(FocusPage, Message.CompletedFocusPage()),
      Command.resolve(Catalog.PlaylistDetail, reply.playlist("page:3")),
      inside(onScreen, see(pageTitle("French Touch")).toExist(), see(role("alert")).toBeAbsent()),
    ));

  test("a lost connection is worded as one", () =>
    scene(
      app,
      given(answered(openingPlaylistFromTile, reply.playlistLost, playlistPath(playlist.id))),
      see(role("alert")).toContainText("Bafle could not be reached. Check your connection."),
    ));

  test("a playlist the catalog does not have says so on its page for good, with no Try again", () =>
    scene(
      app,
      given(answered(openingPlaylistFromTile, reply.playlistMissing, playlistPath(playlist.id))),
      inside(
        onScreen,
        see(pageTitle("This playlist is not available")).toExist(),
        see(text("The catalog no longer has it, or the link to it is wrong.")).toExist(),
        expectAll(tryAgainButtons).toHaveCount(0),
      ),
    ));
});

describe("rule 1: Go to album on a row of the playlist holds it and marks the row", () => {
  test("the row that asked says so, and the album takes the screen when it arrives", () =>
    scene(
      app,
      given(after(onPlaylist, pressedMore("Playlist", track.id))),
      menuEnters,
      click(item("Go to album")),
      inside(onScreen, see(pageTitle("French Touch")).toExist()),
      see(more(TITLE)).toHaveAttr("aria-expanded", "true"),
      inside(item("Go to album"), expectAll(spinners).toHaveCount(1)),
      // The row speaks for it: the page's own status does not.
      see(text("Showing French Touch")).toExist(),
      Command.resolve(Catalog.AlbumDetail, reply.album(nextId(onPlaylist))),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusPage, Message.CompletedFocusPage()],
      ),
      // The menu went with the page it was on.
      Mount.expectEnded(Menu.PortalMenuBackdrop, Menu.AnchorMenu),
      inside(onScreen, see(pageTitle("Discovery")).toExist()),
      // The playlist is behind the album, as it was left.
      inside(keptPlaylist, expectAll(all.role("listitem")).toHaveCount(3)),
    ));
});

describe("rule 9: the pages around a playlist are found as they were left", () => {
  test("back from the playlist, the shelf is the page on screen again, the focus on its tile, and its page is gone", () =>
    scene(
      app,
      given(onPlaylist),
      inside(selector("#home-page[inert]"), expectAll(all.role("listitem")).not.toHaveCount(0)),
      Subscription.emit(changedUrl("/")),
      Command.expectHas(FocusPlaylistTile),
      Command.resolve(FocusPlaylistTile, Message.CompletedFocusPlaylistTile()),
      Command.resolve(Catalog.HomeFeed, reply.home(nextId(onPlaylist))),
      inside(onScreen, see(pageTitle("Home")).toExist()),
      see(selector("#playlist-page")).toBeAbsent(),
      expectAll(spinners).toHaveCount(0),
    ));

  test("behind a song opened from it, the playlist's page is kept: in the document, hidden, with its rows", () =>
    scene(
      app,
      given(onSongFromPlaylist),
      inside(onScreen, see(pageTitle(TITLE)).toExist()),
      inside(keptPlaylist, expectAll(all.role("listitem")).toHaveCount(3)),
      expectAll(all.selector("main .invisible #playlist-page")).toHaveCount(1),
      // Every id is still the id of one element.
      ...[
        "playlist-page",
        "playlist-page-title",
        "playlist-songs",
        "track-page",
        "track-page-title",
      ].map((id) => expectAll(all.selector(`[id="${id}"]`)).toHaveCount(1)),
      // Back from the song, the playlist is the page on screen again, not built anew.
      Subscription.emit(changedUrl(playlistPath(playlist.id))),
      Command.resolve(FocusTrackRow, Message.CompletedFocusTrackRow()),
      Command.resolve(Catalog.PlaylistDetail, reply.playlist(nextId(onSongFromPlaylist))),
      inside(onScreen, see(pageTitle("French Touch")).toExist()),
      see(keptPlaylist).toBeAbsent(),
      see(selector("#track-page")).toBeAbsent(),
    ));

  test("behind an album asked from one of its rows, the playlist and the album are both pages of their own", () => {
    const onAlbumFromPlaylist = answered(
      after(onPlaylist, choseFromRow("Playlist", track.id, "OpenAlbum")),
      reply.album,
      albumPath(album.id),
    );

    scene(
      app,
      given(onAlbumFromPlaylist),
      inside(onScreen, see(pageTitle("Discovery")).toExist()),
      inside(keptPlaylist, expectAll(all.role("listitem")).toHaveCount(3)),
      ...["playlist-page", "playlist-songs", "album-page", "album-songs"].map((id) =>
        expectAll(all.selector(`[id="${id}"]`)).toHaveCount(1),
      ),
    );
  });
});

describe("playing from the playlist's page", () => {
  test("a tap on a row starts its track, and the page stays as it is, with the island over its foot", () =>
    scene(
      app,
      given(onPlaylist),
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
        see(pageTitle("French Touch")).toExist(),
        // The row shows it was chosen, and only that row.
        see(playRow("Technologic")).toHaveAttr("aria-current", "true"),
        see(playRow(TITLE)).not.toHaveAttr("aria-current"),
      ),
      see(island).toExist(),
      resolveStart(1),
      thresholdPasses(1),
    ));
});
