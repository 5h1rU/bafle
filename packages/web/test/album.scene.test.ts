import type { TrendingMusic } from "@bafle/domain/Catalog/MusicCatalog.external";
import * as Option from "effect/Option";
import { Animation, Menu } from "@foldkit/ui";
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
  FocusPage,
  FocusTrackRow,
  NavigateInternal,
} from "../src/command.ts";
import { update, viewTransition } from "../src/main.ts";
import { Message } from "../src/message.ts";
import type { Model } from "../src/model.ts";
import { documentTitle, view } from "../src/view.ts";
import {
  after,
  album,
  albumPath,
  albumOpener,
  answered,
  arrived,
  changedUrl,
  chose,
  choseFromRow,
  clickedLink,
  leavingHomeForNew,
  nextId,
  onAlbum,
  onHome,
  onNew,
  onSearch,
  opened,
  openingAlbumFromRow,
  openingAlbumFromTile,
  pressedMore,
  reply,
  silentTrack,
  track,
  trackPath,
} from "./fixtures.ts";

const app = { update, view };

const TITLE = "Harder, Better, Faster, Stronger";

const navigation = role("navigation", { name: "Main" });
const pageTitle = (name: string | RegExp) => role("heading", { name, level: 1 });
const sectionTitle = (name: string) => role("heading", { name, level: 2 });
const onScreen = selector('[role="region"]:not([inert])');
const keptAlbum = selector("#album-page[inert]");
const songs = role("list", { name: "Songs" });
const topSongs = role("list", { name: "Top songs" });
const more = (title: string) => role("button", { name: `More: ${title}` });
const playRow = (title: string) => role("button", { name: new RegExp(`^Play: ${title}`) });
const item = (name: string) => role("menuitem", { name });
const items = all.role("menuitem");
const tryAgain = role("button", { name: "Try again" });
const tryAgainButtons = all.role("button", { name: /^Try again/ });
const tryAgainOnAlbum = role("button", { name: "Try again: the album Discovery" });
const backControl = role("button", { name: "Back" });
const homeControl = role("link", { name: "Home" });
const albumTile = role("link", { name: /Discovery/ });
const spinners = all.selector("svg.animate-spin");
/** The rows that say these words: each row's status holds all it has to say. */
const saying = (words: string) => all.role("status", { name: words });
const placeholderBlocks = all.selector('[aria-busy="true"] [aria-hidden="true"] .animate-pulse');

/** An open menu entered the document: its backdrop was put behind it and it was placed by its control. */
const menuEnters = Mount.resolveAll(
  [Menu.PortalMenuBackdrop, Menu.Message.CompletedPortalMenuBackdrop()],
  [Menu.AnchorMenu, Menu.Message.CompletedAnchorMenu()],
);

/** A menu that something was chosen from closes, and is taken out of the document once it has faded. */
// NOTE: a function, since a step that expects Mounts to have ended is used up by one scene.
const menuLeaves = () => [
  Command.resolve(Menu.FocusButton, Menu.Message.CompletedFocusButton()),
  Command.resolve(Animation.WaitForPaint, Animation.Message.CompletedWaitForPaint({ generation: 2 })),
  Command.resolve(
    Menu.DetectMovementOrAnimationEnd,
    Menu.Message.GotAnimationMessage({
      message: Animation.Message.EndedAnimation({ generation: 2 }),
    }),
  ),
  Mount.expectEnded(Menu.PortalMenuBackdrop, Menu.AnchorMenu),
];

/** New with two rows on the same album: the first has something to play, the second has not. */
const sameAlbum: TrendingMusic = { tracks: [track, silentTrack], albums: [album] };
const onNewWithTwoOfAnAlbum: Model = answered(
  leavingHomeForNew,
  (id) => reply.newMusic(id, sameAlbum),
  "/new",
);
const openingFromFirstOfTwo: Model = after(
  onNewWithTwoOfAnAlbum,
  choseFromRow("New", track.id, "OpenAlbum"),
);

/** A song of the album opened from the album's own row: the album is behind its page. */
const onSongFromAlbum: Model = answered(
  after(onAlbum, choseFromRow("Album", track.id, "OpenSong")),
  reply.track,
  trackPath(track.id),
);

describe("rule 5: a direct link paints the album page's shape", () => {
  test("placeholders stand for the cover, the title and the rows, under the list's real title", () =>
    scene(
      app,
      given(opened(albumPath(album.id))),
      // Said, not shown: the placeholders stand where the title will be.
      see(pageTitle("Album")).toHaveClass("sr-only"),
      see(sectionTitle("Songs")).toExist(),
      expectAll(placeholderBlocks).not.toHaveCount(0),
      see(songs).toBeAbsent(),
      // Nothing is behind a page reached by its address: its way out leads Home.
      see(homeControl).toHaveAttr("href", "/"),
      see(backControl).toBeAbsent(),
      see(text("Loading Album")).toExist(),
    ));

  test("the reply fills the page in", () =>
    scene(
      app,
      given(opened(albumPath(album.id))),
      Subscription.emit(arrived(reply.album("page:0"))),
      see(pageTitle("Discovery")).toExist(),
      expectAll(placeholderBlocks).toHaveCount(0),
      inside(songs, expectAll(all.role("listitem")).toHaveCount(3)),
      see(text("Showing Discovery")).toExist(),
    ));
});

describe("the album page", () => {
  test("shows the cover, the title, the artist, the year and how many songs, over the songs in order", () =>
    scene(
      app,
      given(onAlbum),
      inside(
        onScreen,
        see(pageTitle("Discovery")).toExist(),
        see(selector("#album-page time")).toHaveText("2001"),
        see(text(/3 songs/)).toExist(),
        // The rendition a row or a tile already loaded is drawn under the larger one.
        see(selector('img[src="https://img.test/al-1/small.jpg"][decoding="sync"]')).toExist(),
        see(selector('img[src="https://img.test/al-1/large.jpg"][decoding="async"]')).toExist(),
        see(sectionTitle("Songs")).toExist(),
        inside(
          songs,
          expectAll(all.role("listitem")).toHaveCount(3),
          expectAll(all.selector("img")).toHaveCount(0),
          // Each row plays, as a row of any list does, and is numbered: the order is the album's.
          see(playRow("One More Time")).toContainText("5:20"),
          see(playRow("One More Time")).toContainText("01"),
          see(playRow(TITLE)).toContainText("02"),
          see(text("This song has no audio to play.")).toExist(),
        ),
        // Opened from a list: the way out goes back through the history.
        see(backControl).toExist(),
      ),
      // An album is not a section: no item is the current page.
      inside(navigation, expectAll(all.selector("[aria-current]")).toHaveCount(0)),
    ));

  test("Play album starts at the first playable song and queues the rest in album order", () => {
    const found = answered(opened(albumPath(album.id)), (id) =>
      reply.album(id, { ...reply.album(id).result, tracks: [silentTrack, albumOpener, track] }),
    );
    scene(app, given(found), see(role("button", { name: "Play album" })).toExist());
    const play = Message.ClickedPlayAlbum({ firstTrackId: albumOpener.id });
    const session = Option.getOrThrow(after(found, play, play).player.maybeSession);
    expect(session.current.id).toBe(albumOpener.id);
    expect(session.playback._tag).toBe("Acknowledged");
    expect(session.later.map((next) => next.id)).toEqual([track.id]);
  });

  test("the document is titled after the album", () => {
    expect(documentTitle(onAlbum)).toBe("Discovery · Bafle");
    expect(documentTitle(opened(albumPath(album.id)))).toBe("Album · Bafle");
  });

  test("its rows do not offer the album: the listener is there", () =>
    scene(
      app,
      given(after(onAlbum, pressedMore("Album", track.id))),
      menuEnters,
      inside(onScreen, see(more(TITLE)).toHaveAttr("aria-expanded", "true")),
      expectAll(items).toHaveCount(1),
      see(item("Song details")).toExist(),
      see(item("Go to album")).toBeAbsent(),
    ));

  test("an album with no songs says so in place of its list", () =>
    scene(
      app,
      given(
        answered(opened(albumPath(album.id)), (id) =>
          reply.album(id, { ...reply.album(id).result, tracks: [], releaseDate: null }),
        ),
      ),
      see(pageTitle("Discovery")).toExist(),
      see(text("0 songs")).toExist(),
      see(role("button", { name: "Play album" })).toBeAbsent(),
      see(selector("#album-page time")).toBeAbsent(),
      see(text("The catalog lists no songs for this album.")).toExist(),
    ));

  test("opening it and leaving it are swaps like any other: they ask for a transition", () => {
    expect(
      viewTransition({
        previousModel: openingAlbumFromRow,
        model: onAlbum,
        message: changedUrl(albumPath(album.id)),
      }),
    ).toEqual({ types: ["show-detail", `album-cover-${album.id}`] });
    // Held on the list while the album loads, nothing swaps.
    expect(
      viewTransition({
        previousModel: onNew,
        model: openingAlbumFromRow,
        message: choseFromRow("New", track.id, "OpenAlbum"),
      }),
    ).toBe(false);
  });
});

describe("rule 1: Go to album holds the list and marks the row that asked", () => {
  test("the menu offers it before Song details, and choosing it opens the album when it arrives", () =>
    scene(
      app,
      given(after(onNew, pressedMore("New", track.id))),
      menuEnters,
      expectAll(items).toHaveCount(2),
      // In the order they are offered: the album, then the song.
      see(role("menu")).toHaveText(/Go to album.*Song details/),
      click(item("Go to album")),
      // Held, as any page that was chosen: New stays. The menu stays open, and the mark is on the
      // item that was pressed.
      inside(onScreen, see(pageTitle("New")).toExist()),
      see(more(TITLE)).toHaveAttr("aria-expanded", "true"),
      inside(item("Go to album"), expectAll(spinners).toHaveCount(1)),
      inside(more(TITLE), expectAll(spinners).toHaveCount(0)),
      Command.resolve(Catalog.AlbumDetail, reply.album(nextId(onNew))),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusPage, Message.CompletedFocusPage()],
      ),
      // The menu went with the page it was on.
      Mount.expectEnded(Menu.PortalMenuBackdrop, Menu.AnchorMenu),
      inside(onScreen, see(pageTitle("Discovery")).toExist(), see(pageTitle("New")).toBeAbsent()),
      // The list is behind the album, as it was left.
      inside(selector("#new-page[inert]"), expectAll(all.role("listitem")).not.toHaveCount(0)),
    ));

  test("only the row that asked says so: another row on the same album is a plain row, and so is the album's tile", () =>
    scene(
      app,
      given(openingFromFirstOfTwo),
      inside(
        onScreen,
        see(pageTitle("New")).toExist(),
        see(more(TITLE)).toHaveAttr("aria-busy", "true"),
        see(more("Veridis Quo")).toHaveAttr("aria-busy", "false"),
        expectAll(spinners).toHaveCount(1),
        // Said to assistive technology only: the spinner says it on screen.
        see(text("Opening the album…")).toHaveAttr("role", "status"),
        see(text("Opening the album…")).toHaveClass("sr-only"),
        expectAll(saying("Opening the album…")).toHaveCount(1),
        see(albumTile).toHaveAttr("aria-busy", "false"),
        see(text(/could not be opened/)).toBeAbsent(),
      ),
      inside(navigation, expectAll(all.selector('[aria-busy="true"]')).toHaveCount(0)),
      // The page's own status leaves it to the row: the two never speak of the same thing.
      see(text("Showing New")).toExist(),
      see(text("Loading Album")).toBeAbsent(),
    ));

  test("choosing something else clears the row", () =>
    scene(
      app,
      given(chose(openingFromFirstOfTwo, trackPath(silentTrack.id))),
      inside(
        topSongs,
        // The second row now opens its song; nothing is said of the album any more.
        see(more(TITLE)).toHaveAttr("aria-busy", "false"),
        see(more("Veridis Quo")).toHaveAttr("aria-busy", "true"),
        see(text("Opening the album…")).toBeAbsent(),
      ),
    ));
});

describe("rule 6: a row says that its album failed to open", () => {
  const failed = answered(openingFromFirstOfTwo, reply.albumRefused);
  const failure = "This album could not be opened. The music catalog is not answering right now.";

  test("the list stays as it is, and the row that asked states the failure with a way to try again", () =>
    scene(
      app,
      given(failed),
      inside(
        onScreen,
        see(pageTitle("New")).toExist(),
        inside(
          topSongs,
          expectAll(all.role("listitem")).toHaveCount(2),
          see(more(TITLE)).toHaveAttr("aria-busy", "false"),
          expectAll(spinners).toHaveCount(0),
          // Said politely, on one row: the other row on the album has nothing to say of it.
          see(text(failure)).toHaveAttr("role", "status"),
          expectAll(saying(failure)).toHaveCount(1),
          expectAll(tryAgainButtons).toHaveCount(1),
          see(tryAgainOnAlbum).toHaveText("Try again"),
        ),
      ),
      see(role("alert")).toBeAbsent(),
      see(text("Showing New")).toExist(),
    ));

  test("a lost connection is worded as one", () =>
    scene(
      app,
      given(answered(openingAlbumFromRow, reply.albumLost)),
      see(
        text("This album could not be opened. Bafle could not be reached. Check your connection."),
      ).toHaveAttr("role", "status"),
    ));

  test("Try again retries in place: the row loads again, takes the focus, and the album opens", () =>
    scene(
      app,
      given(failed),
      click(tryAgainOnAlbum),
      Command.expectExact(Catalog.AlbumDetail, FocusTrackRow),
      Command.resolve(FocusTrackRow, Message.CompletedFocusTrackRow()),
      inside(
        onScreen,
        see(pageTitle("New")).toExist(),
        see(more(TITLE)).toHaveAttr("aria-busy", "true"),
        see(text(failure)).toBeAbsent(),
        expectAll(tryAgainButtons).toHaveCount(0),
      ),
      Command.resolve(Catalog.AlbumDetail, reply.album(nextId(failed))),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusPage, Message.CompletedFocusPage()],
      ),
      inside(onScreen, see(pageTitle("Discovery")).toExist()),
    ));

  test("a row whose song and whose album both failed says which each Try again is for", () =>
    scene(
      app,
      given(answered(chose(failed, trackPath(track.id)), reply.trackRefused)),
      inside(
        topSongs,
        expectAll(tryAgainButtons).toHaveCount(2),
        see(role("button", { name: `Try again: ${TITLE}` })).toHaveText("Try the song again"),
        see(tryAgainOnAlbum).toHaveText("Try the album again"),
      ),
    ));
});

describe("rule 7: a row says that the catalog does not have its album", () => {
  const missing = answered(openingFromFirstOfTwo, reply.albumMissing);

  test("it says so for good on the row that asked, with no Try again", () =>
    scene(
      app,
      given(missing),
      inside(
        onScreen,
        see(pageTitle("New")).toExist(),
        inside(
          topSongs,
          see(text("This album is not available.")).toHaveAttr("role", "status"),
          expectAll(saying("This album is not available.")).toHaveCount(1),
          expectAll(tryAgainButtons).toHaveCount(0),
          expectAll(spinners).toHaveCount(0),
        ),
      ),
      see(role("alert")).toBeAbsent(),
    ));

  test("the row's menu stops offering the album", () =>
    scene(
      app,
      given(after(missing, pressedMore("New", track.id))),
      menuEnters,
      expectAll(items).toHaveCount(1),
      see(item("Song details")).toExist(),
      see(item("Go to album")).toBeAbsent(),
    ));

  test("and so does the menu of every other row on that album", () =>
    scene(
      app,
      given(after(missing, pressedMore("New", silentTrack.id))),
      menuEnters,
      expectAll(items).toHaveCount(1),
      see(item("Song details")).toExist(),
    ));

  test("a row with nothing left to offer has no control at its end", () => {
    // Its song is gone from the catalog too, and nothing is playing to queue it behind.
    const bothGone = answered(chose(missing, trackPath(track.id)), reply.trackMissing);

    scene(
      app,
      given(bothGone),
      inside(
        topSongs,
        see(more(TITLE)).toBeAbsent(),
        expectAll(all.selector("span[data-track-row]")).toHaveCount(1),
        see(text("This song is not available. This album is not available.")).toExist(),
      ),
    );
  });
});

describe("album tiles lead to the album's page", () => {
  test("on Home, New and Search an album's tile is a link to it", () => {
    scene(
      app,
      given(onHome),
      inside(
        role("list", { name: "Editors' picks" }),
        expectAll(all.role("link")).toHaveCount(1),
        see(albumTile).toHaveAttr("href", "/album/al-1"),
        see(albumTile).toHaveAttr("aria-busy", "false"),
        see(albumTile).toContainText("Daft Punk"),
      ),
    );
    scene(
      app,
      given(onNew),
      inside(
        role("list", { name: "Top albums" }),
        see(albumTile).toHaveAttr("href", "/album/al-1"),
      ),
    );
    scene(
      app,
      given(onSearch),
      inside(role("list", { name: "Albums" }), see(albumTile).toHaveAttr("href", "/album/al-1")),
    );
  });

  test("the page is held and the tile shows that its album is on its way; then the album takes the screen", () =>
    scene(
      app,
      given(onHome),
      inside(albumTile, expectAll(spinners).toHaveCount(0)),
      Subscription.emit(clickedLink(albumPath(album.id))),
      inside(
        onScreen,
        see(pageTitle("Home")).toExist(),
        see(albumTile).toHaveAttr("aria-busy", "true"),
        // The spinner lies over the picture, which stays.
        inside(
          albumTile,
          expectAll(spinners).toHaveCount(1),
          expectAll(all.selector("img")).toHaveCount(1),
        ),
      ),
      inside(navigation, expectAll(all.selector('[aria-busy="true"]')).toHaveCount(0)),
      // No row speaks for it, so the page's status does.
      see(text("Loading Album")).toExist(),
      Command.resolve(Catalog.AlbumDetail, reply.album(nextId(onHome))),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusPage, Message.CompletedFocusPage()],
      ),
      inside(onScreen, see(pageTitle("Discovery")).toExist()),
      // Home is kept behind it, its tile at rest again.
      inside(
        selector("#home-page[inert]"),
        see(selector("a[data-album-tile]")).toHaveAttr("aria-busy", "false"),
      ),
    ));

  test("a failure is said on the album's page, with Try again: a tile has no room for it", () =>
    scene(
      app,
      given(openingAlbumFromTile),
      Subscription.emit(arrived(reply.albumRefused(nextId(onHome)))),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusPage, Message.CompletedFocusPage()],
      ),
      inside(
        onScreen,
        see(pageTitle("Album")).toExist(),
        see(role("alert")).toContainText("Album could not load."),
        see(role("alert")).toContainText("The music catalog is not answering right now."),
        see(tryAgain).toExist(),
        see(backControl).toExist(),
      ),
      click(tryAgain),
      Command.expectExact(Catalog.AlbumDetail, FocusPage),
      Command.resolve(FocusPage, Message.CompletedFocusPage()),
      Command.resolve(Catalog.AlbumDetail, reply.album("page:2")),
      inside(onScreen, see(pageTitle("Discovery")).toExist(), see(role("alert")).toBeAbsent()),
    ));

  test("an album the catalog does not have says so on its page for good: a way out, and no Try again", () =>
    scene(
      app,
      given(answered(openingAlbumFromTile, reply.albumMissing, albumPath(album.id))),
      inside(
        onScreen,
        see(pageTitle("This album is not available")).toExist(),
        see(text("The catalog no longer has it, or the link to it is wrong.")).toExist(),
        see(backControl).toExist(),
        expectAll(tryAgainButtons).toHaveCount(0),
      ),
    ));
});

describe("rule 9: the lists around an album are found as they were left", () => {
  test("back from the album, the list is the page on screen again and the album's page is gone", () =>
    scene(
      app,
      given(onAlbum),
      inside(selector("#new-page[inert]"), expectAll(all.role("listitem")).not.toHaveCount(0)),
      Subscription.emit(changedUrl("/new")),
      Command.resolve(FocusTrackRow, Message.CompletedFocusTrackRow()),
      Command.resolve(Catalog.NewMusic, reply.newMusic(nextId(onAlbum))),
      inside(onScreen, see(pageTitle("New")).toExist()),
      see(selector("#album-page")).toBeAbsent(),
      expectAll(spinners).toHaveCount(0),
    ));

  test("back to a shelf, the focus goes to the tile the album was chosen from", () =>
    scene(
      app,
      given(answered(openingAlbumFromTile, reply.album, albumPath(album.id))),
      Subscription.emit(changedUrl("/")),
      Command.expectHas(FocusAlbumTile),
      Command.resolve(FocusAlbumTile, Message.CompletedFocusAlbumTile()),
      Command.resolve(
        Catalog.HomeFeed,
        reply.home(nextId(answered(openingAlbumFromTile, reply.album, albumPath(album.id)))),
      ),
      inside(onScreen, see(pageTitle("Home")).toExist()),
    ));

  test("behind a song opened from it, the album's page is kept: in the document, hidden, with its rows", () =>
    scene(
      app,
      given(onSongFromAlbum),
      inside(onScreen, see(pageTitle(TITLE)).toExist()),
      inside(keptAlbum, expectAll(all.role("listitem")).toHaveCount(3)),
      expectAll(all.selector("main .invisible #album-page")).toHaveCount(1),
      // Every id is still the id of one element.
      ...["album-page", "album-page-title", "album-songs", "track-page", "track-page-title"].map(
        (id) => expectAll(all.selector(`[id="${id}"]`)).toHaveCount(1),
      ),
      // Back from the song, the album is the page on screen again, not built anew.
      Subscription.emit(changedUrl(albumPath(album.id))),
      Command.resolve(FocusTrackRow, Message.CompletedFocusTrackRow()),
      Command.resolve(Catalog.AlbumDetail, reply.album(nextId(onSongFromAlbum))),
      inside(onScreen, see(pageTitle("Discovery")).toExist()),
      see(keptAlbum).toBeAbsent(),
      see(selector("#track-page")).toBeAbsent(),
    ));
});
