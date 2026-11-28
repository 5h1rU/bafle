import { TrackId, type TrackSummary } from "@bafle/domain/Catalog/Track";
import { Menu, Slider } from "@foldkit/ui";
import * as Option from "effect/Option";
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
  text,
} from "foldkit/scene";
import { modifyFields } from "foldkit/struct";
import { describe, expect, test } from "vitest";
import * as Marquee from "../src/marquee/index.ts";
import { Catalog } from "../src/catalog.ts";
import { FocusPage, NavigateInternal } from "../src/command.ts";
import { QUEUE_COLUMN_CLOSES, QUEUE_COLUMN_OPENS, update, viewTransition } from "../src/main.ts";
import { Message } from "../src/message.ts";
import { Awaiting, type Model, isPlayerExpanded, maybeHeadedFor } from "../src/model.ts";
import type { EnginePhase, EngineReport } from "../src/player/audioEngine.ts";
import * as Player from "../src/player/index.ts";
import { AppRoute } from "../src/route.ts";
import { view } from "../src/view.ts";
import {
  after,
  arrived,
  awaitedId,
  changedUrl,
  choseFromPlayer,
  choseFromRow,
  clickedLink,
  explicitTrack,
  onNew,
  reply,
  scene,
  silentTrack,
  track,
  trackPath,
} from "./fixtures.ts";

// A DESKTOP'S SCREEN

// On a screen wide enough for three columns the player does not expand: the
// island stays an island, with controls of its own for what the sheet would
// have held, and the queue opens in a column beside the page. None of it is
// a route, so none of it moves the history.

const app = { update, view };

const TITLE = "Harder, Better, Faster, Stronger";

const island = role("region", { name: "Player" });
const queueColumn = role("complementary", { name: "Queue" });
const queueControl = role("button", { name: "Queue" });
const expandedLayout = selector('[data-layout="expanded"]');

const player = (message: Player.Message): Message => Message.GotPlayerMessage({ message });

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

const becameDesktop = Message.ChangedScreen({ screen: "Desktop" });
const becameCompact = Message.ChangedScreen({ screen: "Compact" });

/** New on screen, on a compact screen: its first track sounding, twelve seconds into thirty. */
const sounding: Model = after(
  onNew,
  Message.ClickedPlayTrack({ trackId: track.id, from: "New" }),
  said(1, "Sounding", { positionSeconds: 12, maybeDurationSeconds: Option.some(30) }),
);

/** The same on a desktop's screen. */
const onDesktop: Model = after(sounding, becameDesktop);

/** The island pressed on a compact screen: the player expanded on the track it holds. */
const expanded: Model = after(
  sounding,
  clickedLink(trackPath(track.id)),
  changedUrl(trackPath(track.id)),
);

/** A third and a fourth track with something to play, so the queue has songs that play later. */
const thirdTrack: TrackSummary = {
  ...track,
  id: silentTrack.id,
  title: "Around the World",
  previewUrl: "https://audio.test/tr-3.mp3",
};
const fourthTrack: TrackSummary = {
  ...track,
  id: TrackId.make("tr-4"),
  title: "One More Time",
  previewUrl: "https://audio.test/tr-4.mp3",
};

/** A desktop's screen with a queue of three behind the track that sounds, and the queue open beside the page. */
const withLongQueue: Model = modifyFields(onDesktop, {
  player: () =>
    Player.update(
      Player.choose(Player.init(), {
        trackId: track.id,
        list: [track, explicitTrack, thirdTrack, fourthTrack],
      }).model,
      Player.Message.GotQueueMessage({ message: Player.Queue.Message.ClickedColumnControl() }),
    ).model,
});

const islandEnters = Mount.resolveAll(
  [Player.Island.DrawFigure, Player.Island.Message.CompletedDrawFigure()],
  [Player.Island.FollowPress, Player.Island.Message.CompletedFollowPress()],
  [Player.Island.StartLight, Player.Island.Message.CompletedStartLight()],
  [Marquee.Measure, Marquee.Message.Measured({ placePixels: 0, maybeTravelPixels: Option.none() })],
  [Marquee.Measure, Marquee.Message.Measured({ placePixels: 0, maybeTravelPixels: Option.none() })],
);

const transition = (previousModel: Model, message: Message) =>
  viewTransition({ previousModel, model: update(previousModel, message).model, message });

describe("the screen is told by the document", () => {
  test("the app starts as a compact screen, and is a desktop's from when the document says so", () => {
    expect(onNew.screen).toBe("Compact");
    expect(after(onNew, becameDesktop).screen).toBe("Desktop");
  });

  test("told what it already is, nothing changes", () => {
    expect(update(onDesktop, becameDesktop).model).toBe(onDesktop);
  });

  test("a window made wide under an expanded player: the same route is the track's own page, and the history is left alone", () => {
    const widened = update(expanded, becameDesktop);

    expect(isPlayerExpanded(expanded)).toBe(true);
    expect(isPlayerExpanded(widened.model)).toBe(false);
    expect(widened.model.route).toEqual(expanded.route);
    expect(widened.model.trail).toEqual(expanded.trail);
    expect(widened.commands ?? []).toEqual([]);
    // Nothing is seen to grow or shrink under a hand on the window's edge.
    expect(transition(expanded, becameDesktop)).toBe(false);
  });

  test("made narrow again on that page, the player is its sheet once more, whole", () => {
    const narrowed = after(expanded, becameDesktop, becameCompact);

    expect(isPlayerExpanded(narrowed)).toBe(true);
    expect(narrowed.playerSheet.reach).toBe(expanded.playerSheet.reach);
    expect(transition(after(expanded, becameDesktop), becameCompact)).toBe(false);
  });

  test("a menu of the player's left open does not outlive the screen it was opened on", () => {
    const menuOpen = after(
      onDesktop,
      player(Player.Message.GotMoreMenuMessage({ message: Menu.Message.ClickedButton() })),
    );
    expect(Player.isMoreMenuOpen(menuOpen.player)).toBe(true);
    expect(Player.isMoreMenuOpen(after(menuOpen, becameCompact).player)).toBe(false);
  });
});

describe("the island on a desktop's screen", () => {
  test("it does not expand: its words are no link, and it has the queue, the menu and Previous of its own", () =>
    scene(
      app,
      given(onDesktop),
      islandEnters,
      inside(
        island,
        see(role("link", { name: /^Open the player/ })).toBeAbsent(),
        see(text(TITLE)).toExist(),
        see(queueControl).toHaveAttr("aria-expanded", "false"),
        see(role("button", { name: `More: ${TITLE}` })).toExist(),
        // Nothing was played before it, so there is no track for Previous to lead to.
        see(role("button", { name: "Previous track" })).toBeDisabled(),
        see(role("button", { name: `Pause: ${TITLE}` })).toExist(),
        see(role("button", { name: "Next track: Technologic" })).toBeEnabled(),
      ),
      see(expandedLayout).toBeAbsent(),
      see(queueColumn).toBeAbsent(),
    ));

  test("the progress of the sound is on it, and is moved there as in the expanded player", () =>
    scene(
      app,
      given(onDesktop),
      islandEnters,
      inside(
        island,
        // The length is the engine's, and the times stand on either side of the bar.
        see(role("slider", { name: `Seek: ${TITLE}` })).toHaveAttr("aria-valuenow", "12"),
        see(role("slider", { name: `Seek: ${TITLE}` })).toHaveAttr("aria-valuemax", "30"),
        see(role("slider", { name: `Seek: ${TITLE}` })).toHaveAttr(
          "aria-valuetext",
          "0:12 of 0:30",
        ),
        see(selector("[data-elapsed]")).toHaveText("0:12"),
        see(selector("[data-remaining]")).toHaveText("−0:18"),
      ),
    ));

  test("a key on the bar asks the engine for the new position, and the time stands there as a wish", () => {
    const sought = update(
      onDesktop,
      player(
        Player.Message.GotSeekSliderMessage({
          message: Slider.Message.PressedKeyboardNavigation({
            direction: "StepIncrement",
            value: 12,
          }),
        }),
      ),
    );

    expect((sought.commands ?? []).map((command) => [command.name, command.args])).toContainEqual([
      "SeekPlayback",
      { order: 2, positionSeconds: 13 },
    ]);
  });

  test("before the engine has read the audio's length there is no bar to move, and an empty one stands for it", () =>
    scene(
      app,
      given(
        after(onNew, Message.ClickedPlayTrack({ trackId: track.id, from: "New" }), becameDesktop),
      ),
      islandEnters,
      inside(island, see(role("slider")).toBeAbsent(), see(text("–:––")).toExist()),
    ));

  test("on a compact screen it has none of them: they are the expanded player's", () =>
    scene(
      app,
      given(sounding),
      islandEnters,
      inside(
        island,
        see(role("link", { name: `Open the player: ${TITLE} by Daft Punk` })).toExist(),
        see(queueControl).toBeAbsent(),
        see(role("button", { name: `More: ${TITLE}` })).toBeAbsent(),
        see(role("button", { name: /^Previous track/ })).toBeAbsent(),
        see(role("slider")).toBeAbsent(),
      ),
    ));

  test("the page of the track it holds is that track's own page, waited for like any other", () => {
    const asked = after(onDesktop, choseFromRow("New", track.id, "OpenSong"));

    // Held: on a compact screen this page is the player and takes the screen at once.
    expect(asked.route).toEqual(onDesktop.route);
    expect(maybeHeadedFor(asked)).toEqual(Option.some(AppRoute.Track({ trackId: track.id })));

    const shown = after(
      asked,
      arrived(reply.track(awaitedId(asked))),
      changedUrl(trackPath(track.id)),
    );
    expect(shown.route).toEqual(AppRoute.Track({ trackId: track.id }));
    expect(isPlayerExpanded(shown)).toBe(false);
  });

  test("its menu stays open while the player is its island, which is all it ever is here", () => {
    const menuOpen = after(
      onDesktop,
      player(Player.Message.GotMoreMenuMessage({ message: Menu.Message.ClickedButton() })),
    );
    expect(
      Player.isMoreMenuOpen(after(menuOpen, said(1, "Sounding", { positionSeconds: 13 })).player),
    ).toBe(true);
  });
});

describe("Song details, from the island's menu", () => {
  const asked = update(onDesktop, choseFromPlayer("SongDetails"));

  test("is followed as a link to the track's page: the page on screen is held, and the player turns to no face", () => {
    expect(asked.model.route).toEqual(onDesktop.route);
    expect(maybeHeadedFor(asked.model)).toEqual(Option.some(AppRoute.Track({ trackId: track.id })));
    expect(Player.isMoreMenuOpen(asked.model.player)).toBe(false);
    expect(Option.getOrThrow(asked.model.player.maybeSession).pane).toBe("Artwork");
  });

  test("the page takes the screen when the catalog answers, and the island is still the island", () => {
    const shown = after(asked.model, arrived(reply.track(awaitedId(asked.model))));

    expect(shown.route).toEqual(AppRoute.Track({ trackId: track.id }));
    expect(isPlayerExpanded(shown)).toBe(false);
    expect(shown.trail).toEqual([...onDesktop.trail, onDesktop.route]);
  });

  test("with no row to say a failure on, the page takes the screen and says it", () => {
    expect(Awaiting.guards.Intention(asked.model.awaiting) && asked.model.awaiting.onPage).toBe(
      true,
    );

    const failed = after(asked.model, arrived(reply.trackLost(awaitedId(asked.model))));
    expect(failed.route).toEqual(AppRoute.Track({ trackId: track.id }));
  });

  test("the same track asked from its row stays behind its row when it fails", () => {
    const fromRow = after(onDesktop, choseFromRow("New", track.id, "OpenSong"));
    const failed = after(fromRow, arrived(reply.trackLost(awaitedId(fromRow))));

    expect(failed.route).toEqual(onDesktop.route);
  });

  test("while the page is on its way the island's control says so, and the page is announced", () =>
    scene(
      app,
      given(onDesktop),
      islandEnters,
      Subscription.emit(choseFromPlayer("SongDetails")),
      inside(
        island,
        see(role("button", { name: `More: ${TITLE}` })).toHaveAttr("aria-busy", "true"),
      ),
      see(text(`Loading ${TITLE}`)).toExist(),
      Command.resolve(Catalog.TrackDetail, reply.track(awaitedId(asked.model))),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusPage, Message.CompletedFocusPage()],
      ),
      inside(
        selector("#track-page"),
        see(role("heading", { name: new RegExp(TITLE), level: 1 })).toExist(),
      ),
      see(island).toExist(),
      see(expandedLayout).toBeAbsent(),
    ));
});

describe("the queue beside the page", () => {
  test("the island's control opens it and closes it, and nothing of the route or the history moves", () => {
    const opened = update(
      onDesktop,
      player(
        Player.Message.GotQueueMessage({ message: Player.Queue.Message.ClickedColumnControl() }),
      ),
    );

    expect(Player.isQueueColumnOpen(opened.model.player)).toBe(true);
    expect(opened.model.route).toEqual(onDesktop.route);
    expect(opened.model.trail).toEqual(onDesktop.trail);
    expect(opened.commands ?? []).toEqual([]);

    const closed = update(
      opened.model,
      player(
        Player.Message.GotQueueMessage({ message: Player.Queue.Message.ClickedColumnControl() }),
      ),
    );
    expect(Player.isQueueColumnOpen(closed.model.player)).toBe(false);
    expect(closed.commands ?? []).toEqual([]);
  });

  test("it comes in from its side and goes back off it, each by its own name", () => {
    const opened = after(
      onDesktop,
      player(
        Player.Message.GotQueueMessage({ message: Player.Queue.Message.ClickedColumnControl() }),
      ),
    );

    expect(
      transition(
        onDesktop,
        player(
          Player.Message.GotQueueMessage({ message: Player.Queue.Message.ClickedColumnControl() }),
        ),
      ),
    ).toEqual({
      types: [QUEUE_COLUMN_OPENS],
    });
    expect(
      transition(
        opened,
        player(
          Player.Message.GotQueueMessage({ message: Player.Queue.Message.ClickedColumnControl() }),
        ),
      ),
    ).toEqual({
      types: [QUEUE_COLUMN_CLOSES],
    });
    expect(
      transition(
        opened,
        player(
          Player.Message.GotQueueMessage({ message: Player.Queue.Message.ClickedCloseColumn() }),
        ),
      ),
    ).toEqual({
      types: [QUEUE_COLUMN_CLOSES],
    });
  });

  test("it stays open while the listener goes to other pages and plays other lists", () => {
    const opened = after(
      onDesktop,
      player(
        Player.Message.GotQueueMessage({ message: Player.Queue.Message.ClickedColumnControl() }),
      ),
    );
    const elsewhere = after(
      opened,
      clickedLink("/"),
      Message.ClickedPlayTrack({ trackId: explicitTrack.id, from: "New" }),
    );

    expect(elsewhere.route).toEqual(AppRoute.Home());
    expect(Player.isQueueColumnOpen(elsewhere.player)).toBe(true);
  });

  test("its own control closes it and hands the focus back to the island's", () => {
    const opened = after(
      onDesktop,
      player(
        Player.Message.GotQueueMessage({ message: Player.Queue.Message.ClickedColumnControl() }),
      ),
    );
    const closed = update(
      opened,
      player(
        Player.Message.GotQueueMessage({ message: Player.Queue.Message.ClickedCloseColumn() }),
      ),
    );

    expect(Player.isQueueColumnOpen(closed.model.player)).toBe(false);
    expect((closed.commands ?? []).map((command) => command.name)).toEqual([
      Player.Queue.FocusControl().name,
    ]);
  });

  test("on a compact screen there is no column, whatever was left open on a desktop's", () =>
    scene(
      app,
      given(after(withLongQueue, becameCompact)),
      islandEnters,
      see(queueColumn).toBeAbsent(),
    ));

  test("opened, it lists what plays next on a card and what plays later under it, and the page beside it is as it was", () =>
    scene(
      app,
      given(withLongQueue),
      islandEnters,
      inside(island, see(queueControl).toHaveAttr("aria-expanded", "true")),
      inside(
        queueColumn,
        see(role("heading", { name: "Queue", level: 2 })).toExist(),
        see(role("heading", { name: "Up next", level: 3 })).toExist(),
        see(role("button", { name: "Play: Technologic by Daft Punk" })).toExist(),
        see(role("heading", { name: "Later", level: 3 })).toExist(),
        see(text("2 songs")).toExist(),
        inside(
          role("list", { name: "Later" }),
          // Each by its place in all that is played: the current song is the first.
          see(text("03")).toExist(),
          see(text("04")).toExist(),
          see(role("button", { name: "Play: Around the World by Daft Punk" })).toExist(),
          see(role("button", { name: "Move: One More Time" })).toExist(),
        ),
      ),
      // The page on screen is the page that was there, and can be used.
      see(role("heading", { name: "New", level: 1 })).toBeVisible(),
      see(selector("#new-page:not([inert])")).toExist(),
    ));

  test("a song pressed in it becomes the current one, and the column goes on listing what is left", () =>
    scene(
      app,
      given(withLongQueue),
      islandEnters,
      inside(queueColumn, click(role("button", { name: "Play: Around the World by Daft Punk" }))),
      Command.resolveAll(
        [
          Player.StartPlayback,
          Player.Message.CompletedStartPlayback({ order: 2, outcome: "Sounding" }),
        ],
        [Player.PublishNowPlaying, Player.Message.CompletedPublishNowPlaying()],
        [
          Player.WaitBeforeShowingActivity,
          Player.Message.CompletedWaitBeforeShowingActivity({ order: 2 }),
        ],
      ),
      inside(island, see(text("Around the World")).toExist()),
      inside(
        queueColumn,
        see(role("button", { name: "Play: One More Time by Daft Punk" })).toExist(),
        // One song is left: it is the one that plays next, and none plays later.
        see(role("heading", { name: "Later", level: 3 })).toBeAbsent(),
      ),
    ));

  test("closed by its own control, it is gone and the island's control is unlit", () =>
    scene(
      app,
      given(withLongQueue),
      islandEnters,
      inside(queueColumn, click(role("button", { name: "Close the queue" }))),
      Command.resolve(Player.Queue.FocusControl, Player.Queue.Message.CompletedFocusControl()),
      see(queueColumn).toBeAbsent(),
      inside(island, see(queueControl).toHaveAttr("aria-expanded", "false")),
    ));

  test("with nothing left to come it says so", () =>
    scene(
      app,
      given(
        modifyFields(onDesktop, {
          player: () =>
            Player.update(
              Player.choose(onDesktop.player, {
                trackId: explicitTrack.id,
                list: [track, explicitTrack],
              }).model,
              Player.Message.GotQueueMessage({
                message: Player.Queue.Message.ClickedColumnControl(),
              }),
            ).model,
        }),
      ),
      islandEnters,
      inside(queueColumn, see(text("No upcoming songs.")).toExist()),
    ));
});
