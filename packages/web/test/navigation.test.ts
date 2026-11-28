import {
  Command,
  Mount,
  Subscription,
  click,
  given,
  inside,
  role,
  expect as see,
  selector,
} from "foldkit/scene";
import * as Option from "effect/Option";
import { describe, expect, test } from "vitest";
import { FocusNavigation } from "../src/command.ts";
import { update } from "../src/main.ts";
import { Message } from "../src/message.ts";
import type { Model } from "../src/model.ts";
import * as Player from "../src/player/index.ts";
import * as Sheet from "../src/sheet/index.ts";
import {
  DRAWS_BACK_AFTER_PIXELS,
  type PagePosition,
  TOP_WITHIN_PIXELS,
  followDown,
  isAtTop,
} from "../src/subscription.ts";
import { view } from "../src/view.ts";
import { PAGE_IDS } from "../src/view/layout.ts";
import {
  after,
  arrived,
  bareTrack,
  changedUrl,
  clickedLink,
  explicitTrack,
  nextId,
  onHome,
  onNew,
  onSearch,
  reply,
  scene,
  track,
  trackPath,
} from "./fixtures.ts";

const app = { update, view };

const shell = selector("[data-navigation]");
const navigation = role("navigation", { name: "Main" });
const circle = role("button", { name: "Show navigation" });
/** The circle on Search, where a press of it leads to the section it shows. */
const circleTo = (section: string) => role("button", { name: `Go to ${section}` });

/** New on screen with its first track playing: there is an island. */
const withIsland: Model = after(onNew, Message.ClickedPlayTrack({ trackId: track.id, from: "New" }));

/** The same, scrolled down: the menu has drawn back, and the island is in its row. */
const drawnBack: Model = after(withIsland, Message.ScrolledDown());

const playing: Model = drawnBack;

/** The island pressed: the player expanded on the track it holds. */
const expanded: Model = after(
  playing,
  clickedLink(trackPath(track.id)),
  arrived(reply.track(nextId(playing))),
  changedUrl(trackPath(track.id)),
);

/** The island entered the document: what is bound to its pieces ran. */
// NOTE: a function, not a step kept and used again: the step takes the
// Mounts it is given out of its own list as it finds them.
const islandEnters = () =>
  Mount.resolveAll(
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

describe("the navigation draws back as a page goes down, and comes out again", () => {
  test("it starts whole", () => {
    expect(onNew.navigation).toBe("Open");
  });

  test("with nothing played there is no island to make room for: it stays whole however far the page goes down", () => {
    expect(after(onNew, Message.ScrolledDown()).navigation).toBe("Open");
    expect(after(onHome, Message.ScrolledDown(), Message.ScrolledDown()).navigation).toBe("Open");
    // Once something is played there is an island, and the next way down draws the menu back.
    expect(after(onNew, Message.ScrolledDown()).navigation).toBe("Open");
    expect(after(withIsland, Message.ScrolledDown()).navigation).toBe("Minimized");
  });

  test("a page scrolled down draws it back; the top of a page brings it out", () => {
    expect(drawnBack.navigation).toBe("Minimized");
    expect(after(drawnBack, Message.ScrolledToTop()).navigation).toBe("Open");
  });

  test("its circle brings it out where the page stands, and the focus goes to the menu", () => {
    const pressed = update(drawnBack, Message.ClickedShowNavigation());
    expect(pressed.model.navigation).toBe("Open");
    expect((pressed.commands ?? []).map((command) => command.name)).toEqual(["FocusNavigation"]);
    // Out in the middle of a page, it draws back again when the page goes on down.
    expect(after(pressed.model, Message.ScrolledDown()).navigation).toBe("Minimized");
  });

  test("choosing a section shows it whole", () => {
    expect(after(drawnBack, clickedLink("/search")).navigation).toBe("Open");
    expect(after(drawnBack, clickedLink("/")).navigation).toBe("Open");
  });

  test("a track's page leaves it as it was, and so does coming back from it", () => {
    const onDetails = after(
      drawnBack,
      clickedLink(trackPath(explicitTrack.id)),
      arrived(reply.track(nextId(drawnBack), bareTrack)),
      changedUrl(trackPath(explicitTrack.id)),
    );
    expect(onDetails.route._tag).toBe("Track");
    expect(onDetails.navigation).toBe("Minimized");
    expect(after(onDetails, changedUrl("/new")).navigation).toBe("Minimized");
  });

  test("the expanded player has no navigation under it: scrolling it changes nothing for the page behind", () => {
    expect(expanded.navigation).toBe("Minimized");
    expect(after(expanded, Message.ScrolledToTop()).navigation).toBe("Minimized");
    expect(after(expanded, changedUrl("/new")).navigation).toBe("Minimized");

    const openedWhole = after(
      after(onNew, Message.ClickedPlayTrack({ trackId: track.id, from: "New" })),
      clickedLink(trackPath(track.id)),
    );
    expect(after(openedWhole, Message.ScrolledDown()).navigation).toBe("Open");
  });
});

describe("following a page down", () => {
  const at = (top: number, pageId: string = PAGE_IDS.New): PagePosition => ({ pageId, top });

  test("it has gone down once it stands further below its highest point than the distance watched for", () => {
    expect(followDown(at(0), at(DRAWS_BACK_AFTER_PIXELS))[1]).toBe(false);
    expect(followDown(at(0), at(DRAWS_BACK_AFTER_PIXELS + 1))[1]).toBe(true);
  });

  test("one event can carry the whole distance: a turn of a wheel, a press of Space", () => {
    expect(followDown(at(0), at(300))[1]).toBe(true);
  });

  test("brought out in the middle of a page, the way down is measured from there", () => {
    expect(followDown(at(500), at(540))[1]).toBe(false);
    expect(followDown(at(500), at(549))[1]).toBe(true);
  });

  test("going up moves the highest point up with the page, and is never going down", () => {
    const [highest, hasGoneDown] = followDown(at(500), at(300));
    expect(highest).toEqual(at(300));
    expect(hasGoneDown).toBe(false);
    expect(followDown(highest, at(349))[1]).toBe(true);
  });

  test("another page is a new start, wherever it stands", () => {
    const [highest, hasGoneDown] = followDown(at(0), at(600, PAGE_IDS.Home));
    expect(highest).toEqual(at(600, PAGE_IDS.Home));
    expect(hasGoneDown).toBe(false);
  });

  test("the top is reached a little before the very top", () => {
    expect(isAtTop(at(TOP_WITHIN_PIXELS))).toBe(true);
    expect(isAtTop(at(TOP_WITHIN_PIXELS + 1))).toBe(false);
  });
});

describe("the navigation on screen", () => {
  test("the shell says how it stands, for the menu and the island to read", () =>
    scene(
      app,
      given(withIsland),
      islandEnters(),
      see(shell).toHaveAttr("data-navigation", "open"),
      Subscription.emit(Message.ScrolledDown()),
      see(shell).toHaveAttr("data-navigation", "minimized"),
      Subscription.emit(Message.ScrolledToTop()),
      see(shell).toHaveAttr("data-navigation", "open"),
    ));

  test("its circle shows the section on screen, and a press brings the menu out", () =>
    scene(
      app,
      given(drawnBack),
      islandEnters(),
      inside(navigation, see(circle).toHaveAttr("data-section", "New")),
      click(circle),
      Command.expectExact(FocusNavigation),
      Command.resolve(FocusNavigation, Message.CompletedFocusNavigation()),
      see(shell).toHaveAttr("data-navigation", "open"),
    ));

  // NOTE: what a class does is the style sheet's, and a scene has no style
  // sheet: these say which element carries the class that takes it out of the
  // order of focus on a narrow screen (`visibility: hidden`), and which keeps
  // being drawn inside it.
  test("drawn back, the circle has one thing to focus: the item it shows is a picture, not a link to follow", () =>
    scene(
      app,
      given(drawnBack),
      islandEnters(),
      inside(
        navigation,
        // The item for where the listener is: gone as a link, its icon still drawn.
        see(role("link", { name: "New" })).toHaveClass("minimized:invisible"),
        see(selector('a[aria-current] svg')).toHaveClass("minimized:visible"),
        // Search is its own control, and stays one.
        see(role("link", { name: "Search" })).not.toHaveClass("minimized:invisible"),
      ),
    ));

  test("on a page that is none of the menu's, the circle shows the nearest section behind it", () =>
    scene(
      app,
      given(after(onSearch, Message.ScrolledDown())),
      // Search was opened by its address: nothing is behind it, so the circle shows Home.
      see(circleTo("Home")).toHaveAttr("data-section", "Home"),
      // It leads there, and says so: it is no control that only brings the menu out.
      see(circle).toBeAbsent(),
    ));

  test("Search reached from New shows New in the circle once its page goes down", () =>
    scene(
      app,
      given(after(onNew, clickedLink("/search"), Message.ScrolledDown())),
      see(circleTo("New")).toHaveAttr("data-section", "New"),
    ));

  test("on Search a press of the circle brings the menu out and goes to the section it shows, in the one press", () => {
    // With something played there is an island, so the menu draws back as the page goes down.
    const onSearchFromNew = after(withIsland, clickedLink("/search"), Message.ScrolledDown());
    expect(onSearchFromNew.route._tag).toBe("Search");
    expect(onSearchFromNew.navigation).toBe("Minimized");

    const pressed = update(onSearchFromNew, Message.ClickedShowNavigation());
    expect(pressed.model.navigation).toBe("Open");
    // New is held, so it takes the screen at once, as it does from its item in the menu.
    expect(pressed.model.route._tag).toBe("New");
    const issued = (pressed.commands ?? []).map((command) => command.name);
    expect(issued).toContain("NavigateInternal");
    expect(issued).not.toContain("FocusNavigation");
  });

  test("under the expanded player there is no navigation on a narrow screen", () =>
    scene(
      app,
      given(expanded),
      Mount.resolveAll([Sheet.FollowSheet, Sheet.Message.ChangedReach({ reach: "Whole" })]),
      see(selector("header")).toHaveClass("max-md:hidden"),
    ));

  test("on any other page it is there", () =>
    scene(app, given(onHome), see(selector("header")).not.toHaveClass("max-md:hidden")));
});
