import * as Option from "effect/Option";
import { describe, expect, test } from "vitest";
import * as Marquee from "../src/marquee/index.ts";
import * as Player from "../src/player/index.ts";
import { explicitTrack, track } from "./fixtures.ts";

const { Island, Message, Playback } = Player;

const titleSaid = (message: Marquee.Message): Player.Message =>
  Message.GotIslandMessage({ message: Island.Message.GotTitleMessage({ message }) });

const artistSaid = (message: Marquee.Message): Player.Message =>
  Message.GotIslandMessage({ message: Island.Message.GotArtistMessage({ message }) });

type Measure = Parameters<typeof Marquee.Message.Measured>[0];

const measuredTitle = (measure: Measure) => titleSaid(Marquee.Message.Measured(measure));
const measuredArtist = (measure: Measure) => artistSaid(Marquee.Message.Measured(measure));
const waitedTitle = (run: { run: number }) => titleSaid(Marquee.Message.CompletedWaitToTravel(run));
const waitedArtist = (run: { run: number }) =>
  artistSaid(Marquee.Message.CompletedWaitToTravel(run));
const travelledTitle = (run: { run: number }) => titleSaid(Marquee.Message.CompletedTravel(run));
const travelledArtist = (run: { run: number }) => artistSaid(Marquee.Message.CompletedTravel(run));

const names = (outcome: ReturnType<typeof Player.update>): ReadonlyArray<string> =>
  (outcome.commands ?? []).map((command) => command.name);

/** What was asked for, without how it is done: each Command's name and what it was given. */
const asked = (outcome: ReturnType<typeof Player.update>): ReadonlyArray<unknown> =>
  (outcome.commands ?? []).map((command) => ({ name: command.name, args: command.args }));

const after = (model: Player.Model, ...messages: ReadonlyArray<Player.Message>): Player.Model =>
  messages.reduce((held, message) => Player.update(held, message).model, model);

const report = (order: number, phase: "Sounding" | "Waiting" | "Paused") =>
  Message.UpdatedEngineStatus({
    report: {
      order,
      phase,
      positionSeconds: 0,
      maybeDurationSeconds: Option.none(),
      bufferedSeconds: 0,
      isSeeking: false,
    },
  });

/** The first of two tracks chosen from a list: asked for, nothing heard yet. */
const chosen: Player.Model = Player.choose(Player.init(), {
  trackId: track.id,
  list: [track, explicitTrack],
}).model;

const sounding: Player.Model = after(chosen, report(1, "Sounding"));

describe("the island's light follows the playback", () => {
  test("only the engine's word that there is sound sets it going", () => {
    expect(Island.lightAfter("Dark", Player.soundOf(Playback.Sounding()))).toBe("Travelling");
    expect(Island.lightAfter("Resting", Player.soundOf(Playback.Sounding()))).toBe("Travelling");
  });

  test("a tap not yet answered changes nothing, however long the start takes", () => {
    (["Dark", "Travelling", "Resting"] as const).forEach((light) => {
      expect(Island.lightAfter(light, Player.soundOf(Playback.Acknowledged()))).toBe(light);
      expect(Island.lightAfter(light, Player.soundOf(Playback.Starting()))).toBe(light);
    });
  });

  test("anything else puts a light that has travelled to rest, and leaves a dark one dark", () => {
    const silences = [
      Playback.Paused(),
      Playback.Waiting(),
      Playback.Recovering(),
      Playback.Failed(),
      Playback.Stopped({ cause: "Interrupted" }),
    ];
    silences.forEach((playback) => {
      expect(Island.lightAfter("Travelling", Player.soundOf(playback))).toBe("Resting");
      expect(Island.lightAfter("Resting", Player.soundOf(playback))).toBe("Resting");
      expect(Island.lightAfter("Dark", Player.soundOf(playback))).toBe("Dark");
    });
  });

  test("in the Model: dark until there is sound, then travelling, resting when paused", () => {
    expect(Player.init().island.light).toBe("Dark");
    expect(chosen.island.light).toBe("Dark");
    expect(sounding.island.light).toBe("Travelling");
    expect(after(sounding, Message.ClickedPause()).island.light).toBe("Resting");
    expect(after(sounding, Message.ClickedPause(), Message.ClickedPlay()).island.light).toBe(
      "Resting",
    );
  });

  test("going on to another track does not halt it", () => {
    const next = after(sounding, Message.ClickedNext());
    expect(Option.map(next.maybeSession, (session) => session.playback._tag)).toEqual(
      Option.some("Acknowledged"),
    );
    expect(next.island.light).toBe("Travelling");
    // Nor does a start slow enough to be shown.
    const slow = after(next, Message.CompletedWaitBeforeShowingActivity({ order: next.lastOrder }));
    expect(slow.island.light).toBe("Travelling");
  });

  test("sound that ran out of data puts it to rest", () => {
    expect(after(sounding, report(1, "Waiting")).island.light).toBe("Resting");
  });

  /** The paces the light is told to take, in the order it is told. */
  const paces = (outcome: ReturnType<typeof Player.update>): ReadonlyArray<unknown> =>
    (outcome.commands ?? [])
      .filter((command) => command.name === Player.Island.ChangeLightPace({ pace: 0 }).name)
      .map((command) => command.args);

  test("the light is told its pace when the Model's word on it changes: full to travel, none to rest", () => {
    expect(paces(Player.update(chosen, report(1, "Sounding")))).toEqual([{ pace: 1 }]);
    expect(paces(Player.update(sounding, Message.ClickedPause()))).toEqual([{ pace: 0 }]);
    expect(paces(Player.update(sounding, report(1, "Waiting")))).toEqual([{ pace: 0 }]);
    const resumed = after(sounding, Message.ClickedPause(), Message.ClickedPlay());
    expect(paces(Player.update(resumed, report(3, "Sounding")))).toEqual([{ pace: 1 }]);
  });

  test("and is told nothing while that word stands", () => {
    // A tap not yet answered, a report that says what was already known, another track.
    expect(paces(Player.choose(Player.init(), { trackId: track.id, list: [track] }))).toEqual([]);
    expect(paces(Player.update(sounding, report(1, "Sounding")))).toEqual([]);
    expect(paces(Player.update(sounding, Message.ClickedNext()))).toEqual([]);
    const resting = after(sounding, Message.ClickedPause());
    expect(paces(Player.update(resting, Message.ClickedPlay()))).toEqual([]);
  });

  test("a change of pace that is done changes nothing", () => {
    const done = Player.update(
      sounding,
      Message.GotIslandMessage({ message: Island.Message.CompletedChangeLightPace() }),
    );
    expect(done.model).toBe(sounding);
    expect(done.commands ?? []).toEqual([]);
  });
});

describe("the island's title", () => {
  const fits = measuredTitle({ placePixels: 180, maybeTravelPixels: Option.none() });
  const tooLong = measuredTitle({ placePixels: 180, maybeTravelPixels: Option.some(270) });

  test("one that fits stands, and asks for no wait", () => {
    const measured = Player.update(sounding, fits);
    expect(measured.model.island.title.phase).toBe("Standing");
    expect(names(measured)).toEqual([]);
  });

  test("one too long waits three and a half seconds before its first pass", () => {
    const measured = Player.update(sounding, tooLong);
    expect(measured.model.island.title.run).toBe(sounding.island.title.run + 1);
    expect(asked(measured)).toEqual([
      { name: "WaitToTravel", args: { run: measured.model.island.title.run, milliseconds: 3500 } },
    ]);
  });

  test("a pass takes the way measured at 45 pixels a second, and five seconds of rest follow it", () => {
    const measured = Player.update(sounding, tooLong).model;
    const { run } = measured.island.title;

    const travelling = Player.update(measured, waitedTitle({ run }));
    expect(travelling.model.island.title.phase).toBe("Travelling");
    expect(asked(travelling)).toEqual([{ name: "Travel", args: { run, milliseconds: 6000 } }]);

    const resting = Player.update(travelling.model, travelledTitle({ run }));
    expect(resting.model.island.title.phase).toBe("Standing");
    expect(asked(resting)).toEqual([{ name: "WaitToTravel", args: { run, milliseconds: 5000 } }]);
  });

  test("measured the same again, nothing changes: the wait under way goes on", () => {
    const measured = Player.update(sounding, tooLong).model;
    const again = Player.update(measured, tooLong);
    expect(again.model).toBe(measured);
    expect(names(again)).toEqual([]);
  });

  test("its place changing width alone disturbs nothing: the pass under way goes on", () => {
    const measured = Player.update(sounding, tooLong).model;
    const travelling = after(measured, waitedTitle({ run: measured.island.title.run }));
    // The island narrowed under it: the title is as long as it was.
    const narrower = Player.update(
      travelling,
      measuredTitle({ placePixels: 120, maybeTravelPixels: Option.some(270) }),
    );
    expect(narrower.model.island.title).toEqual({ ...travelling.island.title, placePixels: 120 });
    expect(names(narrower)).toEqual([]);

    // And the same while it waits: the wait is not started over.
    const waiting = Player.update(
      measured,
      measuredTitle({ placePixels: 120, maybeTravelPixels: Option.some(270) }),
    );
    expect(waiting.model.island.title).toEqual({ ...measured.island.title, placePixels: 120 });
    expect(names(waiting)).toEqual([]);
  });

  test("a title that comes to fit in the middle of a pass ends that pass, and then stands for good", () => {
    const measured = Player.update(sounding, tooLong).model;
    const { run } = measured.island.title;
    const travelling = after(measured, waitedTitle({ run }));

    // The island widened, and the title fits now.
    const wider = Player.update(
      travelling,
      measuredTitle({ placePixels: 300, maybeTravelPixels: Option.none() }),
    );
    // It is not stopped where it is: the pass keeps its way to go.
    expect(wider.model.island.title).toEqual({
      run,
      placePixels: 300,
      maybeTravelPixels: Option.some(270),
      phase: "Finishing",
    });
    expect(names(wider)).toEqual([]);

    const over = Player.update(wider.model, travelledTitle({ run }));
    expect(over.model.island.title).toEqual({
      run: run + 1,
      placePixels: 300,
      maybeTravelPixels: Option.none(),
      phase: "Standing",
    });
    // No wait: there is no next pass.
    expect(names(over)).toEqual([]);
  });

  test("a title that stops fitting again before its last pass is over goes on as before", () => {
    const measured = Player.update(sounding, tooLong).model;
    const { run } = measured.island.title;
    const finishing = after(
      measured,
      waitedTitle({ run }),
      measuredTitle({ placePixels: 300, maybeTravelPixels: Option.none() }),
    );
    const narrowAgain = after(finishing, tooLong);
    expect(narrowAgain.island.title.phase).toBe("Travelling");

    const over = Player.update(narrowAgain, travelledTitle({ run }));
    expect(over.model.island.title.phase).toBe("Standing");
    expect(names(over)).toEqual(["WaitToTravel"]);
  });

  test("a title that fits while it stands simply stands, and what it waited for is dropped", () => {
    const measured = Player.update(sounding, tooLong).model;
    const fitting = Player.update(
      measured,
      measuredTitle({ placePixels: 300, maybeTravelPixels: Option.none() }),
    );
    expect(fitting.model.island.title.phase).toBe("Standing");
    expect(fitting.model.island.title.run).toBe(measured.island.title.run + 1);
    expect(names(fitting)).toEqual([]);
  });

  test("a wait or a pass that ends for an earlier run is dropped", () => {
    const measured = Player.update(sounding, tooLong).model;
    const stale = measured.island.title.run - 1;
    expect(Player.update(measured, waitedTitle({ run: stale })).model).toBe(measured);
    expect(Player.update(measured, travelledTitle({ run: stale })).model).toBe(measured);
  });

  test("another track is another title: it stands, unmeasured, on a new run", () => {
    const measured = Player.update(sounding, tooLong).model;
    const travelling = after(measured, waitedTitle({ run: measured.island.title.run }));
    const next = after(travelling, Message.ClickedNext());
    expect(next.island.title).toEqual({
      run: travelling.island.title.run + 1,
      placePixels: 0,
      maybeTravelPixels: Option.none(),
      phase: "Standing",
    });
    // The pass that was under way for the title before ends for no one.
    const ended = Player.update(next, travelledTitle({ run: travelling.island.title.run }));
    expect(ended.model).toBe(next);
    expect(names(ended)).toEqual([]);
  });
});

describe("who the track is by, under the island's title", () => {
  const tooLong = measuredArtist({ placePixels: 180, maybeTravelPixels: Option.some(270) });

  test("a name too long for its place waits, travels once and waits again, as a title does", () => {
    const measured = Player.update(sounding, tooLong);
    const { run } = measured.model.island.artist;
    expect(run).toBe(sounding.island.artist.run + 1);
    expect(asked(measured)).toEqual([{ name: "WaitToTravel", args: { run, milliseconds: 3500 } }]);

    const travelling = Player.update(measured.model, waitedArtist({ run }));
    expect(travelling.model.island.artist.phase).toBe("Travelling");
    expect(asked(travelling)).toEqual([{ name: "Travel", args: { run, milliseconds: 6000 } }]);

    const resting = Player.update(travelling.model, travelledArtist({ run }));
    expect(resting.model.island.artist.phase).toBe("Standing");
    expect(asked(resting)).toEqual([{ name: "WaitToTravel", args: { run, milliseconds: 5000 } }]);
  });

  test("it is a line of its own: the title stands while it travels, and a title's wait is not taken for its own", () => {
    const measured = Player.update(sounding, tooLong).model;
    const { run } = measured.island.artist;
    expect(measured.island.title).toEqual(sounding.island.title);

    // The same number, for the other line: nothing of this one moves.
    const titles = Player.update(measured, waitedTitle({ run }));
    expect(titles.model.island.artist.phase).toBe("Standing");
    expect(names(titles)).toEqual([]);

    const travelling = after(measured, waitedArtist({ run }));
    expect(travelling.island.artist.phase).toBe("Travelling");
    expect(travelling.island.title.phase).toBe("Standing");
  });

  test("another track is other words: the line stands, unmeasured, on a new run", () => {
    const measured = Player.update(sounding, tooLong).model;
    const travelling = after(measured, waitedArtist({ run: measured.island.artist.run }));
    const next = after(travelling, Message.ClickedNext());
    expect(next.island.artist).toEqual({
      run: travelling.island.artist.run + 1,
      placePixels: 0,
      maybeTravelPixels: Option.none(),
      phase: "Standing",
    });
    // The pass that was under way for the name before ends for no one.
    const ended = Player.update(next, travelledArtist({ run: travelling.island.artist.run }));
    expect(ended.model).toBe(next);
    expect(names(ended)).toEqual([]);
  });
});
