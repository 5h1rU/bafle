import * as Option from "effect/Option";
import {
  all,
  click,
  Command,
  expect as see,
  expectAll,
  given,
  inside,
  keydown,
  role,
  scene,
  selector,
  Subscription,
  tap,
  text,
} from "foldkit/scene";
import { Lazy } from "foldkit/test";
import { describe, expect, test } from "vitest";
import { Catalog } from "../src/catalog.ts";
import {
  FocusPage,
  FocusTrackRow,
  NavigateBack,
  NavigateInternal,
  ReplaceTrackUrl,
} from "../src/command.ts";
import { update, viewTransition } from "../src/main.ts";
import { Message } from "../src/message.ts";
import { isPlayerExpanded, type Model } from "../src/model.ts";
import { AppRoute } from "../src/route.ts";
import type { EnginePhase, EngineReport } from "../src/player/audioEngine.ts";
import * as Player from "../src/player/index.ts";
import { view } from "../src/view.ts";
import {
  after,
  answered,
  arrived,
  bareTrack,
  changedUrl,
  clickedLink,
  explicitTrack,
  fullTrack,
  nextId,
  onHome,
  onNew,
  onSearch,
  onTrack,
  opened,
  reply,
  silentTrack,
  track,
  trackPath,
  trending,
} from "./fixtures.ts";

const app = { update, view };

const TITLE = "Harder, Better, Faster, Stronger";

const island = role("region", { name: "Player" });
const topSongs = role("list", { name: "Top songs" });
const rowOf = (trackId: string) => selector(`[data-track="${trackId}"]`);
const playRow = (title: string) => role("button", { name: new RegExp(`^Play: ${title}`) });
const pauseRow = (title: string) => role("button", { name: new RegExp(`^Pause: ${title}`) });
const details = (title: string) => role("link", { name: `Details: ${title}` });
const control = (action: string, title: string = TITLE) =>
  role("button", { name: `${action}: ${title}` });
const seekBar = role("slider", { name: `Seek: ${TITLE}` });
/** The marks the main control wears: a turning one for a slow start, a breathing one for a stall. */
const startingMark = all.selector('[data-activity="starting"]');
const waitingMark = all.selector('[data-activity="waiting"]');
/** The row's mark for the track the player holds, by what the player is doing with it. */
const rowMark = (status: string) => selector(`[data-now-playing="${status}"]`);
const rowMarks = all.selector("[data-now-playing]");
const coverName = `track-cover-${track.id}`;
/** The player in its two shapes: the capsule over the foot of a page, and the page it grows into. */
const islandLayout = selector('[data-layout="island"]');
const expandedLayout = selector('[data-layout="expanded"]');

type Node = Readonly<{
  sel?: string;
  data?: Readonly<{
    style?: Readonly<Record<string, string>>;
    attrs?: Readonly<Record<string, unknown>>;
    props?: Readonly<Record<string, unknown>>;
  }>;
  children?: ReadonlyArray<unknown>;
}>;
const isNode = (value: unknown): value is Node => typeof value === "object" && value !== null;
const nodesOf = (value: unknown): ReadonlyArray<Node> =>
  isNode(value) ? [value, ...(value.children ?? []).flatMap(nodesOf)] : [];

/** The elements of the document, or of the part under `withinId`, that carry a transition name. */
const carriers = (html: unknown, name: string, withinId?: string): number => {
  const root =
    withinId === undefined
      ? html
      : nodesOf(html).find(
          (node) => node.data?.attrs?.["id"] === withinId || node.data?.props?.["id"] === withinId,
        );
  return nodesOf(root).filter((node) => node.data?.style?.["view-transition-name"] === name).length;
};

/** How many elements carry a name, in all and inside the island: a name on two is a transition dropped. */
const seeCarriers = (name: string, expected: Readonly<{ inAll: number; inIsland: number }>) =>
  tap<Model, Message>((simulation) => {
    expect({
      inAll: carriers(simulation.html, name),
      inIsland: carriers(simulation.html, name, Player.PLAYER_ID),
    }).toEqual(expected);
  });

/** A Message of the player's, as the app receives it. */
const player = (message: Player.Message): Message => Message.GotPlayerMessage({ message });

/** The engine's word, in answer to an order. */
const said = (
  order: number,
  phase: EnginePhase,
  more: Partial<Omit<EngineReport, "order" | "phase">> = {},
): Message =>
  player(
    Player.Message.UpdatedEngineStatus({
      report: {
        order,
        phase,
        positionSeconds: 0,
        maybeDurationSeconds: Option.none(),
        bufferedSeconds: 0,
        isSeeking: false,
        ...more,
      },
    }),
  );

const tappedFirstRow = Message.ClickedPlayTrack({ trackId: track.id, from: "New" });

/** New on screen; its first track tapped an instant ago. Orders given, none answered. */
const chosen: Model = after(onNew, tappedFirstRow);

/** The same, with the engine saying it sounds: twelve seconds into thirty, twenty held. */
const sounding: Model = after(
  chosen,
  said(1, "Sounding", {
    positionSeconds: 12,
    maybeDurationSeconds: Option.some(30),
    bufferedSeconds: 20,
  }),
);

const paused: Model = after(sounding, player(Player.Message.ClickedPause()));

/** The first track sounding from New, and the second track's plain page opened by its row's Details. */
const onOtherTracksPage: Model = after(
  sounding,
  clickedLink(trackPath(explicitTrack.id)),
  arrived(reply.track(nextId(sounding), bareTrack)),
  changedUrl(trackPath(explicitTrack.id)),
);

/** The engine took the order, and the system's display was told. The threshold's timer is still running. */
const resolveStart = (order: number) =>
  Command.resolveAll(
    [Player.StartPlayback, Player.Message.CompletedStartPlayback({ order, outcome: "Sounding" })],
    [Player.PublishNowPlaying, Player.Message.CompletedPublishNowPlaying()],
  );

/** The threshold passes with nothing heard from the engine. */
const thresholdPasses = (order: number) =>
  Command.resolve(
    Player.WaitBeforeShowingActivity,
    Player.Message.CompletedWaitBeforeShowingActivity({ order }),
  );

describe("a row plays its track", () => {
  test("before anything is played there is no island, and every row with audio is a control", () =>
    scene(
      app,
      given(onNew),
      see(island).toBeAbsent(),
      inside(
        topSongs,
        // The control's name carries all the row shows: the track, who it is by, how long it is.
        see(playRow(TITLE)).toHaveAccessibleName(`Play: ${TITLE} by Daft Punk, 3:44`),
        see(playRow("Technologic")).toHaveAccessibleName(
          "Play: Technologic, explicit, by Daft Punk, 4:05",
        ),
        // The way to the track's page is still there, a real link at the row's end.
        see(details(TITLE)).toHaveAttr("href", trackPath(track.id)),
        expectAll(rowMarks).toHaveCount(0),
      ),
    ));

  test("acknowledged: the tap is answered at once, in the row and in the island, with nothing claimed", () =>
    scene(
      app,
      given(onNew),
      click(playRow(TITLE)),
      Command.expectExact(
        Player.StartPlayback({ order: 1, source: "https://audio.test/tr-1.mp3", positionSeconds: 0 }),
        Player.WaitBeforeShowingActivity({ order: 1 }),
        Player.PublishNowPlaying,
      ),
      // The row shows it was chosen, and only that row.
      see(playRow(TITLE)).toHaveAttr("aria-current", "true"),
      see(playRow("Technologic")).not.toHaveAttr("aria-current"),
      // The island is there with what the row already showed: nothing to wait for.
      inside(
        island,
        see(text(TITLE)).toExist(),
        see(text("Daft Punk")).toExist(),
        see(selector('img[src="https://img.test/al-1/small.jpg"]')).toExist(),
        // Asked for, not sounding: the control already offers to stop it, drawn as a wish, with no activity yet.
        see(control("Pause")).toHaveAttr("data-playback", "Acknowledged"),
        see(control("Pause")).toHaveAttr("aria-busy", "false"),
        see(selector('[data-glyph="pause-wished"]')).toExist(),
        expectAll(startingMark).toHaveCount(0),
        // Nothing is said to be playing, aloud or in the row.
        see(text(/Now playing|Loading/)).toBeAbsent(),
      ),
      expectAll(rowMarks).toHaveCount(0),
      resolveStart(1),
      thresholdPasses(1),
    ));

  test("starting: a start that outlasts the threshold shows activity, on the control and on the row", () =>
    scene(
      app,
      given(onNew),
      click(playRow(TITLE)),
      resolveStart(1),
      inside(island, expectAll(startingMark).toHaveCount(0)),
      thresholdPasses(1),
      inside(
        island,
        see(control("Pause")).toHaveAttr("aria-busy", "true"),
        expectAll(startingMark).toHaveCount(1),
        see(text(`Loading ${TITLE}`)).toHaveAttr("role", "status"),
      ),
      inside(rowOf(track.id), see(rowMark("Starting")).toExist()),
      see(playRow(TITLE)).toHaveAttr("aria-busy", "true"),
    ));

  test("sounding: the control offers pause, and the row's mark moves", () =>
    scene(
      app,
      given(sounding),
      inside(
        island,
        see(control("Pause")).toHaveAttr("data-playback", "Sounding"),
        see(selector('[data-glyph="pause"]')).toExist(),
        expectAll(startingMark).toHaveCount(0),
        expectAll(waitingMark).toHaveCount(0),
        // The island is a capsule: the position and the bar are the expanded player's.
        see(role("slider")).toBeAbsent(),
        see(text("0:12")).toBeAbsent(),
        see(text(`Now playing: ${TITLE} by Daft Punk`)).toHaveAttr("role", "status"),
      ),
      inside(rowOf(track.id), see(rowMark("Sounding")).toHaveAttr("aria-hidden", "true")),
      // The row is now the way to stop it.
      see(pauseRow(TITLE)).toExist(),
    ));

  test("a second of progress is not announced again", () =>
    scene(
      app,
      given(expandedOnFirst),
      Subscription.emit(
        said(1, "Sounding", {
          positionSeconds: 13,
          maybeDurationSeconds: Option.some(30),
          bufferedSeconds: 30,
        }),
      ),
      inside(
        island,
        see(text("0:13")).toExist(),
        // The words said aloud name the track and its state, never the position: they have not changed.
        see(text(`Now playing: ${TITLE} by Daft Punk`)).toHaveAttr("role", "status"),
      ),
    ));

  test("paused: the control offers play, and the row's mark rests", () =>
    scene(
      app,
      given(sounding),
      inside(island, click(control("Pause"))),
      Command.expectExact(Player.PausePlayback({ order: 2 })),
      Command.resolve(Player.PausePlayback, Player.Message.CompletedPausePlayback()),
      inside(
        island,
        see(control("Play")).toExist(),
        see(selector('[data-glyph="play"]')).toExist(),
        see(text(`Paused: ${TITLE}`)).toHaveAttr("role", "status"),
      ),
      inside(rowOf(track.id), see(rowMark("Paused")).toExist(), see(rowMark("Sounding")).toBeAbsent()),
      see(playRow(TITLE)).toHaveAttr("aria-current", "true"),
      // Not the system's doing: nothing is said of the browser.
      see(text(/Press play/)).toBeAbsent(),
    ));

  test("waiting mid-track is shown as waiting: not paused, not sounding", () =>
    scene(
      app,
      given(sounding),
      Subscription.emit(
        said(1, "Waiting", { positionSeconds: 12, maybeDurationSeconds: Option.some(30) }),
      ),
      inside(
        island,
        // Still the control that stops it, with a mark that breathes instead of turning.
        see(control("Pause")).toHaveAttr("data-playback", "Waiting"),
        expectAll(waitingMark).toHaveCount(1),
        expectAll(startingMark).toHaveCount(0),
        see(text(`Waiting for more of ${TITLE}`)).toHaveAttr("role", "status"),
      ),
      inside(rowOf(track.id), see(rowMark("Waiting")).toExist(), see(rowMark("Sounding")).toBeAbsent()),
    ));

  test("stopped by the system is not paused: the island says so, and what to do", () =>
    scene(
      app,
      given(onNew),
      click(playRow(TITLE)),
      Command.resolveAll(
        [Player.StartPlayback, Player.Message.CompletedStartPlayback({ order: 1, outcome: "Refused" })],
        [Player.PublishNowPlaying, Player.Message.CompletedPublishNowPlaying()],
      ),
      thresholdPasses(1),
      inside(
        island,
        // A capsule has room for a few words; the whole sentence is said aloud.
        see(text("Press play to start")).toExist(),
        see(control("Play")).toHaveAttr("data-playback", "Stopped"),
        see(text(`Your browser did not let ${TITLE} start. Press play.`)).toHaveAttr("role", "status"),
        click(control("Play")),
      ),
      Command.expectExact(
        Player.ResumePlayback({ order: 2 }),
        Player.WaitBeforeShowingActivity({ order: 2 }),
      ),
      Command.resolveAll(
        [Player.ResumePlayback, Player.Message.CompletedResumePlayback({ order: 2, outcome: "Sounding" })],
        [Player.WaitBeforeShowingActivity, Player.Message.CompletedWaitBeforeShowingActivity({ order: 2 })],
      ),
      see(text(/Press play/)).toBeAbsent(),
    ));

  test("failed: the island says the track could not be played, with a retry, and the row says it too", () =>
    scene(
      app,
      given(sounding),
      Subscription.emit(said(1, "Failed", { positionSeconds: 12 })),
      // The catalog is asked for the track again before anything is called a failure.
      Command.expectExact(Player.RefreshSource({ order: 1, trackId: track.id })),
      see(text("This song could not be played.")).toBeAbsent(),
      Command.resolve(Player.RefreshSource, Player.Message.FailedRefreshSource({ order: 1 })),
      inside(
        island,
        see(text("Could not be played")).toExist(),
        see(text(`${TITLE} could not be played.`)).toHaveAttr("role", "status"),
        see(control("Try again")).toExist(),
        // Not skipped past: the island still holds the track that failed.
        see(text(TITLE)).toExist(),
      ),
      inside(
        topSongs,
        see(text("This song could not be played.")).toHaveAttr("role", "status"),
        see(playRow(TITLE)).toHaveAttr("aria-current", "true"),
        see(playRow("Technologic")).not.toHaveAttr("aria-current"),
      ),
      inside(island, click(control("Try again"))),
      Command.expectHas(
        Player.StartPlayback({ order: 2, source: "https://audio.test/tr-1.mp3", positionSeconds: 0 }),
      ),
      resolveStart(2),
      thresholdPasses(2),
    ));
});

/** The player's page took the screen: the URL moves, the focus follows, the catalog answers. */
const resolveOpening = (
  from: Model,
  answer: (
    requestId: string,
  ) =>
    | typeof Catalog.Message.SucceededTrackDetail.Type
    | typeof Catalog.Message.FailedTrackDetail.Type = reply.track,
) =>
  Command.resolveAll(
    [Catalog.TrackDetail, answer(nextId(from))],
    [NavigateInternal, Message.CompletedNavigateInternal()],
    [FocusPage, Message.CompletedFocusPage()],
  );

/** New on screen with its first track sounding, and the island pressed: the player expanded on it. */
const expandedOnFirst: Model = after(
  sounding,
  clickedLink(trackPath(track.id)),
  arrived(reply.track(nextId(sounding))),
  changedUrl(trackPath(track.id)),
);

describe("the player expanded: the page of the track it holds", () => {
  test("the island pressed: the player is the screen at once, on the track's own route, waiting for nothing", () =>
    scene(
      app,
      given(sounding),
      Subscription.emit(clickedLink(trackPath(track.id))),
      // The screen moved, so the history gains its entry now; the engine is asked nothing.
      Command.expectExact(NavigateInternal, FocusPage, Catalog.TrackDetail),
      // Before the catalog has said a word: the player, whole, from what the queue holds.
      inside(
        expandedLayout,
        see(role("heading", { name: TITLE, level: 1 })).toExist(),
        see(text("Daft Punk")).toExist(),
        see(control("Pause")).toHaveAttr("data-playback", "Sounding"),
        see(seekBar).toHaveAttr("aria-valuenow", "12"),
        see(control("Next track", "Technologic")).toBeEnabled(),
        // What the catalog adds is on its way, in its own place and its own shape.
        see(selector("[data-detail]")).toHaveAttr("aria-busy", "true"),
        see(text("Discovery")).toBeAbsent(),
      ),
      // It is the same piece as the island: there is no island under it.
      see(islandLayout).toBeAbsent(),
      expectAll(all.role("region", { name: "Player" })).toHaveCount(1),
      inside(expandedLayout, see(text("Opening…")).toBeAbsent()),
      see(text(`Showing ${TITLE}`)).toExist(),
      resolveOpening(sounding),
      inside(
        expandedLayout,
        see(text("Discovery")).toExist(),
        see(text("Romanthony")).toExist(),
        see(selector("[data-detail]")).toHaveAttr("aria-busy", "false"),
      ),
    ));

  test("a row's Details for another track: its plain page once the data arrives, the island below", () =>
    scene(
      app,
      given(sounding),
      Subscription.emit(clickedLink(trackPath(explicitTrack.id))),
      // Held, as any page chosen by a link: New stays, and so does the island.
      see(role("heading", { name: "New", level: 1 })).toBeVisible(),
      Command.resolve(Catalog.TrackDetail, reply.track(nextId(sounding), bareTrack)),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusPage, Message.CompletedFocusPage()],
      ),
      inside(
        selector("#track-page"),
        see(role("heading", { name: /Technologic/, level: 1 })).toExist(),
        see(control("Play", "Technologic")).toExist(),
      ),
      see(expandedLayout).toBeAbsent(),
      inside(islandLayout, see(text(TITLE)).toExist(), see(control("Pause")).toExist()),
    ));

  test("Play on that plain page: the same screen becomes the player, and the route does not move", () =>
    scene(
      app,
      given(onOtherTracksPage),
      inside(selector("#track-page"), click(control("Play", "Technologic"))),
      // The engine is given its order, and the history is asked nothing.
      Command.expectExact(
        Player.StartPlayback({ order: 2, source: "https://audio.test/tr-2.mp3", positionSeconds: 0 }),
        Player.WaitBeforeShowingActivity({ order: 2 }),
        Player.PublishNowPlaying,
      ),
      inside(
        expandedLayout,
        see(role("heading", { name: "Technologic", level: 1 })).toExist(),
        see(control("Pause", "Technologic")).toHaveAttr("data-playback", "Acknowledged"),
        // What the page had already loaded of the track is still there, under the controls.
        see(text("Human After All")).toExist(),
      ),
      see(islandLayout).toBeAbsent(),
      resolveStart(2),
      thresholdPasses(2),
    ));

  test("Next inside it: the sheet stays, its words change, and the entry is rewritten for the new track", () =>
    scene(
      app,
      given(expandedOnFirst),
      inside(expandedLayout, click(control("Next track", "Technologic"))),
      Command.expectExact(
        Player.StartPlayback({ order: 2, source: "https://audio.test/tr-2.mp3", positionSeconds: 0 }),
        Player.WaitBeforeShowingActivity({ order: 2 }),
        Player.PublishNowPlaying,
        ReplaceTrackUrl({ trackId: explicitTrack.id }),
        Catalog.TrackDetail,
      ),
      inside(
        expandedLayout,
        see(role("heading", { name: "Technologic", level: 1 })).toExist(),
        see(control("Previous track", TITLE)).toBeEnabled(),
        see(selector("[data-detail]")).toHaveAttr("aria-busy", "true"),
      ),
      see(islandLayout).toBeAbsent(),
      resolveStart(2),
      thresholdPasses(2),
      Command.resolveAll(
        [ReplaceTrackUrl, Message.CompletedReplaceTrackUrl()],
        [Catalog.TrackDetail, reply.track(nextId(expandedOnFirst), bareTrack)],
      ),
      // The browser says the URL is the new track's: that is the app's own doing, and changes nothing.
      Subscription.emit(changedUrl(trackPath(explicitTrack.id))),
      inside(expandedLayout, see(text("Human After All")).toExist()),
    ));

  test("a direct link to a track's page: the plain page with Play, whatever was playing before the reload", () =>
    scene(
      app,
      given(onTrack),
      inside(selector("#track-page"), see(control("Play")).toExist()),
      see(expandedLayout).toBeAbsent(),
      see(islandLayout).toBeAbsent(),
    ));

  test("its close control goes back through the history, and Back puts the page back with the island below", () =>
    scene(
      app,
      given(expandedOnFirst),
      click(role("button", { name: "Close the player" })),
      Command.expectExact(NavigateBack),
      Command.resolve(NavigateBack, Message.CompletedNavigateBack()),
      // The browser goes back; the app follows.
      Subscription.emit(changedUrl("/new")),
      Command.resolveAll(
        [Catalog.NewMusic, reply.newMusic(nextId(expandedOnFirst))],
        [FocusTrackRow, Message.CompletedFocusTrackRow()],
      ),
      see(role("heading", { name: "New", level: 1 })).toBeVisible(),
      see(expandedLayout).toBeAbsent(),
      inside(
        islandLayout,
        see(text(TITLE)).toExist(),
        see(control("Pause")).toHaveAttr("data-playback", "Sounding"),
      ),
    ));

  test("with no page of the app behind it, its close control is a link Home", () =>
    scene(
      app,
      given(
        after(
          answered(opened(trackPath(track.id)), reply.track),
          Message.ClickedPlayTrack({ trackId: track.id, from: "Track" }),
        ),
      ),
      see(expandedLayout).toExist(),
      see(role("link", { name: "Close the player" })).toHaveAttr("href", "/"),
    ));

  test("a detail that cannot load says so in its own place, with a way to try again, and the controls go on working", () =>
    scene(
      app,
      given(sounding),
      Subscription.emit(clickedLink(trackPath(track.id))),
      resolveOpening(sounding, reply.trackRefused),
      inside(
        expandedLayout,
        see(text("The song's details could not load.")).toExist(),
        see(role("button", { name: "Try again" })).toExist(),
        see(role("heading", { name: TITLE, level: 1 })).toExist(),
        click(control("Pause")),
      ),
      Command.expectExact(Player.PausePlayback({ order: 2 })),
      Command.resolve(Player.PausePlayback, Player.Message.CompletedPausePlayback()),
      inside(expandedLayout, see(control("Play")).toExist()),
    ));

  test("a track the catalog no longer has: the player says there is no more to say, with nothing to try again", () =>
    scene(
      app,
      given(sounding),
      Subscription.emit(clickedLink(trackPath(track.id))),
      resolveOpening(sounding, reply.trackMissing),
      inside(
        expandedLayout,
        see(text("The catalog has nothing more about this song.")).toExist(),
        see(role("button", { name: "Try again" })).toBeAbsent(),
        see(control("Pause")).toExist(),
      ),
    ));

  test("opening, closing and Back are transitions; a track change inside the player is not", () => {
    const transition = (previousModel: Model, message: Message) =>
      viewTransition({ previousModel, model: update(previousModel, message).model, message });

    expect(transition(sounding, clickedLink(trackPath(track.id)))).toBe(true);
    // The browser's own Back: the URL has already moved, and the app only follows.
    expect(transition(expandedOnFirst, changedUrl("/new"))).toBe(true);
    expect(
      transition(onOtherTracksPage, Message.ClickedPlayTrack({ trackId: explicitTrack.id, from: "Track" })),
    ).toBe(true);
    expect(transition(expandedOnFirst, player(Player.Message.ClickedNext()))).toBe(false);
    expect(transition(expandedOnFirst, said(1, "Ended"))).toBe(false);
    expect(transition(expandedOnFirst, said(1, "Sounding", { positionSeconds: 14 }))).toBe(false);
  });
});

describe("the player expanded, told from the two Models", () => {
  const names = (outcome: ReturnType<typeof update>) =>
    (outcome.commands ?? []).map((command) => command.name);

  test("opening adds one entry behind which the page it was opened from waits, and asks the engine nothing", () => {
    const opening = update(sounding, clickedLink(trackPath(track.id)));

    expect(opening.model.route).toEqual(AppRoute.Track({ trackId: track.id }));
    expect(isPlayerExpanded(opening.model)).toBe(true);
    expect(opening.model.trail).toEqual([...sounding.trail, AppRoute.New()]);
    expect(opening.model.player).toBe(sounding.player);
    expect(names(opening).sort()).toEqual(["FocusPage", "NavigateInternal", "TrackDetail"]);
  });

  test("a track that follows by itself while expanded rewrites the entry and adds none", () => {
    const followed = update(expandedOnFirst, said(1, "Ended"));

    expect(followed.model.route).toEqual(AppRoute.Track({ trackId: explicitTrack.id }));
    expect(isPlayerExpanded(followed.model)).toBe(true);
    expect(followed.model.trail).toEqual(expandedOnFirst.trail);
    expect(names(followed)).toContain("ReplaceTrackUrl");
    expect(names(followed)).not.toContain("NavigateInternal");
  });

  test("on the island, or on another track's page, a track change moves no route", () => {
    const onIsland = update(sounding, said(1, "Ended"));
    expect(onIsland.model.route).toEqual(sounding.route);
    expect(names(onIsland)).not.toContain("ReplaceTrackUrl");

    const elsewhere = update(onOtherTracksPage, player(Player.Message.ClickedNext()));
    // The queue went on to the very track whose page is on screen: that page is now the player.
    expect(elsewhere.model.route).toEqual(onOtherTracksPage.route);
    expect(isPlayerExpanded(elsewhere.model)).toBe(true);
    expect(names(elsewhere)).not.toContain("ReplaceTrackUrl");
  });

  test("Back out of an expanded player leaves the player as it was", () => {
    const closed = update(expandedOnFirst, changedUrl("/new"));
    expect(closed.model.route).toEqual(AppRoute.New());
    expect(closed.model.player).toBe(expandedOnFirst.player);
    expect(names(closed).filter((name) => /Playback|RefreshSource/.test(name))).toEqual([]);
  });
});

describe("a track with nothing to play", () => {
  const withSilent = answered(
    opened("/new"),
    (requestId) => reply.newMusic(requestId, { ...trending, tracks: [track, silentTrack] }),
  );

  test("its row says so plainly and is not a control; its page is still a link away", () =>
    scene(
      app,
      given(withSilent),
      inside(
        topSongs,
        see(role("button", { name: /Veridis Quo/ })).toBeAbsent(),
        see(text("This song has no audio to play.")).toBeVisible(),
        see(details("Veridis Quo")).toHaveAttr("href", trackPath(silentTrack.id)),
        // The row beside it plays as ever.
        see(playRow(TITLE)).toExist(),
      ),
    ));

  test("its page has no control to play it, and says why", () =>
    scene(
      app,
      given(
        answered(opened(trackPath(silentTrack.id)), (requestId) =>
          reply.track(requestId, { ...fullTrack, ...silentTrack }),
        ),
      ),
      see(role("button", { name: /^Play/ })).toBeAbsent(),
      see(text("This song has no audio to play.")).toExist(),
    ));
});

describe("the island", () => {
  test("is a labelled region whose controls name what they do and to which track", () =>
    scene(
      app,
      given(sounding),
      see(island).toHaveAccessibleName("Player"),
      inside(
        island,
        see(control("Pause")).toExist(),
        see(control("Next track", "Technologic")).toBeEnabled(),
        see(role("link", { name: `Open the player: ${TITLE} by Daft Punk` })).toHaveAttr(
          "href",
          trackPath(track.id),
        ),
        // Going back, and the progress bar, are the expanded player's.
        see(role("button", { name: /^(Back to the start|Previous track)/ })).toBeAbsent(),
        see(role("slider")).toBeAbsent(),
      ),
    ));

  test("expanded, it has the step back and the progress bar the capsule has no room for", () =>
    scene(
      app,
      given(expandedOnFirst),
      inside(
        expandedLayout,
        // Each step names where it leads: the first track has only its own start behind it.
        see(control("Back to the start")).toBeEnabled(),
        see(text("0:12")).toExist(),
        // The length is the engine's, not the one the catalog lists for the recording.
        see(seekBar).toHaveAttr("aria-valuenow", "12"),
        see(seekBar).toHaveAttr("aria-valuemax", "30"),
        see(seekBar).toHaveAttr("aria-valuetext", "0:12 of 0:30"),
        // What the engine already holds is drawn behind what has played.
        see(selector("[data-buffered]")).toHaveStyle("width", `${(20 / 30) * 100}%`),
      ),
    ));

  test("its title is a marquee, so one too long for the capsule can travel across it", () =>
    scene(
      app,
      given(sounding),
      inside(island, see(selector("bafle-marquee")).toHaveText(TITLE)),
      // The artist, and what happened to the sound, are short: they are plain words.
      inside(island, expectAll(all.selector("bafle-marquee")).toHaveCount(1)),
    ));

  test("Next is not offered after the last track of the queue", () =>
    scene(
      app,
      given(after(onNew, Message.ClickedPlayTrack({ trackId: explicitTrack.id, from: "New" }))),
      inside(island, see(role("button", { name: "Next track" })).toBeDisabled()),
    ));

  test("stays where it is, untouched, while the listener goes to another page", () =>
    scene(
      app,
      given(sounding),
      Subscription.emit(clickedLink("/")),
      // Going elsewhere asks nothing of the engine: the page takes the screen and refreshes, and that is all.
      Command.expectExact(Catalog.HomeFeed, NavigateInternal),
      Command.resolveAll(
        [Catalog.HomeFeed, reply.home(nextId(sounding))],
        [NavigateInternal, Message.CompletedNavigateInternal()],
      ),
      see(role("heading", { name: "Home", level: 1 })).toBeVisible(),
      inside(
        island,
        see(text(TITLE)).toExist(),
        see(control("Pause")).toHaveAttr("data-playback", "Sounding"),
      ),
      // It is not inside any page, kept or on screen.
      expectAll(all.selector('[role="region"][inert] #player')).toHaveCount(0),
      expectAll(all.selector("main #player")).toHaveCount(0),
    ));

  test("tells the pages it is there, so that they leave room for it, and not before", () =>
    scene(
      app,
      given(onNew),
      see(selector("[data-player]")).toBeAbsent(),
      click(playRow(TITLE)),
      see(selector("[data-player]")).toExist(),
      resolveStart(1),
      thresholdPasses(1),
    ));

  test("expanded, an arrow key on the progress bar asks the engine for the next second", () =>
    scene(
      app,
      given(expandedOnFirst),
      keydown(seekBar, "ArrowRight"),
      Command.expectExact(Player.SeekPlayback({ order: 2, positionSeconds: 13 })),
      Command.resolve(Player.SeekPlayback, Player.Message.CompletedSeekPlayback()),
      // The bar stands at the wish, drawn as a wish, until the engine says it is there.
      see(seekBar).toHaveAttr("aria-valuenow", "13"),
      see(selector("[data-seek]")).toHaveAttr("data-seek", "Seeking"),
      see(selector('[data-elapsed="wish"]')).toHaveText("0:13"),
      Subscription.emit(
        said(2, "Sounding", { positionSeconds: 13, maybeDurationSeconds: Option.some(30) }),
      ),
      see(selector("[data-seek]")).toHaveAttr("data-seek", "Settled"),
      see(selector('[data-elapsed="fact"]')).toHaveText("0:13"),
    ));

  test("expanded, before the engine has read the length there is no slider to move, only its place", () =>
    scene(
      app,
      given(
        after(
          chosen,
          clickedLink(trackPath(track.id)),
          arrived(reply.track(nextId(chosen))),
          changedUrl(trackPath(track.id)),
        ),
      ),
      inside(expandedLayout, see(role("slider")).toBeAbsent(), see(text("0:00")).toExist()),
    ));
});

describe("the track's page", () => {
  test("played from its page, a track is a queue of one", () => {
    const played = after(onTrack, Message.ClickedPlayTrack({ trackId: track.id, from: "Track" }));
    const session = Option.getOrThrow(played.player.maybeSession);
    expect(session.earlier).toEqual([]);
    expect(session.later).toEqual([]);
    expect(session.current.id).toBe(track.id);
  });

  test("played from Search, the queue is the songs found", () => {
    const played = after(onSearch, Message.ClickedPlayTrack({ trackId: track.id, from: "Search" }));
    expect(Option.getOrThrow(played.player.maybeSession).current.id).toBe(track.id);
  });
});

describe("the flight: a track's cover is one element on its way to the island", () => {
  test("before the tap the row carries the cover's name; after it, the island does, and only the island", () =>
    scene(
      app,
      given(onNew),
      seeCarriers(coverName, { inAll: 1, inIsland: 0 }),
      inside(rowOf(track.id), see(selector("[data-cover]")).toHaveStyle("view-transition-name", coverName)),
      click(playRow(TITLE)),
      // One element at a time: two with the same name and the browser drops the transition.
      seeCarriers(coverName, { inAll: 1, inIsland: 1 }),
      // The row keeps its own picture in the list.
      inside(rowOf(track.id), see(selector("img")).toExist()),
      inside(rowOf(track.id), see(selector("[data-cover]")).not.toHaveStyle("view-transition-name")),
      // Every other row keeps its name, for its own flight or its own page.
      inside(
        rowOf(explicitTrack.id),
        see(selector("[data-cover]")).toHaveStyle("view-transition-name", `track-cover-${explicitTrack.id}`),
      ),
      resolveStart(1),
      thresholdPasses(1),
    ));

  test("another track tapped while one is in the island: the names change hands, each still on one element", () =>
    scene(
      app,
      given(sounding),
      click(playRow("Technologic")),
      seeCarriers(`track-cover-${explicitTrack.id}`, { inAll: 1, inIsland: 1 }),
      // The track the island gave up has its name back on its row.
      seeCarriers(coverName, { inAll: 1, inIsland: 0 }),
      inside(rowOf(track.id), see(selector("[data-cover]")).toHaveStyle("view-transition-name", coverName)),
      resolveStart(2),
      thresholdPasses(2),
    ));

  test("from the track's page: the page's cover gives the name up to the island", () =>
    scene(
      app,
      given(onTrack),
      seeCarriers(coverName, { inAll: 1, inIsland: 0 }),
      click(control("Play")),
      seeCarriers(coverName, { inAll: 1, inIsland: 1 }),
      resolveStart(1),
      thresholdPasses(1),
    ));

  test("opening the player hands the cover's name from the island's cover to the expanded one", () =>
    scene(
      app,
      given(sounding),
      inside(islandLayout, see(selector("[data-cover]")).toHaveStyle("view-transition-name", coverName)),
      Subscription.emit(clickedLink(trackPath(track.id))),
      seeCarriers(coverName, { inAll: 1, inIsland: 1 }),
      inside(expandedLayout, see(selector("[data-cover]")).toHaveStyle("view-transition-name", coverName)),
      resolveOpening(sounding),
    ));

  test("a transition is asked for when the listener puts a track in the island, and only then", () => {
    const transition = (previousModel: Model, message: Message) =>
      viewTransition({ previousModel, model: update(previousModel, message).model, message });

    // The first track played, another row tapped, Next: the listener's own choices.
    expect(transition(onNew, tappedFirstRow)).toBe(true);
    expect(
      transition(sounding, Message.ClickedPlayTrack({ trackId: explicitTrack.id, from: "New" })),
    ).toBe(true);
    expect(transition(sounding, player(Player.Message.ClickedNext()))).toBe(true);
    // The engine's reports repaint plainly: sound, progress, a stall.
    expect(transition(chosen, said(1, "Sounding"))).toBe(false);
    expect(transition(sounding, said(1, "Sounding", { positionSeconds: 13 }))).toBe(false);
    expect(transition(sounding, said(1, "Waiting"))).toBe(false);
    // So do pause and play, and a tap on the track already there.
    expect(transition(sounding, player(Player.Message.ClickedPause()))).toBe(false);
    expect(transition(paused, tappedFirstRow)).toBe(false);
    // A track that follows the one before by itself is not the listener's tap.
    expect(transition(sounding, said(1, "Ended"))).toBe(false);
  });

  test("the transition is told from the two Models, so the Message that shares its frame cannot hide it", () => {
    // A tap and the engine's first word for it can land in one frame: the runtime tells the last.
    const model = after(onNew, tappedFirstRow, said(1, "Sounding"));
    expect(viewTransition({ previousModel: onNew, model, message: said(1, "Sounding") })).toBe(true);
  });
});

describe("a second of progress redraws no page", () => {
  /** The element a page place draws: the same object when the place was not drawn again. */
  const places = (html: unknown): ReadonlyArray<unknown> =>
    nodesOf(html).find((node) => node.sel?.startsWith("main") === true)?.children ?? [];

  test("the pages are the very elements they were", () => {
    const drawn: Array<ReadonlyArray<unknown>> = [];

    scene(
      app,
      given(sounding),
      tap((simulation) => drawn.push(places(simulation.html))),
      Subscription.emit(
        said(1, "Sounding", {
          positionSeconds: 13,
          maybeDurationSeconds: Option.some(30),
          bufferedSeconds: 30,
        }),
      ),
      tap((simulation) => drawn.push(places(simulation.html))),
      // A change of state is something a row shows: its page is drawn again.
      Subscription.emit(said(1, "Waiting", { positionSeconds: 13 })),
      tap((simulation) => drawn.push(places(simulation.html))),
    );

    const [before, afterProgress, afterStall] = drawn;
    expect(before).toHaveLength(4);
    // Home, New, Search and the passing place: each the same object, so nothing under it was diffed.
    before?.forEach((place, index) => expect(afterProgress?.[index]).toBe(place));
    // New lists the track that stalled: it is drawn again. Home has nothing to show of it.
    expect(afterStall?.[1]).not.toBe(before?.[1]);
    expect(afterStall?.[0]).toBe(before?.[0]);
  });

  test("an unchanged Model reuses every page", () => {
    Lazy.expectAllReused({ view, model: sounding });
    Lazy.expectAllReused({ view, model: after(onHome, tappedFirstRow) });
  });
});
