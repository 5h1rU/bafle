import type { TrackId, TrackSummary } from "@bafle/domain/Catalog/Track";
import { Slider } from "@foldkit/ui";
import * as Array from "effect/Array";
import * as Duration from "effect/Duration";
import * as Equal from "effect/Equal";
import { pipe } from "effect/Function";
import * as Match from "effect/Match";
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
  StartPlayback,
  TITLE_RESTS_FOR,
  TITLE_STARTS_AFTER,
  titlePassDuration,
  TravelTitle,
  WaitBeforeShowingActivity,
  WaitToTravelTitle,
} from "./command.ts";
import { type MediaKey, Message } from "./message.ts";
import {
  type Cue,
  initialSeekSlider,
  initialTitle,
  isAwaitingFirstSound,
  isUnderWay,
  lightAfter,
  maybeCurrentTrackId,
  type Model,
  Playback,
  playableSource,
  queueFrom,
  Seek,
  type Session,
  toQueued,
  wantsToSound,
} from "./model.ts";

type Services = AudioEngine | CatalogClient;
type UpdateReturn = Update.Return<Model, Message, Services>;
type Step = Update.Step<Model, Message, Services>;

/** Past this many seconds, going to the previous track goes to the start of this one instead. */
export const RESTART_AFTER_SECONDS = 3;

// INIT

export const init = (): Model => ({
  lastOrder: 0,
  maybeSession: Option.none(),
  light: "Dark",
  title: initialTitle,
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
    onNone: () => settle(withPlayback(session, Playback.Failed())),
    onSome: (source) =>
      giveOrder(
        modifyFields(session, {
          playback: () => playback,
          positionSeconds: () => positionSeconds,
          maybeDurationSeconds: () => Option.none(),
          bufferedSeconds: () => positionSeconds,
          seek: () => Seek.Settled(),
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

/** Ask the engine for another position. The wish stands until the engine says it is there. */
const seekTo = (session: Session, targetSeconds: number): Step =>
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

const next = (session: Session): Step =>
  Array.match(session.later, {
    onEmpty: () => unchanged,
    onNonEmpty: (later) => advance(session, later, "Chosen"),
  });

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

const previous = (session: Session): Step =>
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
            "Chosen",
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
          seek: () => Seek.Settled(),
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
        seek: (seek) => (hasArrived(session, report) ? Seek.Settled() : seek),
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
    Match.when("Next", () => next(session)),
    Match.when("Previous", () => previous(session)),
    Match.exhaustive,
  );

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
      ? settle(modifyFields(session, { seek: () => Seek.Settled() }))
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

const gotSeekSliderMessage = (model: Model, message: Slider.Message): UpdateReturn => {
  const wasDragging = Option.exists(model.maybeSession, (session) =>
    isDragging(session.seekSlider),
  );
  return Update.combine(model, [
    foldSeekSlider(wasDragging)(message),
    seekOnRelease(wasDragging),
  ]);
};

// TITLE

/**
 * The title's place or its length changed. It stands, and if it does not
 * fit, the wait before its first pass starts over.
 */
const measuredTitle =
  (placePixels: number, maybeTravelPixels: Option.Option<number>): Step =>
  (model) => {
    const { title } = model;
    if (
      title.placePixels === placePixels &&
      Equal.equals(title.maybeTravelPixels, maybeTravelPixels)
    ) {
      return { model };
    }
    const run = title.run + 1;
    return {
      model: modifyFields(model, {
        title: () => ({ run, placePixels, maybeTravelPixels, phase: "Standing" }),
      }),
      commands: Option.match(maybeTravelPixels, {
        onNone: () => [],
        onSome: () => [
          WaitToTravelTitle({ run, milliseconds: Duration.toMillis(TITLE_STARTS_AFTER) }),
        ],
      }),
    };
  };

/** A wait or a pass of the title counts only for the run it was started for. */
const forTitleRun =
  (run: number, act: (travelPixels: number) => Step): Step =>
  (model) =>
    run === model.title.run
      ? Option.match(model.title.maybeTravelPixels, {
          onNone: () => ({ model }),
          onSome: (travelPixels) => act(travelPixels)(model),
        })
      : { model };

const startTitlePass =
  (travelPixels: number): Step =>
  (model) => ({
    model: modifyFields(model, {
      title: (title) => modifyFields(title, { phase: () => "Travelling" as const }),
    }),
    commands: [
      TravelTitle({
        run: model.title.run,
        milliseconds: Duration.toMillis(titlePassDuration(travelPixels)),
      }),
    ],
  });

const restTitle = (): Step => (model) => ({
  model: modifyFields(model, {
    title: (title) => modifyFields(title, { phase: () => "Standing" as const }),
  }),
  commands: [
    WaitToTravelTitle({
      run: model.title.run,
      milliseconds: Duration.toMillis(TITLE_RESTS_FOR),
    }),
  ],
});

// WHAT FOLLOWS FROM THE REST

/**
 * Two things follow from whatever a Message did, and are settled in one
 * place instead of in every handler: what the island's light does, which
 * follows the playback; and the title's standing still again, when another
 * track has become the current one and its title is another title.
 */
const withWhatFollows =
  (previous: Model) =>
  (result: UpdateReturn): UpdateReturn => {
    const { model } = result;
    const light = Option.match(model.maybeSession, {
      onNone: () => model.light,
      onSome: (session) => lightAfter(model.light, session.playback),
    });
    const isAnotherTrack = !Equal.equals(
      maybeCurrentTrackId(previous),
      maybeCurrentTrackId(model),
    );
    if (light === model.light && !isAnotherTrack) {
      return result;
    }
    return {
      ...result,
      model: modifyFields(model, {
        light: () => light,
        title: (title) =>
          isAnotherTrack ? { ...initialTitle, run: title.run + 1 } : title,
      }),
    };
  };

export const update = (model: Model, message: Message): UpdateReturn =>
  withWhatFollows(model)(handle(model, message));

const handle = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ClickedPlay: () => onSession(play)(model),
    ClickedPause: () => onSession(silence)(model),
    ClickedNext: () => onSession(next)(model),
    ClickedPrevious: () => onSession(previous)(model),
    ClickedTryAgain: () => onSession(play)(model),
    PressedMediaKey: ({ key }) => onSession((session) => pressedMediaKey(session, key))(model),

    GotSeekSliderMessage: ({ message }) => gotSeekSliderMessage(model, message),

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

    MeasuredTitle: ({ placePixels, maybeTravelPixels }) =>
      measuredTitle(placePixels, maybeTravelPixels)(model),
    CompletedWaitToTravelTitle: ({ run }) => forTitleRun(run, startTitlePass)(model),
    CompletedTravelTitle: ({ run }) => forTitleRun(run, restTitle)(model),

    CompletedPausePlayback: () => ({ model }),
    CompletedSeekPlayback: () => ({ model }),
    CompletedPublishNowPlaying: () => ({ model }),
    CompletedDrawIslandFigure: () => ({ model }),
    CompletedStartIslandLight: () => ({ model }),
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
): UpdateReturn =>
  withWhatFollows(model)(
    Option.contains(maybeCurrentTrackId(model), choice.trackId)
      ? onSession(toggle)(model)
      : Option.match(queueFrom(choice.list, choice.trackId), {
          onNone: () => ({ model }),
          onSome: (session) => startTrack(session, "Chosen")(model),
        }),
  );
