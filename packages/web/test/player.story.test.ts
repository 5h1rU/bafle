import type { TrackSummary } from "@bafle/domain/Catalog/Track";
import { DragAndDrop, Slider } from "@foldkit/ui";
import * as Option from "effect/Option";
import { Command, given, message, model, story } from "foldkit/story";
import { describe, expect, test } from "vitest";
import type { EnginePhase, EngineReport } from "../src/player/audioEngine.ts";
import * as Player from "../src/player/index.ts";
import { explicitTrack, fullTrack, silentTrack, track } from "./fixtures.ts";

const { Message, Playback, Seek } = Player;

/** A third track with something to play, so a queue has a middle. */
const thirdTrack: TrackSummary = {
  ...track,
  id: silentTrack.id,
  title: silentTrack.title,
  previewUrl: "https://audio.test/tr-3.mp3",
};

const list: ReadonlyArray<TrackSummary> = [track, explicitTrack, thirdTrack];

type Outcome = ReturnType<typeof Player.update>;

/** The Command that takes the island's light to another pace. Its own tests are with the island's. */
const LIGHT_PACE = Player.ChangeIslandLightPace({ pace: 0 }).name;

/**
 * What a result asks the runtime to do, as name and args. The light's pace
 * is left out: it follows what the engine says, whatever was asked of it.
 */
const asked = (outcome: Outcome) =>
  (outcome.commands ?? [])
    .filter((command) => command.name !== LIGHT_PACE)
    .map((command) => [command.name, command.args]);

/** The light is told to travel, or to come to rest, and that is done. */
const lightChangesPace = () =>
  Command.resolve(Player.ChangeIslandLightPace, Message.CompletedChangeIslandLightPace());

/** The Model after these Messages, Commands unrun: an order given and never answered. */
const after = (start: Player.Model, ...messages: ReadonlyArray<Player.Message>): Player.Model =>
  messages.reduce((current, sent) => Player.update(current, sent).model, start);

const session = (player: Player.Model): Player.Session => Option.getOrThrow(player.maybeSession);

const playback = (player: Player.Model): Player.Playback => session(player).playback;

/** The engine's word, in answer to an order. */
const said = (
  order: number,
  phase: EnginePhase,
  more: Partial<Omit<EngineReport, "order" | "phase">> = {},
): Player.Message =>
  Message.UpdatedEngineStatus({
    report: {
      order,
      phase,
      positionSeconds: 0,
      maybeDurationSeconds: Option.none(),
      bufferedSeconds: 0,
      isSeeking: false,
      ...more,
    },
  });

/** The listener tapped a track in a list: the first order given to the engine. */
const tapped = (trackId: TrackSummary["id"], from: Player.Model = Player.init()): Outcome =>
  Player.choose(from, { trackId, list });

/** The first track tapped in the list of three: asked for, and nothing heard from the engine. */
const acknowledged = tapped(track.id).model;

/** The same, with the engine saying it sounds, twelve seconds into thirty. */
const sounding = after(
  acknowledged,
  said(1, "Sounding", {
    positionSeconds: 12,
    maybeDurationSeconds: Option.some(30),
    bufferedSeconds: 20,
  }),
);

/** The middle track sounding: one before it in the queue, one after. */
const soundingMiddle = after(
  tapped(explicitTrack.id).model,
  said(1, "Sounding", { maybeDurationSeconds: Option.some(30) }),
);

describe("a tap plays", () => {
  test("the track is the current one at once, the list is the queue, and nothing is claimed of the sound", () => {
    const outcome = tapped(explicitTrack.id);

    expect(session(outcome.model).current.id).toBe(explicitTrack.id);
    expect(session(outcome.model).earlier.map((queued) => queued.id)).toEqual([track.id]);
    expect(session(outcome.model).later.map((queued) => queued.id)).toEqual([thirdTrack.id]);
    expect(session(outcome.model).cue).toBe("Chosen");
    // Asked for, not sounding: only the engine can say that it sounds.
    expect(playback(outcome.model)).toEqual(Playback.Acknowledged());
    expect(outcome.model.lastOrder).toBe(1);
    expect(asked(outcome)).toEqual([
      [
        "StartPlayback",
        { order: 1, source: "https://audio.test/tr-2.mp3", positionSeconds: 0 },
      ],
      ["WaitBeforeShowingActivity", { order: 1 }],
      [
        "PublishNowPlaying",
        {
          title: "Technologic",
          artist: "Daft Punk",
          album: "Human After All",
          maybeArtworkUrl: Option.none(),
        },
      ],
    ]);
  });

  test("a track with nothing to play cannot be started, and is not queued", () => {
    const refused = Player.choose(Player.init(), { trackId: silentTrack.id, list: [track, silentTrack] });
    expect(refused.model).toEqual(Player.init());
    expect(asked(refused)).toEqual([]);

    const queued = Player.choose(Player.init(), { trackId: track.id, list: [track, silentTrack] });
    expect(session(queued.model).later).toEqual([]);
  });

  test("the source is read from the catalog's field in one place", () => {
    expect(Player.playableSource(track)).toEqual(Option.some("https://audio.test/tr-1.mp3"));
    expect(Player.playableSource(silentTrack)).toEqual(Option.none());
  });
});

describe("starting", () => {
  test("a start that sounds within the threshold never shows activity", () =>
    story(
      Player.update,
      given(acknowledged),
      message(said(1, "Waiting")),
      // Waiting for the first data is still only a wish to sound.
      model((player) => expect(playback(player)).toEqual(Playback.Acknowledged())),
      message(said(1, "Sounding", { maybeDurationSeconds: Option.some(30) })),
      lightChangesPace(),
      model((player) => expect(playback(player)).toEqual(Playback.Sounding())),
      // The timer set at the tap goes off after the sound started: there is nothing left to say.
      message(Message.CompletedWaitBeforeShowingActivity({ order: 1 })),
      model((player) => expect(playback(player)).toEqual(Playback.Sounding())),
    ));

  test("a start that takes longer says so, and then sounds on the engine's word", () =>
    story(
      Player.update,
      given(acknowledged),
      message(Message.CompletedWaitBeforeShowingActivity({ order: 1 })),
      model((player) => expect(playback(player)).toEqual(Playback.Starting())),
      message(said(1, "Waiting")),
      model((player) => expect(playback(player)).toEqual(Playback.Starting())),
      message(said(1, "Sounding")),
      lightChangesPace(),
      model((player) => expect(playback(player)).toEqual(Playback.Sounding())),
    ));

  test("the engine's promise that it sounds changes nothing: its reports are the word", () => {
    const answered = Player.update(
      acknowledged,
      Message.CompletedStartPlayback({ order: 1, outcome: "Sounding" }),
    );
    expect(answered.model).toBe(acknowledged);
  });

  test("the length is the engine's, not the catalog's", () => {
    expect(track.durationSeconds).toBe(224);
    expect(session(sounding).maybeDurationSeconds).toEqual(Option.some(30));
    expect(session(sounding).positionSeconds).toBe(12);
    expect(session(sounding).bufferedSeconds).toBe(20);
  });
});

describe("the latest wish wins", () => {
  test("a second tap on the same track while it starts changes nothing", () => {
    const again = tapped(track.id, acknowledged);
    expect(again.model).toBe(acknowledged);
    expect(asked(again)).toEqual([]);

    const slow = after(acknowledged, Message.CompletedWaitBeforeShowingActivity({ order: 1 }));
    expect(tapped(track.id, slow).model).toBe(slow);
  });

  test("a tap on another track while the first starts replaces it, and the first's reports are dropped", () => {
    const other = tapped(explicitTrack.id, acknowledged);
    expect(session(other.model).current.id).toBe(explicitTrack.id);
    expect(other.model.lastOrder).toBe(2);
    expect(asked(other)[0]).toEqual([
      "StartPlayback",
      { order: 2, source: "https://audio.test/tr-2.mp3", positionSeconds: 0 },
    ]);

    // The first track starts sounding in the engine's eyes just before it hears of the second.
    const late = Player.update(other.model, said(1, "Sounding"));
    expect(late.model).toBe(other.model);
    expect(playback(late.model)).toEqual(Playback.Acknowledged());
    // So do its timer and the system's answer to it.
    expect(
      after(
        other.model,
        Message.CompletedWaitBeforeShowingActivity({ order: 1 }),
        Message.CompletedStartPlayback({ order: 1, outcome: "Refused" }),
      ),
    ).toBe(other.model);
  });

  test("a report that says nothing new leaves the Model the very same, to be drawn the very same", () => {
    const repeated = Player.update(
      sounding,
      said(1, "Sounding", {
        positionSeconds: 12,
        maybeDurationSeconds: Option.some(30),
        bufferedSeconds: 20,
      }),
    );
    expect(repeated.model).toBe(sounding);
  });
});

describe("sounding and waiting", () => {
  test("progress moves the position and nothing else", () => {
    const later = after(
      sounding,
      said(1, "Sounding", {
        positionSeconds: 13,
        maybeDurationSeconds: Option.some(30),
        bufferedSeconds: 30,
      }),
    );
    expect(session(later).positionSeconds).toBe(13);
    expect(session(later).bufferedSeconds).toBe(30);
    expect(playback(later)).toEqual(Playback.Sounding());
  });

  test("a stall mid-track is waiting: not paused, not sounding", () =>
    story(
      Player.update,
      given(sounding),
      message(said(1, "Waiting", { positionSeconds: 12, maybeDurationSeconds: Option.some(30) })),
      lightChangesPace(),
      model((player) => expect(playback(player)).toEqual(Playback.Waiting())),
      message(said(1, "Sounding", { positionSeconds: 12, maybeDurationSeconds: Option.some(30) })),
      lightChangesPace(),
      model((player) => expect(playback(player)).toEqual(Playback.Sounding())),
    ));
});

describe("paused by the listener, stopped by the system", () => {
  test("pause is the listener's wish, and is a new order", () =>
    story(
      Player.update,
      given(sounding),
      message(Message.ClickedPause()),
      model((player) => {
        expect(playback(player)).toEqual(Playback.Paused());
        expect(player.lastOrder).toBe(2);
      }),
      // The light comes to rest with the wish: it does not wait for the engine's word.
      Command.expectExact(
        Player.PausePlayback({ order: 2 }),
        Player.ChangeIslandLightPace({ pace: 0 }),
      ),
      Command.resolve(Player.PausePlayback, Message.CompletedPausePlayback()),
      lightChangesPace(),
      message(said(2, "Paused", { positionSeconds: 12, maybeDurationSeconds: Option.some(30) })),
      model((player) => expect(playback(player)).toEqual(Playback.Paused())),
    ));

  test("play after a pause goes through acknowledged again", () => {
    const paused = after(sounding, Message.ClickedPause());
    const resumed = Player.update(paused, Message.ClickedPlay());

    expect(playback(resumed.model)).toEqual(Playback.Acknowledged());
    expect(asked(resumed)).toEqual([
      ["ResumePlayback", { order: 3 }],
      ["WaitBeforeShowingActivity", { order: 3 }],
    ]);
    expect(playback(after(resumed.model, said(3, "Sounding")))).toEqual(Playback.Sounding());
  });

  test("a pause while the track starts is a pause, and the start's late word does not undo it", () => {
    const paused = after(acknowledged, Message.ClickedPause());
    expect(playback(paused)).toEqual(Playback.Paused());
    expect(playback(after(paused, said(1, "Sounding")))).toEqual(Playback.Paused());
  });

  test("the system refusing to start the sound is not a pause: it is said, with what to do", () =>
    story(
      Player.update,
      given(acknowledged),
      message(Message.CompletedStartPlayback({ order: 1, outcome: "Refused" })),
      model((player) =>
        expect(playback(player)).toEqual(Playback.Stopped({ cause: "Refused" })),
      ),
      // Pressing play is the way out, and it is a wish like any other.
      message(Message.ClickedPlay()),
      Command.expectExact(
        Player.ResumePlayback({ order: 2 }),
        Player.WaitBeforeShowingActivity({ order: 2 }),
      ),
      Command.resolveAll(
        [Player.ResumePlayback, Message.CompletedResumePlayback({ order: 2, outcome: "Sounding" })],
        [Player.WaitBeforeShowingActivity, Message.CompletedWaitBeforeShowingActivity({ order: 2 })],
      ),
      message(said(2, "Sounding")),
      lightChangesPace(),
      model((player) => expect(playback(player)).toEqual(Playback.Sounding())),
    ));

  test("an engine that reports silence where sound was asked for was refused too", () => {
    expect(playback(after(acknowledged, said(1, "Paused")))).toEqual(
      Playback.Stopped({ cause: "Refused" }),
    );
  });

  test("silence the listener did not ask for, mid-track, is the system's interruption", () => {
    const interrupted = after(sounding, said(1, "Paused", { positionSeconds: 14 }));
    expect(playback(interrupted)).toEqual(Playback.Stopped({ cause: "Interrupted" }));
    expect(session(interrupted).positionSeconds).toBe(14);
    // Sound that comes back by the system's hand is sound: the engine says so.
    expect(playback(after(interrupted, said(1, "Sounding")))).toEqual(Playback.Sounding());
  });

  test("a refusal that arrives for a track already paused changes nothing", () => {
    const paused = after(acknowledged, Message.ClickedPause());
    expect(
      Player.update(paused, Message.CompletedStartPlayback({ order: 1, outcome: "Refused" })).model,
    ).toBe(paused);
  });
});

describe("seeking", () => {
  const dragging = after(
    sounding,
    Message.GotSeekSliderMessage({ message: Slider.Message.PressedThumb({ originValue: 12 }) }),
  );
  const draggedTo = (value: number) =>
    Message.GotSeekSliderMessage({ message: Slider.Message.MovedDragPointer({ value }) });
  const released = Message.GotSeekSliderMessage({ message: Slider.Message.ReleasedDragPointer() });

  test("the slider's range is the engine's length", () => {
    expect(session(sounding).seekSlider.max).toBe(30);
    expect(session(acknowledged).seekSlider.dragState._tag).toBe("Idle");
  });

  test("dragging moves the wish at once and asks nothing of the engine", () => {
    const moved = Player.update(dragging, draggedTo(20));

    expect(session(moved.model).seek).toEqual(Seek.Scrubbing({ targetSeconds: 20 }));
    expect(Player.shownPositionSeconds(session(moved.model))).toBe(20);
    expect(asked(moved)).toEqual([]);
    expect(moved.model.lastOrder).toBe(1);
    // The engine goes on sounding where it was, and says so: the bar stays with the wish.
    const meanwhile = after(
      moved.model,
      said(1, "Sounding", { positionSeconds: 13, maybeDurationSeconds: Option.some(30) }),
    );
    expect(session(meanwhile).positionSeconds).toBe(13);
    expect(Player.shownPositionSeconds(session(meanwhile))).toBe(20);
  });

  test("letting go asks the engine, and the wish stands until the engine is there", () =>
    story(
      Player.update,
      given(after(dragging, draggedTo(20), draggedTo(22))),
      message(released),
      model((player) => {
        expect(session(player).seek).toEqual(Seek.Seeking({ targetSeconds: 22 }));
        expect(player.lastOrder).toBe(2);
        // Asked, and nothing heard back: the sound is not claimed to be at the new position.
        expect(playback(player)).toEqual(Playback.Waiting());
      }),
      Command.expectExact(
        Player.SeekPlayback({ order: 2, positionSeconds: 22 }),
        Player.ChangeIslandLightPace({ pace: 0 }),
      ),
      Command.resolve(Player.SeekPlayback, Message.CompletedSeekPlayback()),
      lightChangesPace(),
      // Still on its way: the bar shows where the listener asked to be, and the sound is not claimed there.
      message(
        said(2, "Waiting", {
          positionSeconds: 22,
          maybeDurationSeconds: Option.some(30),
          isSeeking: true,
        }),
      ),
      model((player) => {
        expect(session(player).seek).toEqual(Seek.Seeking({ targetSeconds: 22 }));
        expect(playback(player)).toEqual(Playback.Waiting());
      }),
      message(said(2, "Sounding", { positionSeconds: 22, maybeDurationSeconds: Option.some(30) })),
      lightChangesPace(),
      model((player) => {
        expect(session(player).seek).toEqual(Seek.Settled({}));
        expect(session(player).positionSeconds).toBe(22);
        expect(playback(player)).toEqual(Playback.Sounding());
      }),
    ));

  test("seeking while paused stays paused", () => {
    const paused = after(sounding, Message.ClickedPause());
    const stepped = Player.update(
      paused,
      Message.GotSeekSliderMessage({
        message: Slider.Message.PressedKeyboardNavigation({ direction: "Max", value: 12 }),
      }),
    );
    expect(playback(stepped.model)).toEqual(Playback.Paused());
    expect(asked(stepped)).toEqual([["SeekPlayback", { order: 3, positionSeconds: 30 }]]);
  });

  test("a seek made before the start was answered shows the start as slow: its timer was for the order before", () => {
    const early = after(acknowledged, said(1, "Waiting", { maybeDurationSeconds: Option.some(30) }));
    const stepped = Player.update(
      early,
      Message.GotSeekSliderMessage({
        message: Slider.Message.PressedKeyboardNavigation({ direction: "StepIncrement", value: 0 }),
      }),
    );
    expect(playback(stepped.model)).toEqual(Playback.Starting());
    // The first order's timer goes off for an order that is no longer the latest.
    expect(
      Player.update(stepped.model, Message.CompletedWaitBeforeShowingActivity({ order: 1 })).model,
    ).toBe(stepped.model);
  });

  test("a key on the slider asks the engine at once", () => {
    const stepped = Player.update(
      sounding,
      Message.GotSeekSliderMessage({
        message: Slider.Message.PressedKeyboardNavigation({ direction: "StepIncrement", value: 12 }),
      }),
    );
    expect(session(stepped.model).seek).toEqual(Seek.Seeking({ targetSeconds: 13 }));
    expect(asked(stepped)).toEqual([["SeekPlayback", { order: 2, positionSeconds: 13 }]]);
  });

  test("the system's own bar moved asks the engine at once, as a key on the player's does", () => {
    const moved = Player.update(sounding, Message.MovedMediaPosition({ positionSeconds: 21.5 }));
    expect(session(moved.model).seek).toEqual(Seek.Seeking({ targetSeconds: 21.5 }));
    expect(asked(moved)).toEqual([["SeekPlayback", { order: 2, positionSeconds: 21.5 }]]);
  });

  test("the system's bar moved past either end of the audio asks for that end", () => {
    const past = Player.update(sounding, Message.MovedMediaPosition({ positionSeconds: 45 }));
    expect(asked(past)).toEqual([["SeekPlayback", { order: 2, positionSeconds: 30 }]]);

    const before = Player.update(sounding, Message.MovedMediaPosition({ positionSeconds: -3 }));
    expect(asked(before)).toEqual([["SeekPlayback", { order: 2, positionSeconds: 0 }]]);
  });

  test("the system's bar moved before the engine has read a length asks nothing", () => {
    const moved = Player.update(acknowledged, Message.MovedMediaPosition({ positionSeconds: 5 }));
    expect(moved.model).toBe(acknowledged);
    expect(asked(moved)).toEqual([]);
  });

  // The bar is sent to where the engine says the sound is, and while it follows the sound the
  // engine is asked for that place several times a second.
  const at = (positionSeconds: number) => ({
    positionSeconds,
    maybeDurationSeconds: Option.some(30),
    bufferedSeconds: 20,
  });

  test("each place the engine says is taken to the fraction, whenever it is said", () => {
    const first = after(sounding, said(1, "Sounding", at(12.31)));
    expect(session(first).positionSeconds).toBe(12.31);
    expect(session(after(first, said(1, "Sounding", at(12.56)))).positionSeconds).toBe(12.56);
    // Said again with nothing changed, it changes nothing.
    expect(after(first, said(1, "Sounding", at(12.31)))).toBe(first);
  });

  test("the bar follows the sound while there is sound and it stands where the engine is", () => {
    expect(Player.followsSound(sounding)).toBe(true);
    expect(Player.followsSound(after(sounding, said(1, "Sounding", at(13.1))))).toBe(true);
    // A wish for sound is not sound.
    expect(Player.followsSound(acknowledged)).toBe(false);
    // Sound that ran out of data, or was paused, is not followed until it sounds again.
    const stalled = after(sounding, said(1, "Waiting", at(13.6)));
    expect(Player.followsSound(stalled)).toBe(false);
    expect(Player.followsSound(after(stalled, said(1, "Sounding", at(13.6))))).toBe(true);
    expect(Player.followsSound(after(sounding, Message.ClickedPause()))).toBe(false);
  });

  test("a bar that stands where the listener wants to be does not follow the sound", () => {
    expect(Player.followsSound(after(dragging, draggedTo(25)))).toBe(false);
    const key = Message.GotSeekSliderMessage({
      message: Slider.Message.PressedKeyboardNavigation({ direction: "StepIncrement", value: 13 }),
    });
    const asked = after(sounding, key);
    expect(Player.followsSound(asked)).toBe(false);
    // The engine says it is there: the bar is the sound's again, from that place.
    const jumped = after(asked, said(2, "Sounding", at(13.02)));
    expect(session(jumped).seek).toEqual(Seek.Settled({}));
    expect(session(jumped).positionSeconds).toBe(13.02);
    expect(Player.followsSound(jumped)).toBe(true);
  });

  test("a drag given up with Escape asks nothing and leaves the position where the engine has it", () => {
    const cancelled = Player.update(
      after(dragging, draggedTo(25)),
      Message.GotSeekSliderMessage({ message: Slider.Message.CancelledDrag() }),
    );
    expect(session(cancelled.model).seek).toEqual(Seek.Settled({}));
    expect(asked(cancelled)).toEqual([]);
    expect(Player.shownPositionSeconds(session(cancelled.model))).toBe(12);
  });
});

describe("a source that cannot be loaded", () => {
  const recovering = Player.update(sounding, said(1, "Failed", { positionSeconds: 12 }));
  const refreshed = { ...fullTrack, previewUrl: "https://audio.test/tr-1-fresh.mp3" };

  test("the catalog is asked for the track again, once, and the fresh source is tried from where it stopped", () =>
    story(
      Player.update,
      given(sounding),
      message(said(1, "Failed", { positionSeconds: 12 })),
      model((player) => {
        expect(playback(player)).toEqual(Playback.Recovering());
        expect(session(player).current.id).toBe(track.id);
      }),
      Command.expectExact(
        Player.RefreshSource({ order: 1, trackId: track.id }),
        Player.ChangeIslandLightPace({ pace: 0 }),
      ),
      lightChangesPace(),
      Command.resolve(
        Player.RefreshSource,
        Message.SucceededRefreshSource({ order: 1, track: refreshed }),
      ),
      model((player) => {
        expect(playback(player)).toEqual(Playback.Starting());
        expect(session(player).sourceRefresh).toBe("Tried");
        expect(Player.playableSource(session(player).current)).toEqual(
          Option.some("https://audio.test/tr-1-fresh.mp3"),
        );
      }),
      Command.expectHas(
        Player.StartPlayback({
          order: 2,
          source: "https://audio.test/tr-1-fresh.mp3",
          positionSeconds: 12,
        }),
      ),
      Command.resolveAll(
        [Player.StartPlayback, Message.CompletedStartPlayback({ order: 2, outcome: "Sounding" })],
        [Player.WaitBeforeShowingActivity, Message.CompletedWaitBeforeShowingActivity({ order: 2 })],
        [Player.PublishNowPlaying, Message.CompletedPublishNowPlaying()],
      ),
      message(said(2, "Sounding", { positionSeconds: 12 })),
      lightChangesPace(),
      model((player) => {
        expect(playback(player)).toEqual(Playback.Sounding());
        // A source that sounds is a good one: a later failure may ask the catalog again.
        expect(session(player).sourceRefresh).toBe("Untried");
      }),
    ));

  test("a fresh source that fails too is a failure, stated, and the queue stays where it is", () => {
    const retried = after(
      recovering.model,
      Message.SucceededRefreshSource({ order: 1, track: refreshed }),
    );
    const failed = Player.update(retried, said(2, "Failed"));

    expect(playback(failed.model)).toEqual(Playback.Failed());
    expect(asked(failed)).toEqual([]);
    // Not skipped past: the track that failed is still the current one, with the next still waiting.
    expect(session(failed.model).current.id).toBe(track.id);
    expect(session(failed.model).later.map((queued) => queued.id)).toEqual([
      explicitTrack.id,
      thirdTrack.id,
    ]);
    expect(Player.currentTrackStatus(failed.model)).toBe("Failed");
  });

  test("a catalog that cannot answer, or answers with nothing to play, is a failure", () => {
    expect(
      playback(after(recovering.model, Message.FailedRefreshSource({ order: 1 }))),
    ).toEqual(Playback.Failed());
    expect(
      playback(
        after(
          recovering.model,
          Message.SucceededRefreshSource({ order: 1, track: { ...fullTrack, previewUrl: null } }),
        ),
      ),
    ).toEqual(Playback.Failed());
  });

  test("the catalog's answer is dropped when the listener has moved on", () => {
    const movedOn = after(recovering.model, Message.ClickedNext());
    const late = Player.update(
      movedOn,
      Message.SucceededRefreshSource({ order: 1, track: refreshed }),
    );
    expect(late.model).toBe(movedOn);
    expect(asked(late)).toEqual([]);
  });

  test("while the catalog is asked, what the engine says of the dead source changes nothing", () => {
    expect(Player.update(recovering.model, said(1, "Paused")).model).toBe(recovering.model);
    expect(Player.update(recovering.model, said(1, "Failed")).model).toBe(recovering.model);
  });

  test("Try again starts the track over, with the catalog still to ask", () => {
    const failed = after(recovering.model, Message.FailedRefreshSource({ order: 1 }));
    const again = Player.update(failed, Message.ClickedTryAgain());

    expect(playback(again.model)).toEqual(Playback.Acknowledged());
    expect(session(again.model).sourceRefresh).toBe("Untried");
    expect(asked(again)[0]).toEqual([
      "StartPlayback",
      { order: 2, source: "https://audio.test/tr-1.mp3", positionSeconds: 0 },
    ]);
  });
});

describe("what must not strand the player while a source is replaced", () => {
  const recovering = Player.update(sounding, said(1, "Failed", { positionSeconds: 12 })).model;
  const refreshed = { ...fullTrack, previewUrl: "https://audio.test/tr-1-fresh.mp3" };
  const seekByKey = Message.GotSeekSliderMessage({
    message: Slider.Message.PressedKeyboardNavigation({ direction: "StepIncrement", value: 12 }),
  });

  test("moving the progress bar while the catalog is asked gives the engine no order", () => {
    const moved = Player.update(recovering, seekByKey);

    // No order: the catalog's answer was made for the latest one, and still has to count.
    expect(moved.model.lastOrder).toBe(recovering.lastOrder);
    expect(asked(moved)).toEqual([]);
    expect(playback(moved.model)).toEqual(Playback.Recovering());
    // The wish is kept as the place to start from.
    expect(session(moved.model).positionSeconds).toBe(13);
    expect(session(moved.model).seek).toEqual(Seek.Settled({}));
  });

  test("the catalog's answer still counts after it, and the fresh source starts from where the bar was put", () => {
    const moved = Player.update(recovering, seekByKey).model;
    const answered = Player.update(
      moved,
      Message.SucceededRefreshSource({ order: 1, track: refreshed }),
    );

    expect(playback(answered.model)).toEqual(Playback.Starting());
    expect(asked(answered)[0]).toEqual([
      "StartPlayback",
      { order: 2, source: "https://audio.test/tr-1-fresh.mp3", positionSeconds: 13 },
    ]);
  });

  test("Try again on a track the catalog answered without a source asks the catalog again", () => {
    // The catalog answered with nothing to play, and that answer is the track as it is held now.
    const empty = after(
      recovering,
      Message.SucceededRefreshSource({ order: 1, track: { ...fullTrack, previewUrl: null } }),
    );
    expect(playback(empty)).toEqual(Playback.Failed());

    const again = Player.update(empty, Message.ClickedTryAgain());
    // Not failed on the spot with nobody asked: the catalog may have a source by now.
    expect(playback(again.model)).toEqual(Playback.Recovering());
    expect(asked(again)).toEqual([["RefreshSource", { order: 2, trackId: track.id }]]);

    // With a source, it starts; without one again, it is a failure, said once more.
    const started = Player.update(
      again.model,
      Message.SucceededRefreshSource({ order: 2, track: refreshed }),
    );
    expect(playback(started.model)).toEqual(Playback.Starting());
    const stillEmpty = Player.update(
      again.model,
      Message.SucceededRefreshSource({ order: 2, track: { ...fullTrack, previewUrl: null } }),
    );
    expect(playback(stillEmpty.model)).toEqual(Playback.Failed());
    expect(asked(stillEmpty)).toEqual([]);
  });
});

describe("the queue", () => {
  test("choosing a later song starts it once and keeps its place for Previous and Next", () => {
    const open = after(sounding, Message.ClickedQueue());
    const jump = Player.update(open, Message.ClickedQueueItem({ index: 1, trackId: thirdTrack.id }));
    expect(asked(jump)[0]).toEqual(["StartPlayback", {
      order: 2, source: thirdTrack.previewUrl, positionSeconds: 0,
    }]);
    expect(session(jump.model)).toMatchObject({
      earlier: [track, explicitTrack], current: thirdTrack, later: [], pane: "Queue",
    });
    expect(session(after(jump.model, Message.ClickedPrevious())).current.id).toBe(explicitTrack.id);
  });

  test("a song of the queue carried to another place: the order changes, and nothing sounds differently", () => {
    const drag = (dragMessage: DragAndDrop.Message) =>
      Message.GotQueueDragMessage({ message: dragMessage });
    const put = (index: number) =>
      Option.some({ containerId: Player.QUEUE_CONTAINER_ID, index });
    const open = after(sounding, Message.ClickedQueue());
    expect(session(open).later).toEqual([explicitTrack, thirdTrack]);

    // Taken up by its handle and carried over the row above: it is put before that row.
    const carriedUp = after(
      open,
      drag(DragAndDrop.Message.PressedDraggable({
        itemId: `${thirdTrack.id}/0`, containerId: Player.QUEUE_CONTAINER_ID, index: 1, screenX: 0, screenY: 100,
      })),
      drag(DragAndDrop.Message.MovedPointer({
        screenX: 0, screenY: 40, clientX: 0, clientY: 40, maybeDropTarget: put(0),
      })),
    );
    const droppedUp = Player.update(carriedUp, drag(DragAndDrop.Message.ReleasedPointer()));
    expect(asked(droppedUp)).toEqual([]);
    expect(session(droppedUp.model)).toEqual({ ...session(open), later: [thirdTrack, explicitTrack] });

    // Carried down past the last row: the place is counted among all the rows, itself among them.
    const carriedDown = after(
      droppedUp.model,
      drag(DragAndDrop.Message.PressedDraggable({
        itemId: `${thirdTrack.id}/0`, containerId: Player.QUEUE_CONTAINER_ID, index: 0, screenX: 0, screenY: 40,
      })),
      drag(DragAndDrop.Message.MovedPointer({
        screenX: 0, screenY: 160, clientX: 0, clientY: 160, maybeDropTarget: put(2),
      })),
      drag(DragAndDrop.Message.ReleasedPointer()),
    );
    expect(session(carriedDown).later).toEqual([explicitTrack, thirdTrack]);

    // Let go where there is nowhere to put it: the queue is as it was.
    const letGo = after(
      carriedDown,
      drag(DragAndDrop.Message.PressedDraggable({
        itemId: `${explicitTrack.id}/0`, containerId: Player.QUEUE_CONTAINER_ID, index: 0, screenX: 0, screenY: 40,
      })),
      drag(DragAndDrop.Message.MovedPointer({
        screenX: 0, screenY: 400, clientX: 0, clientY: 400, maybeDropTarget: Option.none(),
      })),
      drag(DragAndDrop.Message.ReleasedPointer()),
    );
    expect(session(letGo).later).toEqual([explicitTrack, thirdTrack]);
    expect(session(after(letGo, Message.ClickedNext())).current.id).toBe(explicitTrack.id);
  });

  test("a song of the queue moved with the keys: its place is counted among the others", () => {
    const drag = (dragMessage: DragAndDrop.Message) =>
      Message.GotQueueDragMessage({ message: dragMessage });
    const open = after(sounding, Message.ClickedQueue());
    const moved = after(
      open,
      drag(DragAndDrop.Message.ActivatedKeyboardDrag({
        itemId: `${explicitTrack.id}/0`, containerId: Player.QUEUE_CONTAINER_ID, index: 0,
      })),
      drag(DragAndDrop.Message.CompletedResolveKeyboardMove({
        targetContainerId: Player.QUEUE_CONTAINER_ID, targetIndex: 1,
      })),
      drag(DragAndDrop.Message.ConfirmedKeyboardDrop()),
    );
    expect(session(moved).later).toEqual([thirdTrack, explicitTrack]);
  });

  test("at the end of a track the next one starts by itself, from acknowledged", () => {
    const followed = Player.update(soundingMiddle, said(1, "Ended", { positionSeconds: 30 }));

    expect(session(followed.model).current.id).toBe(thirdTrack.id);
    expect(session(followed.model).earlier.map((queued) => queued.id)).toEqual([
      track.id,
      explicitTrack.id,
    ]);
    expect(session(followed.model).cue).toBe("Followed");
    expect(playback(followed.model)).toEqual(Playback.Acknowledged());
    expect(session(followed.model).positionSeconds).toBe(0);
    expect(session(followed.model).maybeDurationSeconds).toEqual(Option.none());
    expect(asked(followed)[0]).toEqual([
      "StartPlayback",
      { order: 2, source: "https://audio.test/tr-3.mp3", positionSeconds: 0 },
    ]);
    // The engine says the old track ended once more: it is no longer the one asked about.
    expect(Player.update(followed.model, said(1, "Ended")).model).toBe(followed.model);
  });

  test("at the end of the queue it stops on the last track, rewound, ready to play again", () => {
    const last = after(tapped(thirdTrack.id).model, said(1, "Sounding", { positionSeconds: 29 }));
    const stopped = Player.update(last, said(1, "Ended", { positionSeconds: 30 }));

    expect(session(stopped.model).current.id).toBe(thirdTrack.id);
    expect(playback(stopped.model)).toEqual(Playback.Paused());
    expect(session(stopped.model).positionSeconds).toBe(0);
    expect(asked(stopped)).toEqual([["SeekPlayback", { order: 2, positionSeconds: 0 }]]);

    const again = Player.update(stopped.model, Message.ClickedPlay());
    expect(asked(again)[0]).toEqual(["ResumePlayback", { order: 3 }]);
  });

  test("Next goes to the next track, and does nothing after the last", () => {
    const next = Player.update(soundingMiddle, Message.ClickedNext());
    expect(session(next.model).current.id).toBe(thirdTrack.id);
    expect(session(next.model).cue).toBe("Chosen");
    expect(playback(next.model)).toEqual(Playback.Acknowledged());

    const atEnd = Player.update(next.model, Message.ClickedNext());
    expect(atEnd.model).toBe(next.model);
    expect(asked(atEnd)).toEqual([]);
  });

  test("Previous, in the first seconds, goes to the track before", () => {
    const early = after(
      soundingMiddle,
      said(1, "Sounding", { positionSeconds: 3, maybeDurationSeconds: Option.some(30) }),
    );
    const previous = Player.update(early, Message.ClickedPrevious());

    expect(Player.RESTART_AFTER_SECONDS).toBe(3);
    expect(session(previous.model).current.id).toBe(track.id);
    expect(session(previous.model).later.map((queued) => queued.id)).toEqual([
      explicitTrack.id,
      thirdTrack.id,
    ]);
    expect(playback(previous.model)).toEqual(Playback.Acknowledged());
  });

  test("Previous, further in, goes back to the start of the same track", () => {
    const further = after(
      soundingMiddle,
      said(1, "Sounding", { positionSeconds: 4, maybeDurationSeconds: Option.some(30) }),
    );
    const restarted = Player.update(further, Message.ClickedPrevious());

    expect(session(restarted.model).current.id).toBe(explicitTrack.id);
    expect(session(restarted.model).seek).toEqual(Seek.Seeking({ targetSeconds: 0 }));
    // A new order: sound is not claimed again until the engine says so in answer to it.
    expect(playback(restarted.model)).toEqual(Playback.Waiting());
    expect(playback(after(restarted.model, said(2, "Sounding")))).toEqual(Playback.Sounding());
    expect(asked(restarted)).toEqual([["SeekPlayback", { order: 2, positionSeconds: 0 }]]);
  });

  test("Previous on the first track goes back to its start", () => {
    const restarted = Player.update(sounding, Message.ClickedPrevious());
    expect(session(restarted.model).current.id).toBe(track.id);
    expect(asked(restarted)).toEqual([["SeekPlayback", { order: 2, positionSeconds: 0 }]]);
  });

  test("Previous on a first track that has not sounded yet has nowhere to go back to", () => {
    const unchanged = Player.update(acknowledged, Message.ClickedPrevious());
    expect(unchanged.model).toBe(acknowledged);
    expect(asked(unchanged)).toEqual([]);
  });

  test("Previous on a track the system stopped starts it again", () => {
    const stopped = after(acknowledged, said(1, "Paused"));
    const again = Player.update(stopped, Message.ClickedPrevious());
    expect(playback(again.model)).toEqual(Playback.Acknowledged());
    expect(asked(again)[0]?.[0]).toBe("StartPlayback");
  });
});

describe("the current track's own controls", () => {
  test("tapping its row, or its page's control, stops the sound and brings it back", () => {
    const paused = tapped(track.id, sounding);
    expect(playback(paused.model)).toEqual(Playback.Paused());
    expect(asked(paused)).toEqual([["PausePlayback", { order: 2 }]]);
    // The queue is the one it was played from, untouched.
    expect(session(paused.model).later).toEqual(session(sounding).later);

    const resumed = tapped(track.id, paused.model);
    expect(playback(resumed.model)).toEqual(Playback.Acknowledged());
    expect(asked(resumed)[0]).toEqual(["ResumePlayback", { order: 3 }]);
  });

  test("what a row shows of the player is read from the player, in plain words", () => {
    expect(Player.trackStatus(Player.init(), track.id)).toBe("Elsewhere");
    expect(Player.trackStatus(acknowledged, track.id)).toBe("Chosen");
    expect(Player.trackStatus(acknowledged, explicitTrack.id)).toBe("Elsewhere");
    expect(Player.trackStatus(sounding, track.id)).toBe("Sounding");
    expect(Player.trackStatus(after(sounding, Message.ClickedPause()), track.id)).toBe("Paused");
    expect(Player.trackStatus(after(sounding, said(1, "Waiting")), track.id)).toBe("Waiting");
  });

  test("the keys of a headset or a lock screen do what the island's controls do", () => {
    const paused = after(sounding, Message.ClickedPause());
    const pairs: ReadonlyArray<readonly [Player.Model, Player.Message, Player.Message]> = [
      [sounding, Message.PressedMediaKey({ key: "Pause" }), Message.ClickedPause()],
      [paused, Message.PressedMediaKey({ key: "Play" }), Message.ClickedPlay()],
      [soundingMiddle, Message.PressedMediaKey({ key: "Next" }), Message.ClickedNext()],
      [soundingMiddle, Message.PressedMediaKey({ key: "Previous" }), Message.ClickedPrevious()],
    ];

    pairs.forEach(([start, key, click]) => {
      const byKey = Player.update(start, key);
      const byClick = Player.update(start, click);
      expect(Player.maybeChosenTrackId(start, byKey.model)).toEqual(Option.none());
      const expectedSession = session(byClick.model);
      const changedTrack = session(start).current.id !== expectedSession.current.id;
      expect(session(byKey.model)).toEqual({
        ...expectedSession,
        cue: changedTrack ? "Remote" : expectedSession.cue,
      });
      expect(byKey.model).not.toBe(start);
      expect(asked(byKey)).toEqual(asked(byClick));
    });
  });

  test("before anything is played there is nothing to control", () => {
    const empty = Player.init();
    expect(Player.update(empty, Message.ClickedPlay()).model).toBe(empty);
    expect(Player.update(empty, said(0, "Idle")).model).toBe(empty);
  });
});
