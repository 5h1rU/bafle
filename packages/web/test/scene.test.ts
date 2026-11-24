import * as Option from "effect/Option";
import {
  Command,
  click,
  expect as see,
  expectAll,
  given,
  all,
  inside,
  role,
  scene,
  selector,
  Subscription,
  text,
  type,
} from "foldkit/scene";
import { describe, expect, test } from "vitest";
import { Catalog } from "../src/catalog.ts";
import {
  FocusPage,
  FocusSearchField,
  FocusTrackRow,
  NavigateBack,
  NavigateInternal,
  ReplaceSearchTerm,
  WaitForTypingPause,
} from "../src/command.ts";
import { update, viewTransition } from "../src/main.ts";
import { Message } from "../src/message.ts";
import { documentTitle, view } from "../src/view.ts";
import {
  after,
  answered,
  arrived,
  awaitedId,
  bareTrack,
  changedUrl,
  chose,
  clickedLink,
  explicitTrack,
  featured,
  foundMore,
  leavingHomeForNew,
  nextId,
  nothingFound,
  onHome,
  onNew,
  onSearch,
  onTrack,
  opened,
  openingTrack,
  reply,
  track,
  trackPath,
} from "./fixtures.ts";

const app = { update, view };

const navigation = role("navigation", { name: "Main" });
const destination = (name: string) => role("link", { name });
const pageTitle = (name: string | RegExp) => role("heading", { name, level: 1 });
const sectionTitle = (name: string) => role("heading", { name, level: 2 });
const searchField = role("searchbox", { name: "Search the catalog" });
const results = role("region", { name: "Results" });
const tryAgain = role("button", { name: "Try again" });
/**
 * The page on screen. The sections stay in the document once loaded, so a
 * page that left the screen is not gone: what has to be true of it is that
 * it is not this one.
 */
const onScreen = selector('[role="region"]:not([inert])');
const pages = all.selector('[role="region"]');
const keptPages = all.selector('[role="region"][inert]');
/** The way from a row to its track's page: the link at the row's end. */
const trackRow = (title: string | RegExp) => role("link", { name: title });
/** A row's own control: pressing it plays the track, or stops it once it sounds. */
const playRow = (title: string) => role("button", { name: new RegExp(`^(Play|Pause): ${title}`) });
/** A row whole: its control, its link and what they hold. */
const rowOf = (trackId: string) => selector(`[data-track="${trackId}"]`);
const tryAgainButtons = all.role("button", { name: /^Try again/ });
const tryAgainOn = (title: string) => role("button", { name: `Try again: ${title}` });
const topSongs = role("list", { name: "Top songs" });
const backControl = role("button", { name: "Back" });
const homeControl = role("link", { name: "Home" });
/** The groups of blocks that stand in for content on its way, and the blocks themselves. */
const placeholders = all.selector('[aria-busy="true"] [aria-hidden="true"]');
const placeholderBlocks = all.selector('[aria-busy="true"] [aria-hidden="true"] .animate-pulse');

describe("the shell", () => {
  test("names the app and leads to its three pages, marking the one on screen", () =>
    scene(
      app,
      given(onHome),
      see(text("Bafle")).toExist(),
      inside(
        navigation,
        expectAll(all.role("link")).toHaveCount(3),
        see(destination("Home")).toHaveAttr("aria-current", "page"),
        see(destination("New")).not.toHaveAttr("aria-current"),
        see(destination("Search")).not.toHaveAttr("aria-current"),
      ),
    ));

  test("an unknown address gets a page of its own, with a way home", () =>
    scene(
      app,
      given(opened("/nowhere/at-all")),
      see(pageTitle("Page not found")).toExist(),
      see(text("Nothing lives at /nowhere/at-all.")).toExist(),
      see(role("link", { name: "Go to Home" })).toHaveAttr("href", "/"),
    ));
});

describe("rule 4: the first paint is never blank", () => {
  test("Home opens as its three shelves, titled, with blocks where the tiles will be", () =>
    scene(
      app,
      given(opened("/")),
      see(pageTitle("Home")).toExist(),
      see(sectionTitle("Editors' picks")).toExist(),
      see(sectionTitle("Top playlists")).toExist(),
      see(sectionTitle("Top artists")).toExist(),
      // One row of blocks per shelf, hidden from assistive technology, in the loading region.
      expectAll(placeholders).toHaveCount(3),
      expectAll(placeholderBlocks).not.toBeEmpty(),
      see(text("Loading Home")).toExist(),
      see(destination("Home")).toHaveAttr("aria-current", "page"),
    ));

  test("New opens as a list of rows under its title, and a shelf", () =>
    scene(
      app,
      given(opened("/new")),
      see(pageTitle("New")).toExist(),
      see(sectionTitle("Top songs")).toExist(),
      see(sectionTitle("Top albums")).toExist(),
      // The rows of the list, and the row of the shelf.
      expectAll(placeholders).toHaveCount(2),
      expectAll(placeholderBlocks).not.toBeEmpty(),
    ));

  test("a shared search link opens with its term in the field while the results load", () =>
    scene(
      app,
      given(opened("/search?q=daft")),
      see(searchField).toHaveValue("daft"),
      see(results).toHaveAttr("aria-busy", "true"),
      expectAll(placeholders).toHaveCount(2),
      expectAll(placeholderBlocks).not.toBeEmpty(),
      see(text("Type to search for artists, albums, songs and playlists.")).toBeAbsent(),
    ));
});

describe("A1 and A2: a link is an intention, and the URL moves when the screen does", () => {
  test("the page stays while the chosen item shows it is loading; then the page swaps", () =>
    scene(
      app,
      given(onHome),
      see(destination("New")).toHaveAttr("href", "/new"),
      // A press on a link reaches update through the runtime's routing, not a handler in the view.
      Subscription.emit(clickedLink("/new")),
      // Home is still whole: its title, its shelves, its item marked as the current page.
      see(pageTitle("Home")).toExist(),
      see(text("Discovery")).toExist(),
      see(destination("Home")).toHaveAttr("aria-current", "page"),
      see(destination("New")).toHaveAttr("aria-busy", "true"),
      see(text("Loading New")).toExist(),
      Command.resolve(Catalog.NewMusic, reply.newMusic(nextId(onHome))),
      // Only now is the URL asked to move.
      Command.expectExact(NavigateInternal),
      Command.resolve(NavigateInternal, Message.CompletedNavigateInternal()),
      inside(onScreen, see(pageTitle("New")).toExist(), see(pageTitle("Home")).toBeAbsent()),
      see(destination("New")).toHaveAttr("aria-current", "page"),
      see(destination("New")).toHaveAttr("aria-busy", "false"),
      // Said to assistive technology, which saw neither the spinner nor the swap.
      see(text("Loading New")).toBeAbsent(),
      see(text("Showing New")).toExist(),
      // The URL change the app asked for arrives: the page is already there, and nothing reloads.
      Subscription.emit(changedUrl("/new")),
      inside(onScreen, see(pageTitle("New")).toExist()),
      see(text("Showing New")).toExist(),
      Command.expectNone(),
    ));
});

describe("A3: revisits are instant", () => {
  test("a page that holds data shows it at once, with nothing in its place while it refreshes", () =>
    scene(
      app,
      given(onNew),
      Subscription.emit(clickedLink("/")),
      inside(onScreen, see(pageTitle("Home")).toExist(), see(text("Discovery")).toExist()),
      see(destination("Home")).toHaveAttr("aria-busy", "false"),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [Catalog.HomeFeed, reply.home(nextId(onNew))],
      ),
    ));
});

describe("B: a page reached through the browser's history", () => {
  test("one the Model holds is on screen at once", () =>
    scene(
      app,
      given(onNew),
      Subscription.emit(changedUrl("/")),
      inside(onScreen, see(pageTitle("Home")).toExist(), see(text("Discovery")).toExist()),
      Command.resolve(Catalog.HomeFeed, reply.home(nextId(onNew))),
    ));

  test("one it does not hold keeps the page on screen, its item busy, until it loads", () =>
    scene(
      app,
      given(onHome),
      Subscription.emit(changedUrl("/new")),
      inside(onScreen, see(pageTitle("Home")).toExist()),
      see(destination("Home")).toHaveAttr("aria-current", "page"),
      see(destination("New")).toHaveAttr("aria-busy", "true"),
      see(text("Loading New")).toExist(),
      Command.resolve(Catalog.NewMusic, reply.newMusic(nextId(onHome))),
      inside(onScreen, see(pageTitle("New")).toExist()),
      see(text("Showing New")).toExist(),
    ));
});

describe("the pages", () => {
  test("Home shelves the editors' picks, the top playlists and the top artists", () =>
    scene(
      app,
      given(onHome),
      inside(
        role("list", { name: "Editors' picks" }),
        see(text("Discovery")).toExist(),
        see(text("Daft Punk")).toExist(),
      ),
      inside(
        role("list", { name: "Top playlists" }),
        see(text("French Touch")).toExist(),
        see(text("Bafle Editors")).toExist(),
      ),
      inside(role("list", { name: "Top artists" }), see(text("Daft Punk")).toExist()),
    ));

  test("New lists the top songs in order, each with its artist, length and explicit marker", () =>
    scene(
      app,
      given(onNew),
      inside(
        role("list", { name: "Top songs" }),
        expectAll(all.role("listitem")).toHaveCount(2),
        see(text("Harder, Better, Faster, Stronger")).toExist(),
        see(text("3:44")).toExist(),
        see(text("Technologic")).toExist(),
        // Seconds keep two digits.
        see(text("4:05")).toExist(),
        // Only the second track is explicit.
        expectAll(all.text("Explicit")).toHaveCount(1),
      ),
      inside(role("list", { name: "Top albums" }), see(text("Discovery")).toExist()),
    ));

  test("pictures load lazily, and a missing picture leaves no broken image", () =>
    scene(
      app,
      given(onNew),
      inside(
        onScreen,
        // Two album covers, on the first track and the shelf; the second track's album has none.
        expectAll(all.selector("img")).toHaveCount(2),
        expectAll(all.selector('img[loading="lazy"]')).toHaveCount(2),
        // Decorative: the title beside each picture already names it.
        expectAll(all.selector('img[alt=""]')).toHaveCount(2),
      ),
    ));
});

describe("a catalog with nothing to offer", () => {
  test("Home says so in place of its shelves", () => {
    const firstPaint = opened("/");
    const nothingFeatured = { albums: [], playlists: [], artists: [] };

    scene(
      app,
      given(after(firstPaint, arrived(reply.home(awaitedId(firstPaint), nothingFeatured)))),
      see(text("The catalog has nothing to recommend right now.")).toExist(),
      see(sectionTitle("Editors' picks")).toBeAbsent(),
    );
  });

  test("New says so in place of its charts", () => {
    const firstPaint = opened("/new");
    const nothingTrending = { tracks: [], albums: [] };

    scene(
      app,
      given(after(firstPaint, arrived(reply.newMusic(awaitedId(firstPaint), nothingTrending)))),
      see(text("The catalog has no charts right now.")).toExist(),
      see(sectionTitle("Top songs")).toBeAbsent(),
    );
  });
});

describe("rule 5: failures are stated in place", () => {
  const failedNew = answered(leavingHomeForNew, reply.newMusicRefused, "/new");

  test("a page with nothing to show says why, and Try again loads it where it stands", () =>
    scene(
      app,
      given(failedNew),
      inside(onScreen, see(pageTitle("New")).toExist()),
      inside(
        role("alert"),
        see(text("New could not load.")).toExist(),
        see(text("The music catalog is not answering right now.")).toExist(),
      ),
      click(tryAgain),
      // The button is about to go: focus moves to the page it acted on.
      Command.resolve(FocusPage, Message.CompletedFocusPage()),
      // Loading in place: the page's placeholders, and no message any more.
      see(role("alert")).toBeAbsent(),
      see(sectionTitle("Top songs")).toExist(),
      Command.resolve(Catalog.NewMusic, reply.newMusic(nextId(failedNew))),
      see(text("Technologic")).toExist(),
    ));

  test("a lost connection is worded as one", () => {
    const firstPaint = opened("/");

    scene(
      app,
      given(after(firstPaint, arrived(reply.homeLost(awaitedId(firstPaint))))),
      see(text("Home could not load.")).toExist(),
      see(text("Bafle could not be reached. Check your connection.")).toExist(),
    );
  });

  test("a refresh that fails leaves the page as it was, under a quiet notice", () => {
    const refreshingHome = chose(onNew, "/");

    scene(
      app,
      given(answered(refreshingHome, reply.homeRefused)),
      inside(onScreen, see(pageTitle("Home")).toExist(), see(text("Discovery")).toExist()),
      see(role("alert")).toBeAbsent(),
      see(text("Showing what loaded earlier. The music catalog is not answering right now.")).toExist(),
      click(tryAgain),
      Command.resolve(FocusPage, Message.CompletedFocusPage()),
      inside(onScreen, see(text("Discovery")).toExist()),
      Command.resolve(Catalog.HomeFeed, reply.home(nextId(refreshingHome))),
      see(text(/Showing what loaded earlier/)).toBeAbsent(),
    );
  });
});

describe("rule 6: search keeps its results while it loads", () => {
  test("before anything is typed, Search prompts for a term", () =>
    scene(
      app,
      given(opened("/search")),
      see(pageTitle("Search")).toExist(),
      see(searchField).toHaveValue(""),
      see(text("Type to search for artists, albums, songs and playlists.")).toExist(),
      see(results).toBeAbsent(),
    ));

  test("results are grouped by kind, and a kind that found nothing has no group", () =>
    scene(
      app,
      given(onSearch),
      see(searchField).toHaveValue("daft"),
      inside(
        results,
        see(sectionTitle("Artists")).toExist(),
        see(sectionTitle("Albums")).toExist(),
        see(sectionTitle("Songs")).toExist(),
        see(sectionTitle("Playlists")).toBeAbsent(),
      ),
    ));

  test("typing keeps the previous results on screen, marked busy, until the new ones arrive", () =>
    scene(
      app,
      given(onSearch),
      type(searchField, "daft punk"),
      Command.resolve(ReplaceSearchTerm, Message.CompletedReplaceSearchTerm()),
      Subscription.emit(changedUrl("/search?q=daft+punk")),
      see(searchField).toHaveValue("daft punk"),
      see(results).toHaveAttr("aria-busy", "true"),
      see(results).toHaveClass("opacity-60"),
      inside(results, see(text("Discovery")).toExist()),
      Command.resolve(
        WaitForTypingPause,
        Message.CompletedWaitForTypingPause({ pauseId: nextId(onSearch) }),
      ),
      // The query is out; the results on screen are still the previous ones.
      see(results).toHaveAttr("aria-busy", "true"),
      inside(results, see(text("Discovery")).toExist()),
      Command.resolve(
        Catalog.CatalogSearch,
        reply.search(nextId(after(onSearch, changedUrl("/search?q=daft+punk"))), foundMore),
      ),
      see(results).toHaveAttr("aria-busy", "false"),
      see(results).not.toHaveClass("opacity-60"),
      inside(
        results,
        see(text("Discovery")).toBeAbsent(),
        see(sectionTitle("Playlists")).toExist(),
        see(sectionTitle("Albums")).toBeAbsent(),
      ),
    ));

  test("a term that finds nothing says so, naming the term", () => {
    const firstPaint = opened("/search?q=zzzz");

    scene(
      app,
      given(after(firstPaint, arrived(reply.search(awaitedId(firstPaint), nothingFound)))),
      see(text("No results for “zzzz”")).toExist(),
      inside(results, see(role("status")).toHaveText("Nothing found for “zzzz”")),
    );
  });

  test("an answer's arrival is said to assistive technology, for the term it answers", () =>
    scene(
      app,
      given(onSearch),
      inside(results, see(role("status")).toHaveText("Results for “daft”")),
      Subscription.emit(changedUrl("/search?q=daft+punk")),
      // Still the answer on screen, not the term being typed.
      inside(results, see(role("status")).toHaveText("Results for “daft”")),
      Command.resolveAll(
        [
          WaitForTypingPause,
          Message.CompletedWaitForTypingPause({ pauseId: nextId(onSearch) }),
        ],
        [
          Catalog.CatalogSearch,
          reply.search(nextId(after(onSearch, changedUrl("/search?q=daft+punk"))), foundMore),
        ],
      ),
      inside(results, see(role("status")).toHaveText("Results for “daft punk”")),
    ));

  test("results for another term are dimmed even when nothing is loading for Search", () => {
    // Typed on, then chose Home before the pause passed: Search stays, its query never went out.
    const typedThenLeft = chose(after(onSearch, changedUrl("/search?q=daft+punk")), "/");

    scene(
      app,
      given(typedThenLeft),
      see(searchField).toHaveValue("daft punk"),
      see(results).toHaveClass("opacity-60"),
      inside(results, see(text("Discovery")).toExist()),
      Command.expectNone(),
    );
  });

  test("a search revisited for the same term refreshes without dimming what it shows", () => {
    const onHomeAfterSearch = answered(chose(onSearch, "/"), reply.home, "/");

    scene(
      app,
      given(chose(onHomeAfterSearch, "/search?q=daft")),
      see(results).toHaveAttr("aria-busy", "true"),
      see(results).not.toHaveClass("opacity-60"),
      inside(results, see(text("Discovery")).toExist()),
    );
  });

  test("the first term typed shows placeholders, not the prompt and not an empty area", () =>
    scene(
      app,
      given(opened("/search")),
      Subscription.emit(changedUrl("/search?q=d")),
      see(text("Type to search for artists, albums, songs and playlists.")).toBeAbsent(),
      see(results).toHaveAttr("aria-busy", "true"),
      expectAll(placeholders).toHaveCount(2),
      Command.resolve(
        WaitForTypingPause,
        Message.CompletedWaitForTypingPause({ pauseId: nextId(opened("/search")) }),
      ),
      Command.resolve(
        Catalog.CatalogSearch,
        reply.search(nextId(after(opened("/search"), changedUrl("/search?q=d")))),
      ),
      inside(results, see(sectionTitle("Artists")).toExist()),
    ));

  test("a search that fails behind results keeps them, with a notice", () => {
    const typedMore = after(onSearch, changedUrl("/search?q=daft+punk"));
    const askedForMore = after(
      typedMore,
      Message.CompletedWaitForTypingPause({ pauseId: awaitedId(typedMore) }),
    );

    scene(
      app,
      given(after(askedForMore, arrived(reply.searchRefused(awaitedId(askedForMore))))),
      inside(
        results,
        see(text("Discovery")).toExist(),
        see(text(/Showing what loaded earlier/)).toExist(),
        see(tryAgain).toExist(),
      ),
    );
  });
});

describe("rule 7: the swap is a cross-fade", () => {
  test("a view transition is asked for when the page on screen changes", () => {
    const swapped = after(leavingHomeForNew, arrived(reply.newMusic(awaitedId(leavingHomeForNew))));

    expect(
      viewTransition({
        previousModel: leavingHomeForNew,
        model: swapped,
        message: arrived(reply.newMusic(awaitedId(leavingHomeForNew))),
      }),
    ).toBe(true);
  });

  test("and not while the page is held, refreshed, or typed into", () => {
    expect(
      viewTransition({
        previousModel: onHome,
        model: leavingHomeForNew,
        message: clickedLink("/new"),
      }),
    ).toBe(false);
    // The URL catching up with the page that already took the screen is no second swap.
    const swapped = after(leavingHomeForNew, arrived(reply.newMusic(awaitedId(leavingHomeForNew))));
    expect(
      viewTransition({
        previousModel: swapped,
        model: after(swapped, changedUrl("/new")),
        message: changedUrl("/new"),
      }),
    ).toBe(false);
    // Placeholders giving way to the page's own content.
    expect(
      viewTransition({
        previousModel: opened("/"),
        model: onHome,
        message: arrived(reply.home("page:0", featured)),
      }),
    ).toBe(false);
    // A refresh arriving behind the page.
    const refreshingHome = after(onHome, clickedLink("/"));
    expect(
      viewTransition({
        previousModel: refreshingHome,
        model: after(refreshingHome, arrived(reply.home(awaitedId(refreshingHome)))),
        message: arrived(reply.home(awaitedId(refreshingHome))),
      }),
    ).toBe(false);
    expect(
      viewTransition({
        previousModel: onSearch,
        model: after(onSearch, changedUrl("/search?q=daft+punk")),
        message: changedUrl("/search?q=daft+punk"),
      }),
    ).toBe(false);
  });
});

describe("the search field", () => {
  test("takes the focus when Search opens from another page", () =>
    scene(
      app,
      given(onHome),
      Subscription.emit(clickedLink("/search")),
      Command.expectExact(FocusSearchField, NavigateInternal),
      Command.resolveAll(
        [FocusSearchField, Message.CompletedFocusSearchField()],
        [NavigateInternal, Message.CompletedNavigateInternal()],
      ),
      see(searchField).toHaveId("search-field"),
    ));

  test("typing rewrites the URL with what was typed", () =>
    scene(
      app,
      given(opened("/search")),
      type(searchField, "daft"),
      Command.expectExact(ReplaceSearchTerm({ maybeTerm: Option.some("daft") })),
      Command.resolve(ReplaceSearchTerm, Message.CompletedReplaceSearchTerm()),
    ));
});

describe("track rows", () => {
  test("every row plays its track and ends with a link to its page, in New and in Search", () =>
    scene(
      app,
      given(onNew),
      inside(
        role("list", { name: "Top songs" }),
        expectAll(all.role("link")).toHaveCount(2),
        see(trackRow(/Harder, Better, Faster, Stronger/)).toHaveAttr("href", trackPath(track.id)),
        see(trackRow(/Technologic/)).toHaveAttr("href", trackPath(explicitTrack.id)),
        // The row is the control that plays: its artist and its length are inside it.
        see(playRow("Harder, Better, Faster, Stronger")).toContainText("Daft Punk"),
        see(playRow("Harder, Better, Faster, Stronger")).toContainText("3:44"),
        // Its name carries what a sighted listener reads off the row.
        see(playRow("Technologic")).toHaveAccessibleName(
          "Play: Technologic, explicit, by Daft Punk, 4:05",
        ),
        // The way to the page is a control of its own, named for what it leads to.
        see(trackRow(/Technologic/)).toHaveAccessibleName("Details: Technologic"),
      ),
    ));

  test("a search result is a link to its track too", () =>
    scene(
      app,
      given(onSearch),
      inside(
        role("list", { name: "Songs" }),
        see(trackRow(/Harder, Better, Faster, Stronger/)).toHaveAttr("href", trackPath(track.id)),
      ),
    ));
});

describe("A1: the row shows that its track is loading", () => {
  test("the list stays, the chosen row is busy, and no navigation item is", () =>
    scene(
      app,
      given(onNew),
      see(trackRow(/Harder, Better, Faster, Stronger/)).toHaveAttr("aria-busy", "false"),
      Subscription.emit(clickedLink(trackPath(track.id))),
      inside(
        onScreen,
        // New is still the page on screen, whole.
        see(pageTitle("New")).toExist(),
        see(sectionTitle("Top albums")).toExist(),
        inside(
          trackRow(/Harder, Better, Faster, Stronger/),
          // The spinner stands where the link's arrow was: the mark is on the control that was pressed.
          expectAll(all.selector("svg.animate-spin")).toHaveCount(1),
        ),
        inside(rowOf(track.id), see(text("3:44")).toExist()),
        see(trackRow(/Harder, Better, Faster, Stronger/)).toHaveAttr("aria-busy", "true"),
        // Still a link to its track: a new tab, or a long press, opens it as ever.
        see(trackRow(/Harder, Better, Faster, Stronger/)).toHaveAttr("href", trackPath(track.id)),
        // Only that row.
        see(trackRow(/Technologic/)).toHaveAttr("aria-busy", "false"),
        inside(rowOf(explicitTrack.id), see(text("4:05")).toExist()),
        expectAll(all.selector("svg.animate-spin")).toHaveCount(1),
        // Nothing is said of a failure that has not happened.
        see(role("alert")).toBeAbsent(),
        see(text(/could not be opened/)).toBeAbsent(),
        // The row says that it is opening, to assistive technology only: the spinner says it on screen.
        see(text("Opening…")).toHaveAttr("role", "status"),
        see(text("Opening…")).toHaveClass("sr-only"),
      ),
      inside(
        navigation,
        expectAll(all.selector('[aria-busy="true"]')).toHaveCount(0),
        see(destination("New")).toHaveAttr("aria-current", "page"),
      ),
      // The page's own status leaves it to the row: the two never speak of the same thing.
      see(text("Showing New")).toExist(),
      see(text("Loading Song")).toBeAbsent(),
      Command.resolve(Catalog.TrackDetail, reply.track(nextId(onNew))),
      // The track's page takes the screen, the URL and the focus.
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusPage, Message.CompletedFocusPage()],
      ),
      inside(
        onScreen,
        see(pageTitle("Harder, Better, Faster, Stronger")).toExist(),
        see(pageTitle("New")).toBeAbsent(),
      ),
      see(text("Showing Harder, Better, Faster, Stronger")).toExist(),
      // A track is not a section: no item is the current page.
      inside(navigation, expectAll(all.selector("[aria-current]")).toHaveCount(0)),
    ));

  test("a kept list reads the same Model: its row for the track says the same", () => {
    // New was left for a search that found the same track; the track is opened from Search.
    const onSearchAfterNew = answered(chose(onNew, "/search?q=daft"), reply.search, "/search?q=daft");

    scene(
      app,
      given(chose(onSearchAfterNew, trackPath(track.id))),
      inside(
        onScreen,
        see(pageTitle("Search")).toExist(),
        see(trackRow(/Harder, Better, Faster, Stronger/)).toHaveAttr("aria-busy", "true"),
      ),
      inside(
        selector("#new-page[inert]"),
        see(trackRow(/Harder, Better, Faster, Stronger/)).toHaveAttr("aria-busy", "true"),
        see(trackRow(/Technologic/)).toHaveAttr("aria-busy", "false"),
      ),
    );
  });

  test("going Back while it loads clears the row", () =>
    scene(
      app,
      given(openingTrack),
      see(trackRow(/Harder, Better, Faster, Stronger/)).toHaveAttr("aria-busy", "true"),
      // New's own entry was the current one all along, so Back leaves New for Home.
      Subscription.emit(changedUrl("/")),
      inside(onScreen, see(pageTitle("Home")).toExist()),
      inside(
        selector("#new-page[inert]"),
        see(trackRow(/Harder, Better, Faster, Stronger/)).toHaveAttr("aria-busy", "false"),
      ),
      expectAll(all.selector("svg.animate-spin")).toHaveCount(0),
      Command.resolve(Catalog.HomeFeed, reply.home(nextId(openingTrack))),
    ));

  test("choosing another row clears the first: one row loads at a time, and none says it failed", () =>
    scene(
      app,
      given(chose(openingTrack, trackPath(explicitTrack.id))),
      inside(
        topSongs,
        see(trackRow(/Harder, Better, Faster, Stronger/)).toHaveAttr("aria-busy", "false"),
        inside(rowOf(track.id), see(text("3:44")).toExist()),
        see(trackRow(/Technologic/)).toHaveAttr("aria-busy", "true"),
        expectAll(all.selector("svg.animate-spin")).toHaveCount(1),
        expectAll(tryAgainButtons).toHaveCount(0),
        see(text(/could not be opened/)).toBeAbsent(),
      ),
    ));
});

describe("A4: a row says that its track failed to open", () => {
  const failedToOpen = answered(openingTrack, reply.trackRefused);
  const failure = "This song could not be opened. The music catalog is not answering right now.";

  test("the list stays as it is, and the row states the failure with a way to try again", () =>
    scene(
      app,
      given(failedToOpen),
      inside(
        onScreen,
        see(pageTitle("New")).toExist(),
        see(sectionTitle("Top albums")).toExist(),
        inside(
          topSongs,
          expectAll(all.role("listitem")).toHaveCount(2),
          // The row is itself again: a link, its length back, nothing spinning.
          see(trackRow(/Harder, Better, Faster, Stronger/)).toHaveAttr("aria-busy", "false"),
          see(trackRow(/Harder, Better, Faster, Stronger/)).toHaveAttr("href", trackPath(track.id)),
          inside(rowOf(track.id), see(text("3:44")).toExist()),
          expectAll(all.selector("svg.animate-spin")).toHaveCount(0),
          see(text(failure)).toExist(),
          // One way to try again, for the row that failed, and it says which.
          expectAll(tryAgainButtons).toHaveCount(1),
          see(tryAgainOn("Harder, Better, Faster, Stronger")).toHaveText("Try again"),
          // The other row is as it was.
          see(trackRow(/Technologic/)).toHaveAttr("aria-busy", "false"),
          inside(rowOf(explicitTrack.id), see(text("4:05")).toExist()),
        ),
      ),
      see(text("Showing New")).toExist(),
    ));

  test("the failure is said politely, in a place that was already there to be heard", () =>
    scene(
      app,
      given(onNew),
      // Every row has its status, empty while there is nothing to say.
      inside(topSongs, expectAll(all.role("status")).toHaveCount(2)),
      Subscription.emit(clickedLink(trackPath(track.id))),
      Command.resolve(Catalog.TrackDetail, reply.trackRefused(nextId(onNew))),
      inside(
        topSongs,
        expectAll(all.role("status")).toHaveCount(2),
        see(text(failure)).toHaveAttr("role", "status"),
        // Polite: a status, never an alert that would cut in.
        see(role("alert")).toBeAbsent(),
      ),
      // The page did not change, so its status has nothing new to say.
      see(text("Showing New")).toExist(),
    ));

  test("a lost connection, or a request nobody answered, is worded as one", () =>
    scene(
      app,
      given(answered(openingTrack, reply.trackLost)),
      see(
        text("This song could not be opened. Bafle could not be reached. Check your connection."),
      ).toHaveAttr("role", "status"),
    ));

  test("Try again is an ordinary button after the row, so the keyboard reaches it", () =>
    scene(
      app,
      given(failedToOpen),
      inside(
        topSongs,
        see(tryAgainOn("Harder, Better, Faster, Stronger")).toHaveAttr("type", "button"),
        see(tryAgainOn("Harder, Better, Faster, Stronger")).not.toHaveAttr("tabindex"),
        see(tryAgainOn("Harder, Better, Faster, Stronger")).not.toHaveAttr("disabled"),
        see(tryAgainOn("Harder, Better, Faster, Stronger")).toHaveClass("focus-visible:outline-2"),
        // It is not inside the link: a button in a link is no button at all.
        inside(
          trackRow(/Harder, Better, Faster, Stronger/),
          expectAll(all.role("button")).toHaveCount(0),
        ),
      ),
    ));

  test("Try again retries in place: the row loads again, and takes the focus the button held", () =>
    scene(
      app,
      given(failedToOpen),
      click(tryAgainOn("Harder, Better, Faster, Stronger")),
      Command.expectExact(Catalog.TrackDetail, FocusTrackRow),
      Command.resolve(FocusTrackRow, Message.CompletedFocusTrackRow()),
      inside(
        onScreen,
        see(pageTitle("New")).toExist(),
        see(trackRow(/Harder, Better, Faster, Stronger/)).toHaveAttr("aria-busy", "true"),
        // Loading, and no longer failed.
        see(text(failure)).toBeAbsent(),
        expectAll(tryAgainButtons).toHaveCount(0),
      ),
      Command.resolve(Catalog.TrackDetail, reply.track(nextId(failedToOpen))),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusPage, Message.CompletedFocusPage()],
      ),
      inside(onScreen, see(pageTitle("Harder, Better, Faster, Stronger")).toExist()),
    ));

  test("the failure stays on its row while another row is opened", () =>
    scene(
      app,
      given(chose(failedToOpen, trackPath(explicitTrack.id))),
      inside(
        topSongs,
        see(text(failure)).toExist(),
        see(tryAgainOn("Harder, Better, Faster, Stronger")).toExist(),
        see(trackRow(/Technologic/)).toHaveAttr("aria-busy", "true"),
      ),
    ));
});

describe("A5: a row says that the catalog does not have its track", () => {
  const missing = answered(openingTrack, reply.trackMissing);

  test("the row is no longer something to open: not a link, with nothing to press", () =>
    scene(
      app,
      given(missing),
      inside(
        onScreen,
        see(pageTitle("New")).toExist(),
        inside(
          topSongs,
          // Still listed, and still named.
          expectAll(all.role("listitem")).toHaveCount(2),
          see(text("Harder, Better, Faster, Stronger")).toExist(),
          // The other row is the only link left, and nothing links to the missing track.
          expectAll(all.role("link")).toHaveCount(1),
          see(trackRow(/Harder, Better, Faster, Stronger/)).toBeAbsent(),
          expectAll(all.selector(`a[href="${trackPath(track.id)}"]`)).toHaveCount(0),
          expectAll(all.selector('[tabindex="0"]')).toHaveCount(0),
          // For good: no Try again.
          expectAll(tryAgainButtons).toHaveCount(0),
          see(text("This song is not available.")).toHaveAttr("role", "status"),
          expectAll(all.selector("svg.animate-spin")).toHaveCount(0),
          see(trackRow(/Technologic/)).toHaveAttr("href", trackPath(explicitTrack.id)),
        ),
      ),
      see(role("alert")).toBeAbsent(),
    ));

  test("that is said politely as the answer arrives", () =>
    scene(
      app,
      given(onNew),
      see(text("This song is not available.")).toBeAbsent(),
      Subscription.emit(clickedLink(trackPath(track.id))),
      Command.resolve(Catalog.TrackDetail, reply.trackMissing(nextId(onNew))),
      see(text("This song is not available.")).toHaveAttr("role", "status"),
      // The link the listener pressed is gone: what stands in its place takes the focus it held.
      Command.expectExact(FocusTrackRow),
      Command.resolve(FocusTrackRow, Message.CompletedFocusTrackRow()),
      inside(topSongs, expectAll(all.selector("span[data-track-row]")).toHaveCount(1)),
    ));
});

describe("the track page", () => {
  test("shows the cover, the title, who is credited, the album and what the catalog knows", () =>
    scene(
      app,
      given(onTrack),
      inside(
        onScreen,
        see(pageTitle("Harder, Better, Faster, Stronger")).toExist(),
        see(text("Discovery")).toExist(),
        inside(
          role("list", { name: "Artists" }),
          expectAll(all.role("listitem")).toHaveCount(2),
          see(text("Daft Punk")).toExist(),
          see(text("Romanthony")).toExist(),
          // One has a picture, round; the other gets the mark that stands for none.
          expectAll(all.selector("img")).toHaveCount(1),
          expectAll(all.selector(".rounded-full")).toHaveCount(2),
        ),
        inside(
          selector("dl"),
          see(text("3:44")).toExist(),
          see(text("March 12, 2001")).toExist(),
          see(selector("time")).toHaveAttr("dateTime", "2001-03-12"),
          see(text("Track 4")).toExist(),
        ),
        expectAll(all.text("Explicit")).toHaveCount(0),
      ),
      see(text("Showing Harder, Better, Faster, Stronger")).toExist(),
    ));

  test("the document is titled after the track, once the track is on screen", () => {
    expect(documentTitle(onTrack)).toBe("Harder, Better, Faster, Stronger · Bafle");
    // While the list is held, it is still the list's document.
    expect(documentTitle(openingTrack)).toBe("New · Bafle");
    expect(documentTitle(opened(trackPath(track.id)))).toBe("Song · Bafle");
  });

  test("leaves out what the catalog does not know, and marks an explicit track", () => {
    const opening = chose(onNew, trackPath(explicitTrack.id));

    scene(
      app,
      given(
        answered(
          opening,
          (requestId) => reply.track(requestId, bareTrack),
          trackPath(explicitTrack.id),
        ),
      ),
      inside(
        onScreen,
        see(pageTitle(/Technologic/)).toExist(),
        expectAll(all.text("Explicit")).toHaveCount(1),
        inside(
          selector("dl"),
          expectAll(all.selector("dt")).toHaveCount(1),
          see(text("4:05")).toExist(),
          see(text("Released")).toBeAbsent(),
          see(text(/Track/)).toBeAbsent(),
        ),
        // No cover either: the box holds the mark for a missing picture, not a broken image.
        expectAll(all.selector("img")).toHaveCount(1),
      ),
    );
  });

  test("has a control to play its track, and no audio element of its own", () =>
    scene(
      app,
      given(onTrack),
      // The sound belongs to the app, not to a page: no page holds the thing that makes it.
      expectAll(all.selector("audio")).toHaveCount(0),
      inside(
        onScreen,
        expectAll(all.role("button")).toHaveCount(2),
        see(backControl).toExist(),
        see(role("button", { name: "Play: Harder, Better, Faster, Stronger" })).toHaveText("Play"),
      ),
    ));
});

describe("rule d: a direct link paints the track page's shape", () => {
  test("placeholders stand for the cover, the title and the facts", () =>
    scene(
      app,
      given(opened(trackPath(track.id))),
      inside(
        onScreen,
        // Named for assistive technology, though there is no title to show yet.
        see(pageTitle("Song")).toExist(),
        expectAll(placeholders).toHaveCount(1),
        expectAll(all.selector('[aria-busy="true"] .animate-pulse.aspect-square')).toHaveCount(1),
        expectAll(placeholderBlocks).not.toBeEmpty(),
        // Nothing behind a direct link: the way out is a link to Home.
        see(homeControl).toHaveAttr("href", "/"),
        see(backControl).toBeAbsent(),
      ),
      see(text("Loading Song")).toExist(),
    ));

  test("the reply fills the page in", () => {
    const firstPaint = opened(trackPath(track.id));

    scene(
      app,
      given(after(firstPaint, arrived(reply.track(awaitedId(firstPaint))))),
      inside(
        onScreen,
        see(pageTitle("Harder, Better, Faster, Stronger")).toExist(),
        expectAll(placeholders).toHaveCount(0),
        see(homeControl).toExist(),
      ),
    );
  });
});

describe("B: a track reached through the browser's history fails in its own page", () => {
  // New is on screen; the browser goes to a track that has never loaded, say by Forward.
  const heldForTrack = after(onNew, changedUrl(trackPath(track.id)));

  test("while it loads the list is held, and its row says so", () =>
    scene(
      app,
      given(heldForTrack),
      inside(
        onScreen,
        see(pageTitle("New")).toExist(),
        see(trackRow(/Harder, Better, Faster, Stronger/)).toHaveAttr("aria-busy", "true"),
      ),
      see(text("Loading Song")).toExist(),
    ));

  test("a track the catalog does not have says so for good: a way out, and no Try again", () =>
    scene(
      app,
      given(answered(heldForTrack, reply.trackMissing)),
      inside(
        onScreen,
        see(pageTitle("This song is not available")).toExist(),
        see(homeControl).toExist(),
      ),
      see(tryAgain).toBeAbsent(),
      see(role("alert")).toBeAbsent(),
    ));

  test("on a direct link, the missing track's way out leads Home", () =>
    scene(
      app,
      given(answered(opened(trackPath(track.id)), reply.trackMissing)),
      see(pageTitle("This song is not available")).toExist(),
      see(homeControl).toHaveAttr("href", "/"),
      see(tryAgain).toBeAbsent(),
    ));

  test("a catalog that cannot answer says why, and Try again loads the page where it stands", () => {
    const refused = answered(heldForTrack, reply.trackRefused);

    scene(
      app,
      given(refused),
      inside(
        onScreen,
        see(pageTitle("Song")).toExist(),
        inside(
          role("alert"),
          see(text("Song could not load.")).toExist(),
          see(text("The music catalog is not answering right now.")).toExist(),
        ),
        see(homeControl).toExist(),
      ),
      click(tryAgain),
      Command.resolve(FocusPage, Message.CompletedFocusPage()),
      see(role("alert")).toBeAbsent(),
      inside(onScreen, expectAll(placeholders).toHaveCount(1)),
      Command.resolve(Catalog.TrackDetail, reply.track(nextId(refused))),
      inside(onScreen, see(pageTitle("Harder, Better, Faster, Stronger")).toExist()),
    );
  });

  test("a direct link that fails states it in the track's page too", () =>
    scene(
      app,
      given(answered(opened(trackPath(track.id)), reply.trackLost)),
      inside(
        onScreen,
        see(pageTitle("Song")).toExist(),
        inside(role("alert"), see(text("Song could not load.")).toExist()),
        see(tryAgain).toExist(),
      ),
    ));

  test("a refresh that fails keeps the track on screen, under the quiet notice", () => {
    const refreshing = chose(onTrack, trackPath(track.id));

    scene(
      app,
      given(answered(refreshing, reply.trackRefused)),
      inside(
        onScreen,
        see(pageTitle("Harder, Better, Faster, Stronger")).toExist(),
        see(text("March 12, 2001")).toExist(),
        see(text(/Showing what loaded earlier/)).toExist(),
        see(tryAgain).toExist(),
      ),
      see(role("alert")).toBeAbsent(),
    );
  });

  test("a refresh shows no spinner over the track", () =>
    scene(
      app,
      given(chose(onTrack, trackPath(track.id))),
      inside(
        onScreen,
        see(pageTitle("Harder, Better, Faster, Stronger")).toExist(),
        expectAll(all.selector("svg.animate-spin")).toHaveCount(0),
        expectAll(all.selector(".animate-pulse")).toHaveCount(0),
      ),
    ));
});

describe("rule f: the pages behind the one on screen are kept, and hidden", () => {
  test("behind a track, its list is still in the document, with its rows and its pictures", () =>
    scene(
      app,
      given(onTrack),
      // Home, New and the track: three pages, one on screen.
      expectAll(pages).toHaveCount(3),
      expectAll(keptPages).toHaveCount(2),
      inside(
        selector("#new-page[inert]"),
        see(pageTitle("New")).toExist(),
        expectAll(all.role("link")).toHaveCount(2),
        expectAll(all.selector("img")).toHaveCount(2),
      ),
      see(selector("#home-page[inert]")).toExist(),
      see(selector("#track-page:not([inert])")).toExist(),
    ));

  test("a kept page is not drawn, and the page on screen is", () =>
    scene(
      app,
      given(onTrack),
      // Each page has its place; only the place of the page on screen is visible.
      expectAll(all.selector("main div.absolute.inset-0")).toHaveCount(4),
      expectAll(all.selector("main div.absolute.inset-0.invisible")).toHaveCount(3),
      expectAll(all.selector("main .invisible #new-page")).toHaveCount(1),
      expectAll(all.selector("main .invisible #home-page")).toHaveCount(1),
      expectAll(all.selector("main .invisible #track-page")).toHaveCount(0),
    ));

  test("going from one section to another keeps the first behind the second", () =>
    scene(
      app,
      given(onNew),
      see(selector("#home-page[inert]")).toExist(),
      see(selector("#new-page:not([inert])")).toExist(),
      Subscription.emit(changedUrl("/")),
      see(selector("#home-page:not([inert])")).toExist(),
      see(selector("#new-page[inert]")).toExist(),
      expectAll(pages).toHaveCount(2),
      Command.resolve(Catalog.HomeFeed, reply.home(nextId(onNew))),
    ));

  test("back from a track, the list is the page on screen again and the track's page is gone", () =>
    scene(
      app,
      given(onTrack),
      click(backControl),
      Command.expectExact(NavigateBack),
      Command.resolve(NavigateBack, Message.CompletedNavigateBack()),
      // The browser goes back, and the URL changes.
      Subscription.emit(changedUrl("/new")),
      see(selector("#new-page:not([inert])")).toExist(),
      see(selector("#track-page")).toBeAbsent(),
      inside(onScreen, see(pageTitle("New")).toExist()),
      see(destination("New")).toHaveAttr("aria-current", "page"),
      // The focus goes back to the row the track was opened from.
      Command.resolve(FocusTrackRow, Message.CompletedFocusTrackRow()),
      Command.resolve(Catalog.NewMusic, reply.newMusic(nextId(onTrack))),
    ));

  test("a kept search still holds its term and its results", () => {
    scene(
      app,
      given(answered(chose(onSearch, trackPath(track.id)), reply.track, trackPath(track.id))),
      see(selector("#search-page[inert]")).toExist(),
      see(searchField).toHaveValue("daft"),
      inside(
        results,
        see(sectionTitle("Songs")).toExist(),
        see(sectionTitle("Albums")).toExist(),
      ),
      // As it was left, not dimmed as if a new term were loading.
      see(results).not.toHaveClass("opacity-60"),
      see(results).toHaveAttr("aria-busy", "false"),
    );
  });

  test("every id in the document is the id of one element, whatever pages are kept", () => {
    const searchThenTrack = answered(
      chose(onSearch, trackPath(track.id)),
      reply.track,
      trackPath(track.id),
    );
    const allMounted = answered(chose(searchThenTrack, "/new"), reply.newMusic, "/new");

    scene(
      app,
      given(allMounted),
      expectAll(pages).toHaveCount(2),
      ...[
        "search-page",
        "search-page-title",
        "new-page",
        "new-page-title",
        "search-field",
        "search-songs",
        "new-top-songs",
        "new-top-albums",
      ].map((id) => expectAll(all.selector(`[id="${id}"]`)).toHaveCount(1)),
    );
  });

  test("a section with nothing to keep is not kept", () => {
    // New failed with nothing to show; the listener went back Home.
    const failedNew = answered(leavingHomeForNew, reply.newMusicRefused, "/new");

    scene(
      app,
      given(after(failedNew, changedUrl("/"))),
      expectAll(pages).toHaveCount(1),
      see(selector("#new-page")).toBeAbsent(),
      see(tryAgain).toBeAbsent(),
      Command.expectNone(),
    );
  });
});

describe("rule g: the cover is one element on its way between the row and the page", () => {
  const coverName = `track-cover-${track.id}`;

  test("on the list, each row's cover carries the name of its track", () =>
    scene(
      app,
      given(onNew),
      inside(
        rowOf(track.id),
        see(selector("[data-cover]")).toHaveStyle("view-transition-name", coverName),
      ),
      inside(
        rowOf(explicitTrack.id),
        see(selector("[data-cover]")).toHaveStyle("view-transition-name", `track-cover-${explicitTrack.id}`),
      ),
    ));

  test("on the track's page the cover carries it, and the kept row gives it up", () =>
    scene(
      app,
      given(onTrack),
      inside(
        selector("#track-page"),
        see(selector(".aspect-square.rounded-2xl")).toHaveStyle("view-transition-name", coverName),
      ),
      inside(
        selector("#new-page"),
        inside(rowOf(track.id), see(selector("[data-cover]")).not.toHaveStyle("view-transition-name")),
        inside(
          rowOf(explicitTrack.id),
          see(selector("[data-cover]")).not.toHaveStyle("view-transition-name"),
        ),
      ),
    ));

  test("the cover draws the rendition its row already loaded, under the large one", () =>
    scene(
      app,
      given(onTrack),
      inside(
        selector("#track-page .aspect-square.rounded-2xl"),
        expectAll(all.selector("img")).toHaveCount(2),
        // The row's own picture, decoded before the first paint: never an empty box.
        see(selector(`img[src="${track.album.cover?.small}"]`)).toHaveAttr("decoding", "sync"),
        see(selector(`img[src="${track.album.cover?.small}"]`)).not.toHaveAttr("loading"),
        see(selector(`img[src="${track.album.cover?.large}"]`)).not.toHaveAttr("loading"),
      ),
    ));

  test("opening a track and leaving it are swaps like any other: they ask for a transition", () => {
    expect(
      viewTransition({
        previousModel: openingTrack,
        model: onTrack,
        message: arrived(reply.track(awaitedId(openingTrack))),
      }),
    ).toBe(true);
    expect(
      viewTransition({
        previousModel: onTrack,
        model: after(onTrack, changedUrl("/new")),
        message: changedUrl("/new"),
      }),
    ).toBe(true);
    // The row turning busy is not a swap.
    expect(
      viewTransition({
        previousModel: onNew,
        model: openingTrack,
        message: clickedLink(trackPath(track.id)),
      }),
    ).toBe(false);
    // Nor is a row saying that its track failed to open.
    expect(
      viewTransition({
        previousModel: openingTrack,
        model: answered(openingTrack, reply.trackRefused),
        message: arrived(reply.trackRefused(awaitedId(openingTrack))),
      }),
    ).toBe(false);
  });
});

describe("rule h: the way back", () => {
  test("a track opened from a list goes back through the history, not by a link", () =>
    scene(
      app,
      given(onTrack),
      inside(onScreen, see(backControl).toExist(), see(homeControl).toBeAbsent()),
      click(backControl),
      Command.expectExact(NavigateBack),
      Command.resolve(NavigateBack, Message.CompletedNavigateBack()),
    ));
});
