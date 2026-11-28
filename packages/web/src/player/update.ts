import type { TrackId, TrackSummary } from "@bafle/domain/Catalog/Track";
import { Menu, Slider } from "@foldkit/ui";
import * as Array from "effect/Array";
import * as Equal from "effect/Equal";
import { pipe } from "effect/Function";
import * as Match from "effect/Match";
import * as Number from "effect/Number";
import * as Option from "effect/Option";
import { Update } from "foldkit";
import { modifyFields } from "foldkit/struct";
import type { CatalogClient } from "../catalog.ts";
import type { AudioEngine, EngineReport } from "./audioEngine.ts";
import {
  PausePlayback,
  PublishNowPlaying,
  RefreshSource,
  ResumePlayback,
  SeekPlayback,
  ShowFaceFromTop,
  StartPlayback,
  WaitBeforeShowingActivity,
} from "./command.ts";
import * as Island from "./island/index.ts";
import * as Queue from "./queue/index.ts";
import { type MediaKey, Message, OutMessage } from "./message.ts";
import {
  type Cue,
  type Model,
  Playback,
  type QueuePlace,
  Seek,
  type Session,
  initialSeekSlider,
  isAwaitingFirstSound,
  isPlayable,
  isUnderWay,
  maybeCurrentTrackId,
  playableSource,
  queueFrom,
  soundOf,
  toQueued,
  wantsToSound,
} from "./model.ts";
import { MoreMenu, type PlayerAction } from "./moreMenu.ts";

type Services = AudioEngine | CatalogClient;
type UpdateReturn = Update.Return<Model, Message, Services>;
type Step = Update.Step<Model, Message, Services>;
type UpdateReturnWithOutMessage = Update.ReturnWithOutMessage<Model, Message, OutMessage, Services>;
type StepWithOutMessage = Update.StepWithOutMessage<Model, Message, OutMessage, Services>;

/** Past this many seconds, going to the previous track goes to the start of this one instead. */
export const RESTART_AFTER_SECONDS = 3;

// INIT

export const init = (): Model => ({
  lastOrder: 0,
  maybeSession: Option.none(),
  island: Island.init(),
  queue: Queue.init(),
});

// UPDATE

const unchanged: Step = (model) => ({ model });

const withSession = (model: Model, session: Session): Model =>
  modifyFields(model, { maybeSession: () => Option.some(session) });

/** Run a step on what is playing. With nothing played yet there is nothing to act on. */
const onSession =
  (act: (session: Session) => Step): Step =>
  (model) =>
    Option.match(model.maybeSession, {
      onNone: () => ({ model }),
      onSome: (session) => act(session)(model),
    });

/** A session the step left as it found it leaves the Model the very same, to be drawn the very same. */
const settle =
  (session: Session): Step =>
  (model) =>
    Option.exists(model.maybeSession, (held) => held === session)
      ? { model }
      : { model: withSession(model, session) };

/**
 * What the engine or a timer says of an order counts only while that order
 * is the latest: the listener has asked for something else since, and what
 * is said of the earlier wish is dropped.
 */
const forLatestOrder =
  (order: number, step: Step): Step =>
  (model) =>
    order === model.lastOrder ? step(model) : { model };

/**
 * Give the engine an order. It takes the next number, and from here on only
 * what the engine says in answer to that number counts.
 */
const giveOrder =
  (session: Session, toCommands: (order: number) => Update.Commands<Message, Services>): Step =>
  (model) => {
    const order = model.lastOrder + 1;
    return {
      model: modifyFields(model, {
        lastOrder: () => order,
        maybeSession: () => Option.some(session),
      }),
      commands: toCommands(order),
    };
  };

const withPlayback = (session: Session, playback: Playback): Session =>
  Equal.equals(session.playback, playback)
    ? session
    : modifyFields(session, { playback: () => playback });

const publishNowPlaying = (track: TrackSummary) =>
  PublishNowPlaying({
    title: track.title,
    artist: track.artist.name,
    album: track.album.title,
    maybeArtworkUrl: pipe(
      Option.fromNullishOr(track.album.cover),
      Option.map((cover) => cover.medium),
    ),
  });

/**
 * Give the engine the current track to sound from a position. Nothing is
 * claimed of the sound: the listener's wish is recorded, and the engine will
 * say when it sounds.
 */
const startCurrent = (session: Session, playback: Playback, positionSeconds: number): Step =>
  Option.match(playableSource(session.current), {
    // NOTE: the track as it is held has nothing to play. That happens when
    // the catalog, asked again after a failure, answered without a source:
    // the answer is kept, and a later "Try again" would otherwise find
    // nothing to start and fail on the spot, without asking anybody. So the
    // catalog is asked once more, as it is for a source that failed, and
    // only an answer that is empty again is the end.
    onNone: () =>
      session.sourceRefresh === "Untried"
        ? giveOrder(
            modifyFields(session, {
              playback: () => Playback.Recovering(),
              positionSeconds: () => positionSeconds,
              seek: () => Seek.Settled({}),
            }),
            (order) => [RefreshSource({ order, trackId: session.current.id })],
          )
        : settle(withPlayback(session, Playback.Failed())),
    onSome: (source) =>
      giveOrder(
        modifyFields(session, {
          playback: () => playback,
          positionSeconds: () => positionSeconds,
          maybeDurationSeconds: () => Option.none(),
          bufferedSeconds: () => positionSeconds,
          seek: () => Seek.Settled({}),
          seekSlider: () => initialSeekSlider,
        }),
        (order) => [
          StartPlayback({ order, source, positionSeconds }),
          WaitBeforeShowingActivity({ order }),
          publishNowPlaying(session.current),
        ],
      ),
  });

/** A track becomes the current one, from its beginning, with the catalog still to ask if its source fails. */
const startTrack = (session: Session, cue: Cue): Step =>
  startCurrent(
    modifyFields(session, { cue: () => cue, sourceRefresh: () => "Untried" }),
    Playback.Acknowledged(),
    0,
  );

const pause = (session: Session): Step =>
  giveOrder(withPlayback(session, Playback.Paused()), (order) => [PausePlayback({ order })]);

const resume = (session: Session): Step =>
  giveOrder(withPlayback(session, Playback.Acknowledged()), (order) => [
    ResumePlayback({ order }),
    WaitBeforeShowingActivity({ order }),
  ]);

/**
 * What a new order leaves of the state. Sound is not claimed across it: the
 * engine has said nothing since. A start not yet answered has lost the timer
 * that would have shown it was slow, so it shows that now.
 */
const acrossAnOrder = (playback: Playback): Playback =>
  Playback.matchOrElse(
    playback,
    {
      Sounding: () => Playback.Waiting(),
      Acknowledged: () => Playback.Starting(),
    },
    () => playback,
  );

/** The source is being replaced, or is past replacing: the engine holds nothing to move within. */
const hasNoLiveSource = Playback.isAnyOf(["Recovering", "Failed"]);

/**
 * Ask the engine for another position. The wish stands until the engine
 * says it is there.
 */
// NOTE: while the catalog is being asked for a fresh source there is nothing
// to ask the engine, and an order given now would take the next number: the
// catalog's answer, made for the number before, would then be dropped as
// stale and the player would wait for it for ever. So the position is only
// noted, and the fresh source starts from there.
const seekTo = (session: Session, targetSeconds: number): Step =>
  hasNoLiveSource(session.playback)
    ? settle(
        modifyFields(session, {
          positionSeconds: () => targetSeconds,
          seek: () => Seek.Settled({}),
        }),
      )
    : seekNow(session, targetSeconds);

const seekNow = (session: Session, targetSeconds: number): Step =>
  giveOrder(
    modifyFields(session, {
      seek: () => Seek.Seeking({ targetSeconds }),
      playback: acrossAnOrder,
    }),
    (order) => [SeekPlayback({ order, positionSeconds: targetSeconds })],
  );

/** The listener asks to hear the current track: what that takes depends on why it is silent. */
const play = (session: Session): Step =>
  Playback.matchOrElse<Step>(
    session.playback,
    {
      Paused: () => resume(session),
      Stopped: () => resume(session),
      Failed: () => startTrack(session, session.cue),
    },
    () => unchanged,
  );

const silence = (session: Session): Step =>
  wantsToSound(session.playback) ? pause(session) : unchanged;

/** The track after the current one becomes the current one. */
const advance = (
  session: Session,
  later: Array.NonEmptyReadonlyArray<TrackSummary>,
  cue: Cue,
): Step =>
  startTrack(
    modifyFields(session, {
      earlier: Array.append(session.current),
      current: () => Array.headNonEmpty(later),
      later: () => Array.tailNonEmpty(later),
    }),
    cue,
  );

const next = (session: Session, cue: Cue = "Chosen"): Step =>
  Array.match(session.later, {
    onEmpty: () => unchanged,
    onNonEmpty: (later) => advance(session, later, cue),
  });

const playFromQueue = (session: Session, index: number, trackId: TrackId): Step => {
  const current = session.later[index];
  if (current?.id !== trackId) {
    return unchanged;
  }
  return startTrack({
    ...session,
    earlier: [...session.earlier, session.current, ...session.later.slice(0, index)],
    current,
    later: session.later.slice(index + 1),
  }, "Chosen");
};

/**
 * A song of the queue put down in another place in it. `to` is its place
 * among the songs to come once it is there, counted without it.
 */
const moveInQueue = (session: Session, from: number, to: number): Step => {
  const track = session.later[from];
  if (track === undefined || from === to) {
    return unchanged;
  }
  const later = [...session.later];
  later.splice(from, 1);
  later.splice(Math.max(0, Math.min(to, later.length)), 0, track);
  return settle(modifyFields(session, { later: () => later }));
};

/**
 * Back to the start of the current track. One that is loaded goes there
 * where it stands; one that fell silent without the listener's wish is
 * started again; one still on its way to its first sound is at its start
 * already.
 */
const restart = (session: Session): Step => {
  if (Playback.isAnyOf(["Stopped", "Recovering", "Failed"])(session.playback)) {
    return startTrack(session, session.cue);
  }
  return Option.isSome(session.maybeDurationSeconds) ? seekTo(session, 0) : unchanged;
};

const previous = (session: Session, cue: Cue = "Chosen"): Step =>
  Array.match(session.earlier, {
    onEmpty: () => restart(session),
    onNonEmpty: (earlier) =>
      session.positionSeconds > RESTART_AFTER_SECONDS
        ? restart(session)
        : startTrack(
            modifyFields(session, {
              earlier: () => Array.initNonEmpty(earlier),
              current: () => Array.lastNonEmpty(earlier),
              later: Array.prepend(session.current),
            }),
            cue,
          ),
  });

/**
 * The track ended. The next one starts by itself; after the last, the player
 * stops on it, rewound, with nothing more to ask of the listener than play.
 */
const ended = (session: Session): Step =>
  Array.match(session.later, {
    onEmpty: () =>
      giveOrder(
        modifyFields(session, {
          playback: () => Playback.Paused(),
          positionSeconds: () => 0,
          seek: () => Seek.Settled({}),
        }),
        (order) => [SeekPlayback({ order, positionSeconds: 0 })],
      ),
    onNonEmpty: (later) => advance(session, later, "Followed"),
  });

/**
 * The engine could not load the source. Any catalog's source can go stale,
 * so the catalog is asked for the track again, once. A source it gave on
 * being asked again that fails too is a failure, and it is stated: the queue
 * does not move on by itself past a track that could not be played.
 */
const sourceFailed =
  (session: Session): Step =>
  (model) =>
    session.sourceRefresh === "Untried"
      ? {
          model: withSession(model, withPlayback(session, Playback.Recovering())),
          commands: [RefreshSource({ order: model.lastOrder, trackId: session.current.id })],
        }
      : { model: withSession(model, withPlayback(session, Playback.Failed())) };

const hasArrived = (session: Session, report: EngineReport): boolean =>
  Seek.guards.Seeking(session.seek) && !report.isSeeking;

const isSameTiming = (session: Session, report: EngineReport): boolean =>
  session.positionSeconds === report.positionSeconds &&
  session.bufferedSeconds === report.bufferedSeconds &&
  Equal.equals(session.maybeDurationSeconds, report.maybeDurationSeconds) &&
  !hasArrived(session, report);

/** Take the engine's numbers. A session they do not change is returned as it was. */
const withTiming = (session: Session, report: EngineReport): Session =>
  isSameTiming(session, report)
    ? session
    : modifyFields(session, {
        positionSeconds: () => report.positionSeconds,
        maybeDurationSeconds: () => report.maybeDurationSeconds,
        bufferedSeconds: () => report.bufferedSeconds,
        seek: (seek) => (hasArrived(session, report) ? Seek.Settled({}) : seek),
        seekSlider: Option.match(report.maybeDurationSeconds, {
          onNone: () => (slider: Slider.Model) => slider,
          onSome: (durationSeconds) => Slider.reflectRange({ min: 0, max: durationSeconds }),
        }),
      });

/** A source that sounds is a good one: should it fail later, the catalog can be asked again. */
const withSounding = (session: Session): Session =>
  session.sourceRefresh === "Untried" && Playback.guards.Sounding(session.playback)
    ? session
    : modifyFields(session, {
        playback: () => Playback.Sounding(),
        sourceRefresh: () => "Untried",
      });

/**
 * The engine's word while the listener wants sound. Silence nobody asked for
 * is the system's doing: a refusal where sound never started, an
 * interruption where it had. Running out of data is a stall only once it has
 * sounded; before that it is the start still under way.
 */
const heedWishingToSound = (
  timed: Session,
  report: EngineReport,
  silenced: "Refused" | "Interrupted",
): Step =>
  Match.value(report.phase).pipe(
    Match.withReturnType<Step>(),
    Match.when("Sounding", () => settle(withSounding(timed))),
    Match.when("Waiting", () =>
      settle(silenced === "Interrupted" ? withPlayback(timed, Playback.Waiting()) : timed),
    ),
    Match.when("Paused", () => settle(withPlayback(timed, Playback.Stopped({ cause: silenced })))),
    Match.when("Ended", () => ended(timed)),
    Match.when("Failed", () => sourceFailed(timed)),
    Match.when("Idle", () => settle(timed)),
    Match.exhaustive,
  );

/** Silent by the listener's wish or the system's: only sound the engine reports changes that. */
const heedSilent = (timed: Session, report: EngineReport): Step =>
  settle(report.phase === "Sounding" ? withSounding(timed) : timed);

/** What the engine's word changes, read against what the listener last asked for. */
const heed = (session: Session, report: EngineReport): Step => {
  const timed = withTiming(session, report);

  return Playback.match<Step>(session.playback, {
    Acknowledged: () => heedWishingToSound(timed, report, "Refused"),
    Starting: () => heedWishingToSound(timed, report, "Refused"),
    Sounding: () => heedWishingToSound(timed, report, "Interrupted"),
    Waiting: () => heedWishingToSound(timed, report, "Interrupted"),
    Paused: () => heedSilent(timed, report),
    Stopped: () => heedSilent(timed, report),
    // NOTE: the source is being replaced, or is past replacing, and the
    // engine's numbers are that dead source's: they are not taken either.
    Recovering: () => unchanged,
    Failed: () => unchanged,
  });
};

/** The system would not let the sound start: the same end whether the track was new or resumed. */
const startRefused = (order: number): Step =>
  forLatestOrder(
    order,
    onSession((session) =>
      settle(
        isAwaitingFirstSound(session.playback)
          ? withPlayback(session, Playback.Stopped({ cause: "Refused" }))
          : session,
      ),
    ),
  );

/** The start has outlasted the threshold: it is slow enough to say so. */
const showActivity = (order: number): Step =>
  forLatestOrder(
    order,
    onSession((session) =>
      settle(
        Playback.guards.Acknowledged(session.playback)
          ? withPlayback(session, Playback.Starting())
          : session,
      ),
    ),
  );

/** The catalog answered: its source is tried from where the old one stopped, and it is the last try. */
const retryWithFreshSource = (order: number, track: TrackSummary): Step =>
  forLatestOrder(
    order,
    onSession((session) =>
      Playback.guards.Recovering(session.playback) && session.current.id === track.id
        ? startCurrent(
            modifyFields(session, {
              current: () => toQueued(track),
              sourceRefresh: () => "Tried",
            }),
            Playback.Starting(),
            session.positionSeconds,
          )
        : unchanged,
    ),
  );

const giveUpOnSource = (order: number): Step =>
  forLatestOrder(
    order,
    onSession((session) =>
      settle(
        Playback.guards.Recovering(session.playback)
          ? withPlayback(session, Playback.Failed())
          : session,
      ),
    ),
  );

const pressedMediaKey = (session: Session, key: MediaKey): Step =>
  Match.value(key).pipe(
    Match.withReturnType<Step>(),
    Match.when("Play", () => play(session)),
    Match.when("Pause", () => silence(session)),
    Match.when("Next", () => next(session, "Remote")),
    Match.when("Previous", () => previous(session, "Remote")),
    Match.exhaustive,
  );

/**
 * The system's own bar for the sound was moved: the engine is asked for that
 * place at once, as a key on the player's own bar asks. The place is kept
 * within the audio's length, which the system may know less exactly than the
 * engine does. Before the engine has read a length there is nothing to move
 * within.
 */
const movedMediaPosition = (session: Session, positionSeconds: number): Step =>
  Option.match(session.maybeDurationSeconds, {
    onNone: () => unchanged,
    onSome: (durationSeconds) =>
      seekTo(session, Number.clamp(positionSeconds, { minimum: 0, maximum: durationSeconds })),
  });

const isDragging = (slider: Slider.Model): boolean => slider.dragState._tag === "Dragging";

/**
 * The slider reports every value on the way and says nothing of letting go,
 * so the two are told apart by its own state. A value that arrives during a
 * drag is the wish moving. One that arrives as a drag ends is the drag given
 * up with Escape, back at its starting value: nothing is asked. Any other is
 * a key, and asks the engine at once.
 */
const changedSeekValue = (wasDragging: boolean, value: number): Step =>
  onSession((session) => {
    if (isDragging(session.seekSlider)) {
      return settle(modifyFields(session, { seek: () => Seek.Scrubbing({ targetSeconds: value }) }));
    }
    return wasDragging
      ? settle(modifyFields(session, { seek: () => Seek.Settled({}) }))
      : seekTo(session, value);
  });

/** Letting go of the slider says nothing: the drag is over and a wish is still standing. */
const seekOnRelease = (wasDragging: boolean): Step =>
  onSession((session) =>
    wasDragging && !isDragging(session.seekSlider)
      ? Seek.matchOrElse<Step>(
          session.seek,
          { Scrubbing: ({ targetSeconds }) => seekTo(session, targetSeconds) },
          () => unchanged,
        )
      : unchanged,
  );

const foldSeekSlider = (wasDragging: boolean) =>
  Update.foldChild({
    update: Slider.update,
    read: (model: Model) => Option.map(model.maybeSession, (session) => session.seekSlider),
    write: (model: Model, nextSeekSlider: Slider.Model) =>
      modifyFields(model, {
        maybeSession: Option.map((session) =>
          session.seekSlider === nextSeekSlider
            ? session
            : modifyFields(session, { seekSlider: () => nextSeekSlider }),
        ),
      }),
    toParentMessage: (message: Slider.Message): Message =>
      Message.GotSeekSliderMessage({ message }),
    foldOutMessage: Slider.OutMessage.match<Step>({
      ChangedValue: ({ value }) => changedSeekValue(wasDragging, value),
    }),
  });

// FACES

/** Turn the expanded player to another of its faces, shown from its top. */
const turnTo =
  (session: Session, pane: Session["pane"]): Step =>
  (model) => ({
    model: withSession(model, modifyFields(session, { pane: () => pane })),
    commands: [ShowFaceFromTop()],
  });

// THE QUEUE

/**
 * What the queue says, and what the player does about it: the queue draws
 * the songs to come and lets the listener choose one or carry one elsewhere,
 * and the order they are in is the session's.
 */
const foldQueue = Update.foldChild({
  update: Queue.update,
  read: (model: Model) => Option.some(model.queue),
  write: (model: Model, nextQueue: Queue.Model): Model =>
    nextQueue === model.queue ? model : modifyFields(model, { queue: () => nextQueue }),
  toParentMessage: (message: Queue.Message): Message => Message.GotQueueMessage({ message }),
  foldOutMessage: Queue.OutMessage.match<Step>({
    ChoseItem: ({ index, trackId }) =>
      onSession((session) => playFromQueue(session, index, trackId)),
    MovedItem: ({ fromIndex, toIndex }) =>
      onSession((session) => moveInQueue(session, fromIndex, toIndex)),
  }),
});

const foldQueueNewList = Update.foldChildStep({
  update: Queue.informNewList,
  read: (model: Model) => Option.some(model.queue),
  write: (model: Model, nextQueue: Queue.Model): Model =>
    nextQueue === model.queue ? model : modifyFields(model, { queue: () => nextQueue }),
  toParentMessage: (message: Queue.Message): Message => Message.GotQueueMessage({ message }),
});

/**
 * The player is its island again. The face it had turned to was the
 * expanded player's, and goes with it: opened again, the player shows the
 * song, as a player is opened. Nothing sounds differently for it.
 */
export const collapse = (model: Model): UpdateReturn =>
  onSession((session) =>
    session.pane === "Artwork"
      ? unchanged
      : settle(modifyFields(session, { pane: () => "Artwork" as const })),
  )(model);

// THE MENU UNDER THE CONTROLS

/**
 * What was chosen from the player's menu is said to whoever holds the
 * player, and nothing is done about it here. The album is a page, and the
 * player knows no pages. The song's details are a face of the player where
 * it expands and the track's page where it does not, and the player does not
 * know which screen it is on: its owner does, and turns it to that face
 * itself (`showDetails`).
 */
const tellOfChoice =
  (action: PlayerAction): StepWithOutMessage =>
  (model) => ({
    model,
    outMessage:
      action === "SongDetails" ? OutMessage.RequestedSongDetails() : OutMessage.RequestedAlbum(),
  });

const readMoreMenu = (model: Model) => Option.map(model.maybeSession, (session) => session.moreMenu);

const writeMoreMenu = (model: Model, nextMenu: Menu.Model): Model =>
  modifyFields(model, {
    maybeSession: Option.map((session) =>
      session.moreMenu === nextMenu ? session : modifyFields(session, { moreMenu: () => nextMenu }),
    ),
  });

const toGotMoreMenuMessage = (message: Menu.Message): Message =>
  Message.GotMoreMenuMessage({ message });

const foldMoreMenu = Update.foldChild({
  update: MoreMenu.update,
  read: readMoreMenu,
  write: writeMoreMenu,
  toParentMessage: toGotMoreMenuMessage,
  foldOutMessage: (chosen: Menu.OutMessage<PlayerAction>) => tellOfChoice(chosen.value),
});

// NOTE: a menu closed by its owner chose nothing, so it has nothing to say.
const foldMoreMenuClose = Update.foldChildStep({
  update: MoreMenu.close,
  read: readMoreMenu,
  write: writeMoreMenu,
  toParentMessage: toGotMoreMenuMessage,
  foldOutMessage: (): Step => unchanged,
});

/**
 * The player's menu, closed by whoever holds the player: the control it hung
 * from is gone, or what it offered was taken up some other way.
 */
export const closeMenu = (model: Model): UpdateReturn => foldMoreMenuClose(model);

/** The face that says what the catalog knows of the track, turned to by whoever holds the player. */
export const showDetails = (model: Model): UpdateReturn =>
  onSession((session) => turnTo(session, "Details"))(model);

const gotSeekSliderMessage = (model: Model, message: Slider.Message): UpdateReturn => {
  const wasDragging = Option.exists(model.maybeSession, (session) =>
    isDragging(session.seekSlider),
  );
  return Update.combine(model, [
    foldSeekSlider(wasDragging)(message),
    seekOnRelease(wasDragging),
  ]);
};

// THE ISLAND

const readIsland = (model: Model) => Option.some(model.island);

/** An island left as it was leaves the player as it was. */
const writeIsland = (model: Model, nextIsland: Island.Model): Model =>
  nextIsland === model.island ? model : modifyFields(model, { island: () => nextIsland });

const toGotIslandMessage = (message: Island.Message): Message =>
  Message.GotIslandMessage({ message });

const foldIsland = Update.foldChild({
  update: Island.update,
  read: readIsland,
  write: writeIsland,
  toParentMessage: toGotIslandMessage,
});

const foldIslandSound = Update.foldChild({
  update: Island.informSound,
  read: readIsland,
  write: writeIsland,
  toParentMessage: toGotIslandMessage,
});

const foldIslandTrackChanged = Update.foldChildStep({
  update: Island.informTrackChanged,
  read: readIsland,
  write: writeIsland,
  toParentMessage: toGotIslandMessage,
});

// WHAT FOLLOWS FROM THE REST

/**
 * Two things follow from whatever a Message did, and are settled in one
 * place instead of in every handler. Both are the island's, which is told:
 * what the sound is doing, which its light follows; and that another track
 * has become the current one, whose words are other words.
 */
const informIsland =
  (previous: Model): Step =>
  (model) =>
    Update.combine(model, [
      Option.match(model.maybeSession, {
        onNone: () => unchanged,
        onSome: (session) => foldIslandSound(soundOf(session.playback)),
      }),
      Equal.equals(maybeCurrentTrackId(previous), maybeCurrentTrackId(model))
        ? unchanged
        : foldIslandTrackChanged,
    ]);

/**
 * That another track has become the current one is said to whoever holds
 * the player, whatever brought it: a press of Next, a row, or the track
 * before coming to its end. It is told from the player before and the player
 * after, here where both are known, so that nobody outside has to compare
 * them.
 */
const maybeChangeOfTrack = (previous: Model, next: Model): OutMessage | undefined =>
  Option.match(maybeCurrentTrackId(next), {
    onNone: () => undefined,
    onSome: (trackId) =>
      Option.contains(maybeCurrentTrackId(previous), trackId)
        ? undefined
        : OutMessage.ChangedTrack({ maybeFromTrackId: maybeCurrentTrackId(previous), trackId }),
  });

/**
 * A result of the player's with what it has to say: what the handler said
 * itself, a choice from the menu, or else that the track changed. A Message
 * does one or the other, never both.
 */
const told = (previous: Model, result: UpdateReturnWithOutMessage): UpdateReturnWithOutMessage => {
  const followed = Update.combine(result.model, [
    (handled) => ({ model: handled, commands: result.commands }),
    informIsland(previous),
  ]);
  return Update.withOutMessage(
    followed,
    result.outMessage ?? maybeChangeOfTrack(previous, followed.model),
  );
};

export const update = (model: Model, message: Message): UpdateReturnWithOutMessage =>
  told(model, handle(model, message));

const handle = (model: Model, message: Message) =>
  Message.match<UpdateReturnWithOutMessage>(message, {
    ClickedPlay: () => onSession(play)(model),
    ClickedPause: () => onSession(silence)(model),
    ClickedNext: () => onSession(next)(model),
    ClickedPrevious: () => onSession(previous)(model),
    // NOTE: the control for the queue is on every face. On the queue's it
    // leads back to the song; on any other it leads to the queue.
    ClickedQueue: () =>
      onSession((session) =>
        turnTo(session, session.pane === "Queue" ? "Artwork" : "Queue"),
      )(model),
    ClickedDetails: () =>
      onSession((session) => (session.pane === "Details" ? turnTo(session, "Artwork") : unchanged))(model),
    ClickedTryAgain: () => onSession(play)(model),
    PressedMediaKey: ({ key }) => onSession((session) => pressedMediaKey(session, key))(model),
    MovedMediaPosition: ({ positionSeconds }) =>
      onSession((session) => movedMediaPosition(session, positionSeconds))(model),

    GotSeekSliderMessage: ({ message }) => gotSeekSliderMessage(model, message),
    GotMoreMenuMessage: ({ message }) => foldMoreMenu(model, message),
    GotQueueMessage: ({ message }) => foldQueue(model, message),

    UpdatedEngineStatus: ({ report }) =>
      forLatestOrder(
        report.order,
        onSession((session) => heed(session, report)),
      )(model),

    CompletedStartPlayback: ({ order, outcome }) =>
      outcome === "Refused" ? startRefused(order)(model) : { model },
    CompletedResumePlayback: ({ order, outcome }) =>
      outcome === "Refused" ? startRefused(order)(model) : { model },

    CompletedWaitBeforeShowingActivity: ({ order }) => showActivity(order)(model),

    SucceededRefreshSource: ({ order, track }) => retryWithFreshSource(order, track)(model),
    FailedRefreshSource: ({ order }) => giveUpOnSource(order)(model),

    GotIslandMessage: ({ message }) => foldIsland(model, message),

    CompletedPausePlayback: () => ({ model }),
    CompletedSeekPlayback: () => ({ model }),
    CompletedPublishNowPlaying: () => ({ model }),
    CompletedShowFaceFromTop: () => ({ model }),
  });

// ENTRY

/** The current track's own control, wherever it is drawn: a press stops the sound or brings it back. */
const toggle = (session: Session): Step =>
  isUnderWay(session.playback) ? pause(session) : play(session);

/**
 * The listener chose a track from a list. The list becomes the queue and the
 * track the current one; a track with nothing to play cannot be chosen.
 * Choosing the track that is already current does what its own control does:
 * it is not started over, and a second tap while it starts changes nothing.
 */
export const choose = (
  model: Model,
  choice: Readonly<{ trackId: TrackId; list: ReadonlyArray<TrackSummary> }>,
): UpdateReturnWithOutMessage =>
  told(
    model,
    Option.contains(maybeCurrentTrackId(model), choice.trackId)
      ? onSession(toggle)(model)
      : Option.match(queueFrom(choice.list, choice.trackId), {
          onNone: () => ({ model }),
          onSome: (session) =>
            Update.combine(model, [startTrack(session, "Chosen"), foldQueueNewList]),
        }),
  );

/**
 * The listener put a track in the queue: next, right after the current
 * track, or last, after all the rest. Nothing sounds differently for it. A
 * queue holds a track once among those to come, so one already waiting there
 * moves to where it was put. Three things cannot be queued: a track with
 * nothing to play, the current track, and anything while nothing has been
 * played, since a queue is what comes after a track.
 */
export const enqueue = (
  model: Model,
  entry: Readonly<{ track: TrackSummary; place: QueuePlace }>,
): UpdateReturn =>
  onSession((session) => (held) => {
    if (!isPlayable(entry.track) || session.current.id === entry.track.id) {
      return { model: held };
    }
    const rest = Array.filter(session.later, (queued) => queued.id !== entry.track.id);
    const queued = toQueued(entry.track);
    return {
      model: withSession(
        held,
        modifyFields(session, {
          later: () =>
            entry.place === "Next" ? Array.prepend(rest, queued) : Array.append(rest, queued),
        }),
      ),
    };
  })(model);
