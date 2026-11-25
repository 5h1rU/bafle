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
  Mount,
  role,
  selector,
  Subscription,
  tap,
  text,
} from "foldkit/scene";
import { DragAndDrop, Animation, Menu } from "@foldkit/ui";
import { Lazy } from "foldkit/test";
import { describe, expect, test } from "vitest";
import { Catalog } from "../src/catalog.ts";
import {
  FocusNavigation,
  FocusPage,
  FocusTrackRow,
  NavigateBack,
  NavigateInternal,
  ReplaceTrackUrl,
  WaitToClearRowDone,
} from "../src/command.ts";
import {
  PLAYER_CLOSES,
  PLAYER_FACE_CLOSES,
  PLAYER_OPENS,
  PLAYER_QUEUE_CLOSES,
  PLAYER_QUEUE_OPENS,
  update,
  viewTransition,
} from "../src/main.ts";
import { Message } from "../src/message.ts";
import {
  initialPlayerSheet,
  isPlayerExpanded,
  maybeHeadedFor,
  type Model,
  wayBack,
} from "../src/model.ts";
import { AppRoute } from "../src/route.ts";
import type { EnginePhase, EngineReport } from "../src/player/audioEngine.ts";
import * as Player from "../src/player/index.ts";
import * as Sheet from "../src/sheet/index.ts";
import { view } from "../src/view.ts";
import {
  after,
  answered,
  arrived,
  awaitedId,
  bareTrack,
  changedUrl,
  choseFromPlayer,
  choseFromRow,
  clickedLink,
  explicitTrack,
  fullTrack,
  nextId,
  onHome,
  onNew,
  onSearch,
  onTrack,
  opened,
  pressedMore,
  reply,
  scene,
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
const more = (title: string) => role("button", { name: `More: ${title}` });
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
/** The island's title, the line of it that travels, and the layer its light is drawn in. */
const title = selector("[data-title]");
const titleLine = selector("[data-title-line]");
const lights = selector("[data-island-lights]");
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

/** The island left the document, and what was bound to its pieces ended with them. */
// NOTE: a function, not a step kept and used again. The step takes the
// Mounts it is given out of its own list as it finds them, so a step used
// in a second scene would have none left to look for.
const islandLeaves = () =>
  Mount.expectEnded(Player.DrawIslandFigure, Player.FollowIslandPress, Player.StartIslandLight, Player.MeasureTitle);

/** The island's light was told its new pace, and has taken it. */
const lightChangesPace = () =>
  Command.resolve(
    Player.ChangeIslandLightPace,
    Player.Message.CompletedChangeIslandLightPace(),
  );

/**
 * The expanded player's sheet entered the document: it was put where it is
 * whole, and the document said that all of it is on screen.
 */
const sheetEnters = () =>
  Mount.resolveAll([Sheet.FollowSheet, Sheet.Message.ChangedReach({ reach: "Whole" })]);

/** The threshold passes with nothing heard from the engine. */
/** The expanded player turned to its other face, and what is in its sheet was put back at its top. */
const faceShownFromTop = () =>
  Command.resolve(Player.ShowFaceFromTop, Player.Message.CompletedShowFaceFromTop());

/**
 * The listener chose Song details from the menu under the player's
 * controls: the player turns to the face that says what the catalog knows of
 * the track.
 */
const turnsToDetails = () =>
  [Subscription.emit(choseFromPlayer("SongDetails")), faceShownFromTop()] as const;

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
        // What else can be done with the track is at the row's end, behind its menu.
        see(more(TITLE)).toHaveAttr("aria-haspopup", "menu"),
        expectAll(rowMarks).toHaveCount(0),
      ),
    ));

  test("acknowledged: the tap is answered at once, in the row and in the island, with nothing claimed", () =>
    scene(
      app,
      given(onNew),
      click(playRow(TITLE)),
      islandEnters,
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
      islandEnters,
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
      islandEnters,
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
      sheetEnters(),
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
      islandEnters,
      inside(island, click(control("Pause"))),
      Command.expectExact(
        Player.PausePlayback({ order: 2 }),
        Player.ChangeIslandLightPace({ pace: 0 }),
      ),
      Command.resolve(Player.PausePlayback, Player.Message.CompletedPausePlayback()),
      lightChangesPace(),
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
      islandEnters,
      Subscription.emit(
        said(1, "Waiting", { positionSeconds: 12, maybeDurationSeconds: Option.some(30) }),
      ),
      lightChangesPace(),
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
      islandEnters,
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
      islandEnters,
      Subscription.emit(said(1, "Failed", { positionSeconds: 12 })),
      // The catalog is asked for the track again before anything is called a failure.
      Command.expectExact(
        Player.RefreshSource({ order: 1, trackId: track.id }),
        Player.ChangeIslandLightPace({ pace: 0 }),
      ),
      lightChangesPace(),
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
  test("the queue is the player's other face: it opens from the song's and stays open as its last song starts", () =>
    scene(
      app,
      given(expandedOnFirst),
      sheetEnters(),
      // The song's face: the way out, the way to the queue with what plays next, and the song's details.
      inside(expandedLayout,
        see(role("button", { name: "Close the player" })).toExist(),
        see(role("button", { name: "Playing Next" })).toHaveAttr("aria-expanded", "false"),
        see(text("Technologic · Daft Punk")).toExist(),
        // What the catalog knows of the song is a face away, behind the menu under the controls.
        see(role("button", { name: `More: ${TITLE}` })).toExist(),
        see(selector("[data-detail]")).toBeAbsent(),
        click(role("button", { name: "Playing Next" })),
      ),
      faceShownFromTop(),
      // The queue's face: the same track at its head, the songs to come by their place, and the way back.
      inside(expandedLayout,
        see(role("button", { name: "Playing Next" })).toHaveAttr("aria-expanded", "true"),
        // No control of its own closes the queue: the lit one that opened it leads back, and so does the face's name.
        see(role("button", { name: "Close queue" })).toBeAbsent(),
        see(role("button", { name: "Back to the song" })).toExist(),
        // The sheet's handle is on this face too: it closes the player, not the queue.
        see(role("button", { name: "Close the player" })).toExist(),
        see(role("heading", { name: TITLE, level: 1 })).toExist(),
        see(role("heading", { name: "Up next", level: 2 })).toExist(),
        see(selector("[data-detail]")).toBeAbsent(),
        see(text("02")).toExist(),
        click(role("button", { name: "Play: Technologic by Daft Punk" })),
      ),
      inside(expandedLayout,
        see(role("heading", { name: "Technologic", level: 1 })).toExist(),
        see(text("No upcoming songs.")).toExist(),
      ),
      resolveStart(2),
      thresholdPasses(2),
      Command.resolveAll(
        [ReplaceTrackUrl, Message.CompletedReplaceTrackUrl()],
        [Catalog.TrackDetail, reply.track(nextId(expandedOnFirst), bareTrack)],
      ),
      inside(expandedLayout, click(role("button", { name: "Playing Next" }))),
      faceShownFromTop(),
      inside(
        expandedLayout,
        see(role("button", { name: "Playing Next" })).toHaveAttr("aria-expanded", "false"),
        see(role("heading", { name: "Up next", level: 2 })).toBeAbsent(),
      ),
    ));

  test("the island pressed: the player is the screen at once, on the track's own route, waiting for nothing", () =>
    scene(
      app,
      given(sounding),
      islandEnters,
      Subscription.emit(clickedLink(trackPath(track.id))),
      islandLeaves(),
      sheetEnters(),
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
        // Nothing but the track is over the cover, and what the catalog adds is a face away.
        see(text("From the album")).toBeAbsent(),
        see(selector("[data-detail]")).toBeAbsent(),
        see(text("Romanthony")).toBeAbsent(),
      ),
      // It is the same piece as the island: there is no island under it.
      see(islandLayout).toBeAbsent(),
      expectAll(all.role("region", { name: "Player" })).toHaveCount(1),
      inside(expandedLayout, see(text("Opening…")).toBeAbsent()),
      see(text(`Showing ${TITLE}`)).toExist(),
      resolveOpening(sounding),
      ...turnsToDetails(),
      inside(
        expandedLayout,
        see(role("button", { name: "Back to the song" })).toExist(),
        see(text("Romanthony")).toExist(),
        see(selector("[data-detail]")).toHaveAttr("aria-busy", "false"),
        // The controls are on this face too.
        see(control("Pause")).toExist(),
      ),
    ));

  test("a row's Details for another track: its plain page once the data arrives, the island below", () =>
    scene(
      app,
      given(sounding),
      islandEnters,
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
      islandEnters,
      inside(selector("#track-page"), click(control("Play", "Technologic"))),
      islandLeaves(),
      sheetEnters(),
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
        // What the page had already loaded of the track is a face away now.
        see(text("Human After All")).toBeAbsent(),
      ),
      see(islandLayout).toBeAbsent(),
      resolveStart(2),
      thresholdPasses(2),
    ));

  test("Next inside it: the sheet stays, its words change, and the entry is rewritten for the new track", () =>
    scene(
      app,
      given(expandedOnFirst),
      sheetEnters(),
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
      ...turnsToDetails(),
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
      sheetEnters(),
      click(role("button", { name: "Close the player" })),
      Command.expectExact(NavigateBack),
      Command.resolve(NavigateBack, Message.CompletedNavigateBack()),
      // The browser goes back; the app follows.
      Subscription.emit(changedUrl("/new")),
      Command.resolveAll(
        [Catalog.NewMusic, reply.newMusic(nextId(expandedOnFirst))],
        [FocusTrackRow, Message.CompletedFocusTrackRow()],
      ),
      // The sheet goes with the player, and what followed it ends with it.
      Mount.expectEnded(Sheet.FollowSheet),
      islandEnters,
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
      sheetEnters(),
      see(expandedLayout).toExist(),
      see(role("link", { name: "Close the player" })).toHaveAttr("href", "/"),
    ));

  test("a detail that cannot load says so in its own place, with a way to try again, and the controls go on working", () =>
    scene(
      app,
      given(sounding),
      islandEnters,
      Subscription.emit(clickedLink(trackPath(track.id))),
      islandLeaves(),
      sheetEnters(),
      resolveOpening(sounding, reply.trackRefused),
      ...turnsToDetails(),
      inside(
        expandedLayout,
        see(text("The song's details could not load.")).toExist(),
        see(role("button", { name: "Try again" })).toExist(),
        see(role("heading", { name: TITLE, level: 1 })).toExist(),
        click(control("Pause")),
      ),
      Command.expectExact(
        Player.PausePlayback({ order: 2 }),
        Player.ChangeIslandLightPace({ pace: 0 }),
      ),
      Command.resolve(Player.PausePlayback, Player.Message.CompletedPausePlayback()),
      lightChangesPace(),
      inside(expandedLayout, see(control("Play")).toExist()),
    ));

  test("a track the catalog no longer has: the player says there is no more to say, with nothing to try again", () =>
    scene(
      app,
      given(sounding),
      islandEnters,
      Subscription.emit(clickedLink(trackPath(track.id))),
      islandLeaves(),
      sheetEnters(),
      resolveOpening(sounding, reply.trackMissing),
      ...turnsToDetails(),
      inside(
        expandedLayout,
        see(text("The catalog has nothing more about this song.")).toExist(),
        see(role("button", { name: "Try again" })).toBeAbsent(),
        see(control("Pause")).toExist(),
      ),
    ));

  test("Go to album, from the menu under the controls, is followed as a link: the player is held until the album can take the screen", () => {
    const asked = after(expandedOnFirst, choseFromPlayer("OpenAlbum"));
    // The player is still the screen, and its route still the track's.
    expect(asked.route).toEqual(expandedOnFirst.route);
    expect(maybeHeadedFor(asked)).toEqual(
      Option.some(AppRoute.Album({ albumId: track.album.id })),
    );
    // The album arrives: its page takes the screen, and the player is its island again.
    const arrivedAt = after(asked, arrived(reply.album(awaitedId(asked))));
    expect(arrivedAt.route).toEqual(AppRoute.Album({ albumId: track.album.id }));
  });

  test("the face that says what the catalog knows of the song: its name leads back, and the queue's control to the queue", () =>
    scene(
      app,
      given(expandedOnFirst),
      sheetEnters(),
      ...turnsToDetails(),
      inside(
        expandedLayout,
        see(selector("[data-detail]")).toExist(),
        // It is not offered from itself.
        see(role("heading", { name: "Up next", level: 2 })).toBeAbsent(),
        click(role("button", { name: "Playing Next" })),
      ),
      faceShownFromTop(),
      inside(
        expandedLayout,
        see(role("heading", { name: "Up next", level: 2 })).toExist(),
        see(selector("[data-detail]")).toBeAbsent(),
      ),
      ...turnsToDetails(),
      inside(expandedLayout, click(role("button", { name: "Back to the song" }))),
      faceShownFromTop(),
      inside(
        expandedLayout,
        see(selector("[data-detail]")).toBeAbsent(),
        see(role("button", { name: "Playing Next" })).toHaveAttr("aria-expanded", "false"),
      ),
    ));

  test("opening, closing and Back are transitions; a track change inside the player is not", () => {
    const transition = (previousModel: Model, message: Message) =>
      viewTransition({ previousModel, model: update(previousModel, message).model, message });

    // Each is told by name, so the island's picture is known from the sheet's and stays where the island stands.
    expect(transition(sounding, clickedLink(trackPath(track.id)))).toEqual({
      types: [PLAYER_OPENS, `track-cover-${track.id}`],
    });
    // The browser's own Back: the URL has already moved, and the app only follows.
    expect(transition(expandedOnFirst, changedUrl("/new"))).toEqual({ types: [PLAYER_CLOSES, `track-cover-${track.id}`] });
    expect(
      transition(onOtherTracksPage, Message.ClickedPlayTrack({ trackId: explicitTrack.id, from: "Track" })),
    ).toEqual({ types: [PLAYER_OPENS, `track-cover-${explicitTrack.id}`] });
    expect(transition(expandedOnFirst, player(Player.Message.ClickedNext()))).toBe(false);
    // Turning to the queue and back is one, each way by its own name: the cover travels to the thumbnail and back.
    const onQueue = after(expandedOnFirst, player(Player.Message.ClickedQueue()));
    expect(transition(expandedOnFirst, player(Player.Message.ClickedQueue()))).toEqual({
      types: [PLAYER_QUEUE_OPENS, `track-cover-${track.id}`],
    });
    expect(transition(onQueue, player(Player.Message.ClickedQueue()))).toEqual({
      types: [PLAYER_QUEUE_CLOSES, `track-cover-${track.id}`],
    });
    // Taking up a song of the queue is the same face, and a song chosen from it is another track.
    expect(
      transition(
        onQueue,
        player(
          Player.Message.GotQueueDragMessage({
            message: DragAndDrop.Message.PressedDraggable({
              itemId: `${explicitTrack.id}/0`,
              containerId: Player.QUEUE_CONTAINER_ID,
              index: 0,
              screenX: 0,
              screenY: 0,
            }),
          }),
        ),
      ),
    ).toBe(false);
    expect(transition(expandedOnFirst, said(1, "Ended"))).toBe(false);
    expect(transition(expandedOnFirst, said(1, "Sounding", { positionSeconds: 14 }))).toBe(false);
  });

  test("closed from its queue or its song's details, it says so: the cover is a thumbnail there, and travels as one", () => {
    const transition = (previousModel: Model, message: Message) =>
      viewTransition({ previousModel, model: update(previousModel, message).model, message });
    const onQueue = after(expandedOnFirst, player(Player.Message.ClickedQueue()));
    const onDetails = after(expandedOnFirst, choseFromPlayer("SongDetails"));

    expect(transition(onQueue, changedUrl("/new"))).toEqual({
      types: [PLAYER_CLOSES, `track-cover-${track.id}`, PLAYER_FACE_CLOSES],
    });
    expect(transition(onDetails, changedUrl("/new"))).toEqual({
      types: [PLAYER_CLOSES, `track-cover-${track.id}`, PLAYER_FACE_CLOSES],
    });
  });

  test("closed, the face it had turned to is put away with it: opened again, it shows the song", () => {
    const face = (model: Model) => Option.getOrThrow(model.player.maybeSession).pane;
    const onQueue = after(expandedOnFirst, player(Player.Message.ClickedQueue()));
    const onDetails = after(expandedOnFirst, choseFromPlayer("SongDetails"));

    expect(face(onQueue)).toBe("Queue");
    expect(face(after(onQueue, changedUrl("/new")))).toBe("Artwork");
    expect(face(after(onDetails, changedUrl("/new")))).toBe("Artwork");
    // Nothing sounds differently for it.
    expect(update(onQueue, changedUrl("/new")).model.player.lastOrder).toBe(onQueue.player.lastOrder);
  });
});

describe("the expanded player is on a sheet, and the sheet can be swiped away", () => {
  const names = (outcome: ReturnType<typeof update>) =>
    (outcome.commands ?? []).map((command) => command.name);
  const sheet = (message: Sheet.Message): Message => Message.GotPlayerSheetMessage({ message });
  /** The document's word on how much of the sheet is on screen. */
  const reaches = (reach: Sheet.Reach): Message => sheet(Sheet.Message.ChangedReach({ reach }));

  /** The listener's finger is taking the sheet down: some of it is off the screen. */
  const swiping: Model = after(expandedOnFirst, reaches("Partly"));

  /** The player's own page reached by its address, and played: no page of the app is behind it. */
  const expandedAlone: Model = after(
    answered(opened(trackPath(track.id)), reply.track),
    Message.ClickedPlayTrack({ trackId: track.id, from: "Track" }),
  );

  test("it is whole as the player opens, whatever was said of the sheet before", () => {
    expect(expandedOnFirst.playerSheet).toBe(initialPlayerSheet);
    // Swiped away, closed, and opened again: the new sheet is not the one that left.
    const closed = after(swiping, reaches("Gone"), changedUrl("/new"));
    expect(closed.playerSheet.reach).toBe("Gone");
    const again = after(
      closed,
      clickedLink(trackPath(track.id)),
      changedUrl(trackPath(track.id)),
    );
    expect(isPlayerExpanded(again)).toBe(true);
    expect(again.playerSheet).toBe(initialPlayerSheet);
  });

  test("a swipe that comes back changes nothing but what is drawn behind the sheet meanwhile", () => {
    expect(names(update(expandedOnFirst, reaches("Partly")))).toEqual([]);
    const back = update(swiping, reaches("Whole"));
    expect(names(back)).toEqual([]);
    expect(back.model.playerSheet.reach).toBe("Whole");
    expect(back.model.route).toEqual(expandedOnFirst.route);
  });

  test("let go of on its way down, the player closes from where its sheet is, and is seen to draw back into its island", () => {
    const letGo = update(swiping, sheet(Sheet.Message.LetGo()));
    // It closes as its handle closes it, back through the history, with part of the sheet still on screen.
    expect(names(letGo)).toEqual(["NavigateBack"]);
    expect(letGo.model.playerSheet.reach).toBe("Partly");
    // So the page change that follows is a transition: the sheet shrinks into the island from there.
    const closed = after(letGo.model, changedUrl("/new"));
    expect(
      viewTransition({ previousModel: letGo.model, model: closed, message: changedUrl("/new") }),
    ).toEqual({ types: [PLAYER_CLOSES, `track-cover-${track.id}`] });
    // A sheet that is whole was not on its way: letting go of it is nothing.
    expect(names(update(expandedOnFirst, sheet(Sheet.Message.LetGo())))).toEqual([]);
  });

  test("swiped off the screen, the player closes the way its control closes it: back through the history", () => {
    const left = update(swiping, reaches("Gone"));
    expect(names(left)).toEqual(["NavigateBack"]);
    // Nothing moves until the browser has: the route is still the player's.
    expect(left.model.route).toEqual(expandedOnFirst.route);
    const closed = after(left.model, changedUrl("/new"));
    expect(closed.route).toEqual(AppRoute.New());
    expect(isPlayerExpanded(closed)).toBe(false);
    expect(closed.player).toBe(expandedOnFirst.player);
  });

  test("a sheet that left is not brought back to shrink into the island: there is no transition", () => {
    const left = after(swiping, reaches("Gone"));
    const closed = after(left, changedUrl("/new"));
    expect(
      viewTransition({ previousModel: left, model: closed, message: changedUrl("/new") }),
    ).toBe(false);
    // Nor when the sheet's last word and the page change reach one frame together.
    expect(
      viewTransition({ previousModel: swiping, model: closed, message: changedUrl("/new") }),
    ).toBe(false);
    // Its close control, and Back with the sheet whole, still shrink it into the island.
    expect(
      viewTransition({
        previousModel: expandedOnFirst,
        model: after(expandedOnFirst, changedUrl("/new")),
        message: changedUrl("/new"),
      }),
    ).toEqual({ types: [PLAYER_CLOSES, `track-cover-${track.id}`] });
  });

  test("Escape dismisses the whole sheet immediately, including across the history callback", () => {
    const asked = update(expandedOnFirst, sheet(Sheet.Message.PressedEscape()));
    expect(names(asked)).toEqual(["NavigateBack"]);
    expect(asked.model.playerSheet.reach).toBe("Whole");
    const closed = after(asked.model, changedUrl("/new"));
    expect(
      viewTransition({ previousModel: asked.model, model: closed, message: changedUrl("/new") }),
    ).toBe(false);
  });

  test("with no page behind, a sheet swiped away leaves Home on screen at once: an empty screen is nothing to hold", () => {
    expect(wayBack(expandedAlone)).toEqual(Option.none());
    const left = update(after(expandedAlone, reaches("Partly")), reaches("Gone"));
    // Home has never been loaded: it takes the screen in its placeholders, and is asked for.
    expect(left.model.route).toEqual(AppRoute.Home());
    expect(names(left).sort()).toEqual(["FocusPage", "HomeFeed", "NavigateInternal"]);
    expect(left.model.trail).toEqual([AppRoute.Track({ trackId: track.id })]);
  });

  test("Escape from a direct entry shows Home immediately while it loads", () => {
    const asked = update(expandedAlone, sheet(Sheet.Message.PressedEscape()));
    expect(asked.model.route).toEqual(AppRoute.Home());
    expect(names(asked).sort()).toEqual(["FocusPage", "HomeFeed", "NavigateInternal"]);
    expect(viewTransition({
      previousModel: expandedAlone, model: asked.model, message: sheet(Sheet.Message.PressedEscape()),
    })).toBe(false);
  });

  test("a sheet's word that comes after the player closed closes nothing else", () => {
    const closed = after(expandedOnFirst, changedUrl("/new"));
    const late = update(closed, reaches("Gone"));
    expect(late.model).toBe(closed);
    expect(names(late)).toEqual([]);
  });

  test("with the sheet whole, what is behind it is as behind any page: hidden, and no navigation under it", () =>
    scene(
      app,
      given(expandedOnFirst),
      sheetEnters(),
      see(selector("header")).toHaveClass("max-md:hidden"),
      see(islandLayout).toBeAbsent(),
      see(selector("#new-page")).toHaveAttr("inert", "true"),
      see(selector("[data-player]")).toBeAbsent(),
      // The sheet's own piece that scrolls is the page: its id, its name, its focus.
      see(selector("#track-page")).toHaveAttr("role", "region"),
      see(selector("#track-page")).toHaveAttr("data-sheet-content", ""),
      see(selector("#player-sheet")).toHaveAttr("data-reach", "Whole"),
    ));

  test("as the sheet goes, the page it was opened over is drawn behind it with its navigation and its island, out of reach", () =>
    scene(
      app,
      given(expandedOnFirst),
      sheetEnters(),
      Subscription.emit(reaches("Partly")),
      // The island that will be there when the sheet has gone.
      islandEnters,
      see(selector("#player-sheet")).toHaveAttr("data-reach", "Partly"),
      // What is in the sheet no longer scrolls: a swipe on it is the sheet's.
      see(selector("#track-page")).toHaveClass("overflow-hidden"),
      see(selector("header")).not.toHaveClass("max-md:hidden"),
      // The page behind is the one closing leads to. It is seen, and cannot be acted on.
      see(selector("#new-page")).toHaveAttr("inert", "true"),
      see(selector("[data-player]")).toExist(),
      inside(
        islandLayout,
        see(text(TITLE)).toExist(),
      ),
      see(islandLayout).toHaveAttr("inert", "true"),
      see(islandLayout).toHaveAttr("data-under-sheet", ""),
      // One player by that id, and one piece by each name in a view transition: the one on the sheet.
      see(selector("#player")).toHaveAttr("data-layout", "expanded"),
      seeCarriers(coverName, { inAll: 1, inIsland: 1 }),
      // The swipe comes back: the page behind is hidden again, and the island under the sheet is gone.
      Subscription.emit(reaches("Whole")),
      islandLeaves(),
      see(islandLayout).toBeAbsent(),
      see(selector("header")).toHaveClass("max-md:hidden"),
    ));

  test("Escape on the sheet closes the player", () =>
    scene(
      app,
      given(expandedOnFirst),
      sheetEnters(),
      // Heard on the piece the sheet is drawn in, wherever in the player the focus is.
      keydown(selector("#player-sheet"), "Escape"),
      Command.expectExact(NavigateBack),
      Command.resolve(NavigateBack, Message.CompletedNavigateBack()),
    ));
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

  test("going on to the very track the browser had gone to, still loading, takes that page's reply for the screen", () => {
    // Forward, or a jump through the history, to the next track's own page: the player is held until it loads.
    const browserWent = update(expandedOnFirst, changedUrl(trackPath(explicitTrack.id)));
    expect(browserWent.model.route).toEqual(AppRoute.Track({ trackId: track.id }));
    expect(browserWent.model.awaiting).toMatchObject({
      _tag: "Arrival",
      requestId: nextId(expandedOnFirst),
    });

    const followed = update(browserWent.model, player(Player.Message.ClickedNext()));
    expect(followed.model.route).toEqual(AppRoute.Track({ trackId: explicitTrack.id }));
    expect(isPlayerExpanded(followed.model)).toBe(true);
    // No page is waited for any more: the one that was is on screen, and its reply fills it in place.
    expect(followed.model.awaiting).toEqual({
      _tag: "Reply",
      requestId: nextId(expandedOnFirst),
    });
    // The URL is already that page's: nothing rewrites it, and nothing is added.
    expect(names(followed)).not.toContain("ReplaceTrackUrl");
    expect(names(followed)).not.toContain("NavigateInternal");
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

  test("its row says so plainly and is not a control; its menu still leads to its page", () =>
    scene(
      app,
      given(withSilent),
      inside(
        topSongs,
        see(role("button", { name: /^(Play|Pause): Veridis Quo/ })).toBeAbsent(),
        see(text("This song has no audio to play.")).toBeVisible(),
        see(more("Veridis Quo")).toHaveAttr("aria-haspopup", "menu"),
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
      islandEnters,
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
      sheetEnters(),
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
        see(selector("[data-buffered]")).toHaveStyle("transform", `scaleX(${20 / 30})`),
      ),
    ));

  test("a title that fits stands as plain words, once", () =>
    scene(
      app,
      given(sounding),
      islandEnters,
      inside(island, see(title).toHaveText(TITLE)),
      inside(island, see(title).toHaveAttr("data-title", "Standing")),
      inside(island, see(title).not.toHaveAttr("data-overflowing")),
      inside(island, see(titleLine).toHaveStyle("transform", "translateX(0)")),
    ));

  test("a title too long for its place waits, travels once with its copy behind it, and waits again", () => {
    // The run the title is on once it has been measured: one more than it was on.
    const run = sounding.player.title.run + 1;

    return scene(
      app,
      given(sounding),
      Mount.resolveAll(
        [Player.DrawIslandFigure, Player.Message.CompletedDrawIslandFigure()],
        [Player.FollowIslandPress, Player.Message.CompletedFollowIslandPress()],
        [Player.StartIslandLight, Player.Message.CompletedStartIslandLight()],
        [
          Player.MeasureTitle,
          Player.Message.MeasuredTitle({ placePixels: 180, maybeTravelPixels: Option.some(270) }),
        ],
      ),
      // Measured and found too long: it stands, with its copy ready, for the first wait.
      Command.expectExact(Player.WaitToTravelTitle({ run, milliseconds: 3500 })),
      inside(island, see(title).toHaveAttr("data-overflowing", "")),
      inside(island, see(title).toHaveText(`${TITLE}${TITLE}`)),
      inside(island, see(titleLine).toHaveStyle("transform", "translateX(0)")),
      Command.resolve(Player.WaitToTravelTitle, Player.Message.CompletedWaitToTravelTitle({ run })),
      // One pass: the way measured, at 45 pixels a second.
      Command.expectExact(Player.TravelTitle({ run, milliseconds: 6000 })),
      inside(island, see(title).toHaveAttr("data-title", "Travelling")),
      inside(island, see(titleLine).toHaveStyle("transform", "translateX(-270px)")),
      inside(island, see(titleLine).toHaveStyle("transition", "transform 6000ms linear")),
      Command.resolve(Player.TravelTitle, Player.Message.CompletedTravelTitle({ run })),
      // Back where it began, at once, and the rest between two passes begins.
      Command.expectExact(Player.WaitToTravelTitle({ run, milliseconds: 5000 })),
      inside(island, see(titleLine).toHaveStyle("transform", "translateX(0)")),
      inside(island, see(titleLine).toHaveStyle("transition", "none")),
      // A wait that ends for a run that is no longer the title's is dropped: nothing follows it.
      Command.resolve(
        Player.WaitToTravelTitle,
        Player.Message.CompletedWaitToTravelTitle({ run: run - 1 }),
      ),
      inside(island, see(title).toHaveAttr("data-title", "Standing")),
    );
  });

  test("it stands on one figure, and a tap alone sets no light going", () =>
    scene(
      app,
      given(after(onNew, Message.ClickedPlayTrack({ trackId: track.id, from: "New" }))),
      islandEnters,
      inside(island, expectAll(all.selector("[data-island-lights]")).toHaveCount(1)),
      // Acknowledged: a wish to sound. The light has never travelled, and stays dark.
      inside(island, see(lights).toHaveAttr("data-light", "Dark")),
      // Every path of the figure and of the light is one the outline is written to.
      inside(island, expectAll(all.selector(".island-layer path:not([data-island-outline])")).toHaveCount(0)),
    ));

  test("the light travels on the engine's word that there is sound", () =>
    scene(
      app,
      given(sounding),
      islandEnters,
      inside(island, see(lights).toHaveAttr("data-light", "Travelling")),
    ));

  test("paused, the light is put to rest", () =>
    scene(
      app,
      given(paused),
      islandEnters,
      inside(island, see(lights).toHaveAttr("data-light", "Resting")),
    ));

  test("a start slow enough to be shown still does not halt the light", () =>
    scene(
      app,
      given(
        after(
          sounding,
          player(Player.Message.ClickedNext()),
          player(Player.Message.CompletedWaitBeforeShowingActivity({ order: sounding.player.lastOrder + 1 })),
        ),
      ),
      islandEnters,
      inside(island, see(selector('[data-playback="Starting"]')).toExist()),
      inside(island, see(lights).toHaveAttr("data-light", "Travelling")),
    ));

  test("going on to another track does not halt the light: it travels on until the engine answers", () =>
    scene(
      app,
      given(after(sounding, player(Player.Message.ClickedNext()))),
      islandEnters,
      inside(island, see(lights).toHaveAttr("data-light", "Travelling")),
    ));

  test("Next stands in the island's tail, the piece the figure measures", () =>
    scene(
      app,
      given(sounding),
      islandEnters,
      inside(
        selector("[data-island-tail]"),
        see(role("button", { name: "Next track: Technologic" })).toExist(),
      ),
    ));

  test("Next is not offered after the last track of the queue", () =>
    scene(
      app,
      given(after(onNew, Message.ClickedPlayTrack({ trackId: explicitTrack.id, from: "New" }))),
      islandEnters,
      inside(island, see(role("button", { name: "Next track" })).toBeDisabled()),
    ));

  test("stays where it is, untouched, while the listener goes to another page", () =>
    scene(
      app,
      given(sounding),
      islandEnters,
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
      islandEnters,
      see(selector("[data-player]")).toExist(),
      resolveStart(1),
      thresholdPasses(1),
    ));

  test("expanded, an arrow key on the progress bar asks the engine for the next second", () =>
    scene(
      app,
      given(expandedOnFirst),
      sheetEnters(),
      keydown(seekBar, "ArrowRight"),
      Command.expectExact(
        Player.SeekPlayback({ order: 2, positionSeconds: 13 }),
        Player.ChangeIslandLightPace({ pace: 0 }),
      ),
      Command.resolve(Player.SeekPlayback, Player.Message.CompletedSeekPlayback()),
      lightChangesPace(),
      // The bar stands at the wish, drawn as a wish, until the engine says it is there.
      see(seekBar).toHaveAttr("aria-valuenow", "13"),
      see(selector("[data-seek]")).toHaveAttr("data-seek", "Seeking"),
      see(selector('[data-elapsed="wish"]')).toHaveText("0:13"),
      Subscription.emit(
        said(2, "Sounding", { positionSeconds: 13, maybeDurationSeconds: Option.some(30) }),
      ),
      lightChangesPace(),
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
      sheetEnters(),
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
      islandEnters,
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
      islandEnters,
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
      sheetEnters(),
      seeCarriers(coverName, { inAll: 1, inIsland: 1 }),
      resolveStart(1),
      thresholdPasses(1),
    ));

  test("opening the player hands the cover's name from the island's cover to the expanded one", () =>
    scene(
      app,
      given(sounding),
      islandEnters,
      inside(islandLayout, see(selector("[data-cover]")).toHaveStyle("view-transition-name", coverName)),
      Subscription.emit(clickedLink(trackPath(track.id))),
      islandLeaves(),
      sheetEnters(),
      seeCarriers(coverName, { inAll: 1, inIsland: 1 }),
      inside(expandedLayout, see(selector("[data-cover]")).toHaveStyle("view-transition-name", coverName)),
      resolveOpening(sounding),
    ));

  test("a transition is asked for when the listener puts a track in the island, and only then", () => {
    const transition = (previousModel: Model, message: Message) =>
      viewTransition({ previousModel, model: update(previousModel, message).model, message });

    // The first track played, another row tapped, Next: the listener's own choices.
    expect(transition(onNew, tappedFirstRow)).toEqual({ types: ["choose-track", coverName] });
    expect(
      transition(sounding, Message.ClickedPlayTrack({ trackId: explicitTrack.id, from: "New" })),
    ).toEqual({ types: ["choose-track", `track-cover-${explicitTrack.id}`] });
    expect(transition(sounding, player(Player.Message.ClickedNext()))).toEqual({
      types: ["choose-track", `track-cover-${explicitTrack.id}`],
    });
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

  test("a keyboard selection stays immediate when its engine report shares the frame", () => {
    const keyboard = after(onNew, Message.ChangedInputMethod({ method: "Keyboard" }));
    const message = said(1, "Sounding");
    const model = after(keyboard, tappedFirstRow, message);
    expect(viewTransition({ previousModel: keyboard, model, message })).toBe(false);
  });

  test("the transition is told from the two Models, so the Message that shares its frame cannot hide it", () => {
    // A tap and the engine's first word for it can land in one frame: the runtime tells the last.
    const model = after(onNew, tappedFirstRow, said(1, "Sounding"));
    expect(viewTransition({ previousModel: onNew, model, message: said(1, "Sounding") })).toEqual({
      types: ["choose-track", coverName],
    });
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
      islandEnters,
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
      lightChangesPace(),
      tap((simulation) => drawn.push(places(simulation.html))),
    );

    const [before, afterProgress, afterStall] = drawn;
    expect(before).toHaveLength(11);
    // Home, New, Search, the album's place, the artist's, the playlist's, Genres, Radio, the genre's place, the station's and the passing place: each the same object, so nothing under it was diffed.
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

describe("the menu at the end of a row", () => {
  const item = (name: string | RegExp) => role("menuitem", { name });
  const items = all.role("menuitem");
  const openOn = (model: Model, trackId: typeof track.id): Model =>
    after(model, pressedMore("New", trackId));
  /** An open menu entered the document: its backdrop was put behind it and it was placed by its control. */
  const menuEnters = Mount.resolveAll(
    [Menu.PortalMenuBackdrop, Menu.Message.CompletedPortalMenuBackdrop()],
    [Menu.AnchorMenu, Menu.Message.CompletedAnchorMenu()],
  );

  /**
   * A menu that something was chosen from closes: the focus goes back to its
   * control, and it is taken out of the document once it has faded.
   */
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

  test("before anything is played it offers the album and the track's page, and nothing of a queue", () =>
    scene(
      app,
      given(openOn(onNew, track.id)),
      menuEnters,
      see(more(TITLE)).toHaveAttr("aria-expanded", "true"),
      expectAll(items).toHaveCount(2),
      see(item("Go to album")).toExist(),
      see(item("Song details")).toExist(),
      // Only the menu that was opened is open.
      see(more("Technologic")).toHaveAttr("aria-expanded", "false"),
    ));

  test("Back to the page before: the menu is gone with the list it was on, and nothing of it is left on screen", () =>
    scene(
      app,
      given(openOn(onNew, track.id)),
      menuEnters,
      see(item("Song details")).toExist(),
      // The browser's Back, from New to Home.
      Subscription.emit(changedUrl("/")),
      // Home is shown at once from what it had, and asked for again behind the screen.
      Command.resolveAll(
        [FocusNavigation, Message.CompletedFocusNavigation()],
        [Catalog.HomeFeed, reply.home(nextId(openOn(onNew, track.id)))],
      ),
      Mount.expectEnded(Menu.PortalMenuBackdrop, Menu.AnchorMenu),
      expectAll(items).toHaveCount(0),
      see(more(TITLE)).toHaveAttr("aria-expanded", "false"),
    ));

  test("once something is playing, another track can be queued: next, or after the rest", () =>
    scene(
      app,
      given(openOn(sounding, explicitTrack.id)),
      islandEnters,
      menuEnters,
      expectAll(items).toHaveCount(4),
      see(item("Play next")).toExist(),
      see(item("Add to queue")).toExist(),
      see(item("Go to album")).toExist(),
      see(item("Song details")).toExist(),
    ));

  test("the track the player holds is not queued behind itself", () =>
    scene(
      app,
      given(openOn(sounding, track.id)),
      islandEnters,
      menuEnters,
      expectAll(items).toHaveCount(2),
      see(item("Go to album")).toExist(),
      see(item("Song details")).toExist(),
    ));

  test("Play next: the menu closes, and the row's control shows for a moment that it is done", () =>
    scene(
      app,
      given(openOn(sounding, explicitTrack.id)),
      islandEnters,
      menuEnters,
      see(text("Plays next.")).toBeAbsent(),
      click(item("Play next")),
      Command.expectHas(WaitToClearRowDone({ turn: 1 })),
      ...menuLeaves(),
      see(more("Technologic")).toHaveAttr("aria-expanded", "false"),
      expectAll(items).toHaveCount(0),
      // A tick where the dots were, and the same said in words to assistive technology only.
      inside(more("Technologic"), expectAll(all.selector("svg.text-accent")).toHaveCount(1)),
      see(text("Plays next.")).toHaveAttr("role", "status"),
      see(text("Plays next.")).toHaveClass("sr-only"),
      // Nothing sounds differently for it.
      inside(islandLayout, see(text(TITLE)).toExist(), see(control("Pause")).toExist()),
      Command.resolve(WaitToClearRowDone, Message.CompletedWaitToClearRowDone({ turn: 1 })),
      inside(more("Technologic"), expectAll(all.selector("svg.text-accent")).toHaveCount(0)),
      see(text("Plays next.")).toBeAbsent(),
    ));

  test("Song details: the menu stays open, its item turns, and the page opens when it arrives", () =>
    scene(
      app,
      given(openOn(sounding, explicitTrack.id)),
      islandEnters,
      menuEnters,
      click(item("Song details")),
      // Held, as any page that was chosen: New stays. The menu stays open too, and the mark is on
      // the item that was pressed, not on the row's control.
      see(role("heading", { name: "New", level: 1 })).toBeVisible(),
      see(more("Technologic")).toHaveAttr("aria-expanded", "true"),
      inside(item("Song details"), expectAll(all.selector("svg.animate-spin")).toHaveCount(1)),
      inside(more("Technologic"), expectAll(all.selector("svg.animate-spin")).toHaveCount(0)),
      Command.resolve(Catalog.TrackDetail, reply.track(nextId(sounding), bareTrack)),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusPage, Message.CompletedFocusPage()],
      ),
      // The menu went with the page it was on.
      Mount.expectEnded(Menu.PortalMenuBackdrop, Menu.AnchorMenu),
      inside(
        selector("#track-page"),
        see(role("heading", { name: /Technologic/, level: 1 })).toExist(),
      ),
    ));

  test("a page that fails to open says so on the item, and the item tries again", () => {
    // The Model the second request is named from: the first was asked, and was lost.
    const asked = after(
      openOn(sounding, explicitTrack.id),
      choseFromRow("New", explicitTrack.id, "OpenSong"),
    );
    const lost = after(asked, arrived(reply.trackLost(nextId(sounding))));

    scene(
      app,
      given(openOn(sounding, explicitTrack.id)),
      islandEnters,
      menuEnters,
      click(item("Song details")),
      Command.resolve(Catalog.TrackDetail, reply.trackLost(nextId(sounding))),
      // Still open, and the way to try again is where the listener's finger is.
      see(more("Technologic")).toHaveAttr("aria-expanded", "true"),
      see(item(/Song details.*Could not open\. Try again/)).toExist(),
      inside(role("menu"), expectAll(all.selector("svg.animate-spin")).toHaveCount(0)),
      click(item(/Song details/)),
      inside(item(/Song details/), expectAll(all.selector("svg.animate-spin")).toHaveCount(1)),
      Command.expectHas(Catalog.TrackDetail),
      Command.resolve(Catalog.TrackDetail, reply.track(nextId(lost), bareTrack)),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusPage, Message.CompletedFocusPage()],
      ),
      Mount.expectEnded(Menu.PortalMenuBackdrop, Menu.AnchorMenu),
      inside(
        selector("#track-page"),
        see(role("heading", { name: /Technologic/, level: 1 })).toExist(),
      ),
    );
  });
});
