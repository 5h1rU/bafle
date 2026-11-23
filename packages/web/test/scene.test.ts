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
  Subscription,
  text,
  type,
} from "foldkit/scene";
import { describe, expect, test } from "vitest";
import { Catalog } from "../src/catalog.ts";
import {
  FocusPage,
  FocusSearchField,
  ReplaceSearchTerm,
  WaitForTypingPause,
} from "../src/command.ts";
import { update, viewTransition } from "../src/main.ts";
import { Message } from "../src/message.ts";
import { view } from "../src/view.ts";
import {
  after,
  arrived,
  awaitedId,
  changedUrl,
  clickedLink,
  featured,
  foundMore,
  leavingHomeForNew,
  nextId,
  nothingFound,
  onHome,
  onNew,
  onSearch,
  opened,
  reply,
} from "./fixtures.ts";

const app = { update, view };

const navigation = role("navigation", { name: "Main" });
const destination = (name: string) => role("link", { name });
const pageTitle = (name: string) => role("heading", { name, level: 1 });
const sectionTitle = (name: string) => role("heading", { name, level: 2 });
const searchField = role("searchbox", { name: "Search the catalog" });
const results = role("region", { name: "Results" });
const tryAgain = role("button", { name: "Try again" });
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

describe("rule 1: hold, then swap", () => {
  test("the page stays while the chosen item shows it is loading; then the page swaps", () =>
    scene(
      app,
      given(onHome),
      // Following a link is the runtime's doing: the scene starts where the URL has changed.
      see(destination("New")).toHaveAttr("href", "/new"),
      Subscription.emit(changedUrl("/new")),
      // Home is still whole: its title, its shelves, its item marked as the current page.
      see(pageTitle("Home")).toExist(),
      see(text("Discovery")).toExist(),
      see(destination("Home")).toHaveAttr("aria-current", "page"),
      see(destination("New")).toHaveAttr("aria-busy", "true"),
      see(text("Loading New")).toExist(),
      Command.resolve(Catalog.NewMusic, reply.newMusic(nextId(onHome))),
      see(pageTitle("New")).toExist(),
      see(pageTitle("Home")).toBeAbsent(),
      see(destination("New")).toHaveAttr("aria-current", "page"),
      see(destination("New")).toHaveAttr("aria-busy", "false"),
      // Said to assistive technology, which saw neither the spinner nor the swap.
      see(text("Loading New")).toBeAbsent(),
      see(text("Showing New")).toExist(),
    ));
});

describe("rule 3: revisits are instant", () => {
  test("a page that holds data shows it at once, with nothing in its place while it refreshes", () =>
    scene(
      app,
      given(onNew),
      Subscription.emit(changedUrl("/")),
      see(pageTitle("Home")).toExist(),
      see(text("Discovery")).toExist(),
      see(destination("Home")).toHaveAttr("aria-busy", "false"),
      Command.resolve(Catalog.HomeFeed, reply.home(nextId(onNew))),
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
      // Two album covers, on the first track and the shelf; the second track's album has none.
      expectAll(all.selector("img")).toHaveCount(2),
      expectAll(all.selector('img[loading="lazy"]')).toHaveCount(2),
      // Decorative: the title beside each picture already names it.
      expectAll(all.selector('img[alt=""]')).toHaveCount(2),
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
  const failedNew = after(
    leavingHomeForNew,
    arrived(reply.newMusicRefused(awaitedId(leavingHomeForNew))),
  );

  test("a page with nothing to show says why, and Try again loads it where it stands", () =>
    scene(
      app,
      given(failedNew),
      see(pageTitle("New")).toExist(),
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
    const refreshingHome = after(onNew, changedUrl("/"));

    scene(
      app,
      given(after(refreshingHome, arrived(reply.homeRefused(awaitedId(refreshingHome))))),
      see(text("Discovery")).toExist(),
      see(role("alert")).toBeAbsent(),
      see(text("Showing what loaded earlier. The music catalog is not answering right now.")).toExist(),
      click(tryAgain),
      Command.resolve(FocusPage, Message.CompletedFocusPage()),
      see(text("Discovery")).toExist(),
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
    // Typed on, then chose Home before the pause passed: Search is held, its query never went out.
    const typedThenLeft = after(onSearch, changedUrl("/search?q=daft+punk"), changedUrl("/"));

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
    const leavingSearchForHome = after(onSearch, changedUrl("/"));
    const onHomeAfterSearch = after(
      leavingSearchForHome,
      arrived(reply.home(awaitedId(leavingSearchForHome))),
    );

    scene(
      app,
      given(after(onHomeAfterSearch, changedUrl("/search?q=daft"))),
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
      Subscription.emit(changedUrl("/search")),
      Command.expectExact(FocusSearchField),
      Command.resolve(FocusSearchField, Message.CompletedFocusSearchField()),
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
