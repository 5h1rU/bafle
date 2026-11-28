import { TrackId, type TrackSummary } from "@bafle/domain/Catalog/Track";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import { describe, expect, test } from "vitest";
import { update } from "../src/main.ts";
import { Message } from "../src/message.ts";
import { Awaiting, type Model, trackData } from "../src/model.ts";
import * as Player from "../src/player/index.ts";
import * as Rows from "../src/rows/index.ts";
import {
  after,
  awaitedId,
  changedUrl,
  choseFromRow,
  clickedLink,
  explicitTrack,
  onNew,
  pressedMore,
  reply,
  silentTrack,
  track,
  trackPath,
} from "./fixtures.ts";

/** What a result asks the runtime to do, by name. */
const names = (outcome: ReturnType<typeof update>): ReadonlyArray<string> =>
  (outcome.commands ?? []).map((command) => command.name);

const session = (player: Player.Model): Player.Session => Option.getOrThrow(player.maybeSession);

const ids = (tracks: ReadonlyArray<TrackSummary>): ReadonlyArray<string> =>
  tracks.map((queued) => queued.id);

describe("the player's queue", () => {
  /** A third track with something to play, so a queue has a middle. */
  const thirdTrack: TrackSummary = {
    ...track,
    id: silentTrack.id,
    title: silentTrack.title,
    previewUrl: "https://audio.test/tr-3.mp3",
  };
  /** A track from somewhere else: not in the list that became the queue. */
  const outsider: TrackSummary = { ...thirdTrack, id: TrackId.make("tr-9"), title: "Aerodynamic" };
  const list: ReadonlyArray<TrackSummary> = [track, explicitTrack, thirdTrack];

  /** The first of three tapped: the other two wait their turn, in the list's order. */
  const playing = Player.choose(Player.init(), { trackId: track.id, list }).model;

  test("next is right after the current track, and last is after all the rest", () => {
    const next = Player.enqueue(playing, { track: outsider, place: "Next" }).model;
    expect(ids(session(next).later)).toEqual([outsider.id, explicitTrack.id, thirdTrack.id]);

    const last = Player.enqueue(playing, { track: outsider, place: "Last" }).model;
    expect(ids(session(last).later)).toEqual([explicitTrack.id, thirdTrack.id, outsider.id]);
  });

  test("a track already waiting moves to where it was put: the queue holds it once", () => {
    const next = Player.enqueue(playing, { track: thirdTrack, place: "Next" }).model;
    expect(ids(session(next).later)).toEqual([thirdTrack.id, explicitTrack.id]);

    const last = Player.enqueue(playing, { track: explicitTrack, place: "Last" }).model;
    expect(ids(session(last).later)).toEqual([thirdTrack.id, explicitTrack.id]);
  });

  test("nothing sounds differently for it, and nothing is asked of the engine", () => {
    const queued = Player.enqueue(playing, { track: thirdTrack, place: "Next" });
    expect(queued.commands ?? []).toEqual([]);
    expect(session(queued.model).current.id).toBe(track.id);
    expect(session(queued.model).playback).toEqual(session(playing).playback);
    expect(queued.model.lastOrder).toBe(playing.lastOrder);
  });

  test("the current track, a track with nothing to play, and anything before a first track are not queued", () => {
    expect(Player.enqueue(playing, { track, place: "Next" }).model).toBe(playing);
    expect(Player.enqueue(playing, { track: silentTrack, place: "Last" }).model).toBe(playing);
    const idle = Player.init();
    expect(Player.enqueue(idle, { track: explicitTrack, place: "Next" }).model).toBe(idle);
  });

  test("what was put next is what Next goes to", () => {
    const queued = Player.enqueue(playing, { track: thirdTrack, place: "Next" }).model;
    const onward = Player.update(queued, Player.Message.ClickedNext()).model;
    expect(session(onward).current.id).toBe(thirdTrack.id);
    expect(ids(session(onward).later)).toEqual([explicitTrack.id]);
  });
});

describe("a row's menu", () => {
  /** New on screen, and its second track tapped: the first is behind it in the queue, nothing after. */
  const playing: Model = after(
    onNew,
    Message.ClickedPlayTrack({ trackId: explicitTrack.id, from: "New" }),
  );
  const row = { from: "New", trackId: track.id } as const;

  test("a menu that was never touched is closed, and is not kept", () => {
    expect(HashMap.size(onNew.rows.menus)).toBe(0);
    expect(Rows.menuOf(onNew.rows, row).isOpen).toBe(false);
    expect(Rows.menuOf(onNew.rows, row).id).toBe(Rows.rowMenuId(row));
  });

  test("pressing a row's last control opens that row's menu, and no other", () => {
    const opened = after(onNew, pressedMore("New", track.id));
    expect(Rows.menuOf(opened.rows, row).isOpen).toBe(true);
    expect(Rows.menuOf(opened.rows, { from: "New", trackId: explicitTrack.id }).isOpen).toBe(false);
    // The same track listed on another page has a menu of its own.
    expect(Rows.menuOf(opened.rows, { from: "Search", trackId: track.id }).isOpen).toBe(false);
  });

  test("Song details is followed as a link to the track's page is: held until it arrives", () => {
    const opened = after(onNew, pressedMore("New", track.id));
    const chosen = update(opened, choseFromRow("New", track.id, "OpenSong"));
    const byLink = update(onNew, clickedLink(trackPath(track.id)));

    // The menu stays open while the page is on its way: its item says so.
    expect(Rows.menuOf(chosen.model.rows, row).isOpen).toBe(true);
    // The page on screen stays, the URL stays, and the row's track is loading.
    expect(chosen.model.route).toEqual(byLink.model.route);
    expect(chosen.model.awaiting).toEqual(byLink.model.awaiting);
    expect(Awaiting.guards.Intention(chosen.model.awaiting)).toBe(true);
    expect(trackData(chosen.model, track.id)).toEqual(trackData(byLink.model, track.id));
    expect(names(chosen)).toContain("TrackDetail");
    expect(names(chosen)).not.toContain("NavigateInternal");
  });

  test("the menu goes with the page it was on when the page chosen takes the screen", () => {
    const opened = after(onNew, pressedMore("New", track.id));
    const chosen = after(opened, choseFromRow("New", track.id, "OpenSong"));
    const arrived = update(
      chosen,
      Message.GotCatalogMessage({ message: reply.track(awaitedId(chosen)) }),
    );

    expect(arrived.model.route._tag).toBe("Track");
    expect(HashMap.size(arrived.model.rows.menus)).toBe(0);
  });

  test("Back to the page before takes the menu with the page it was on", () => {
    // Home, then New, and a row's menu opened there: Back shows Home, which is loaded.
    const opened = after(onNew, pressedMore("New", track.id));
    const back = update(opened, changedUrl("/"));

    expect(back.model.route._tag).toBe("Home");
    expect(HashMap.size(back.model.rows.menus)).toBe(0);
    // Forward again finds New as any visit does: its menus closed.
    const forward = after(back.model, changedUrl("/new"));
    expect(forward.route._tag).toBe("New");
    expect(Rows.menuOf(forward.rows, row).isOpen).toBe(false);
  });

  test("a page that failed to open is asked for again by a second press of its item", () => {
    const opened = after(onNew, pressedMore("New", track.id));
    const chosen = after(opened, choseFromRow("New", track.id, "OpenSong"));
    const failed = after(
      chosen,
      Message.GotCatalogMessage({ message: reply.trackLost(awaitedId(chosen)) }),
    );
    // Still on the list, with the menu open on the item that failed.
    expect(failed.route._tag).toBe("New");
    expect(Rows.menuOf(failed.rows, row).isOpen).toBe(true);

    const again = update(failed, choseFromRow("New", track.id, "OpenSong"));
    expect(names(again)).toContain("TrackDetail");
    expect(Awaiting.guards.Intention(again.model.awaiting)).toBe(true);
  });

  test("Play next puts the row's track right after the current one, and the row shows it for a moment", () => {
    const queued = update(playing, choseFromRow("New", track.id, "PlayNext"));

    expect(ids(session(queued.model.player).later)).toEqual([track.id]);
    expect(session(queued.model.player).current.id).toBe(explicitTrack.id);
    expect(queued.model.rows.done).toEqual({
      turn: 1,
      maybeRow: Option.some({ from: "New", trackId: track.id, place: "Next" }),
    });
    expect(names(queued)).toContain("WaitToClearDone");
    // Queueing is no navigation: the page, the URL and what is awaited are as they were.
    expect(queued.model.route).toEqual(playing.route);
    expect(queued.model.awaiting).toEqual(playing.awaiting);
  });

  test("Add to queue puts it after all the rest", () => {
    const first = after(playing, choseFromRow("New", track.id, "PlayNext"));
    const again = update(first, choseFromRow("New", track.id, "AddToQueue"));
    expect(ids(session(again.model.player).later)).toEqual([track.id]);
    expect(again.model.rows.done).toEqual({
      turn: 2,
      maybeRow: Option.some({ from: "New", trackId: track.id, place: "Last" }),
    });
  });

  test("the moment ends for the row it began for, and a moment that ends for an earlier one clears nothing", () => {
    const first = after(playing, choseFromRow("New", track.id, "PlayNext"));
    const second = after(first, choseFromRow("New", track.id, "AddToQueue"));

    const stale = update(
      second,
      Message.GotRowsMessage({ message: Rows.Message.CompletedWaitToClearDone({ turn: 1 }) }),
    );
    expect(stale.model).toBe(second);

    const ended = update(
      second,
      Message.GotRowsMessage({ message: Rows.Message.CompletedWaitToClearDone({ turn: 2 }) }),
    );
    expect(ended.model.rows.done).toEqual({ turn: 2, maybeRow: Option.none() });
  });

  test("with nothing playing there is no queue to put a track in: nothing is queued, and nothing is shown", () => {
    const chosen = update(onNew, choseFromRow("New", track.id, "PlayNext"));
    expect(chosen.model.player).toBe(onNew.player);
    expect(chosen.model.rows.done).toEqual(onNew.rows.done);
    expect(names(chosen)).not.toContain("WaitToClearDone");
  });

  test("the track the player holds is not queued behind itself", () => {
    const chosen = update(playing, choseFromRow("New", explicitTrack.id, "PlayNext"));
    expect(chosen.model.player).toBe(playing.player);
    expect(chosen.model.rows.done).toEqual(playing.rows.done);
  });
});
