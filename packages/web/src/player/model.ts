import { type Track, type TrackId, TrackSummary } from "@bafle/domain/Catalog/Track";
import { Slider } from "@foldkit/ui";
import * as Array from "effect/Array";
import { pipe } from "effect/Function";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { defineTaggedUnion } from "foldkit/schema";

// SOURCE

/**
 * What the engine is given to sound a track: whatever the catalog offers for
 * it, or nothing. This is the one place the app reads the catalog's field;
 * everything else speaks of a source.
 */
export const playableSource = (track: TrackSummary): Option.Option<string> =>
  Option.fromNullishOr(track.previewUrl);

export const isPlayable = (track: TrackSummary): boolean => Option.isSome(playableSource(track));

/** A track as the queue holds it: what a row shows, whichever page it was played from. */
export const toQueued = (track: TrackSummary | Track): TrackSummary => ({
  id: track.id,
  title: track.title,
  artist: track.artist,
  album: track.album,
  durationSeconds: track.durationSeconds,
  previewUrl: track.previewUrl,
  explicit: track.explicit,
});

// MODEL

/**
 * Where playing the current track has got to, as the listener is told it.
 * The wish and the fact are one value, so they cannot disagree: the first
 * two are a wish to hear it that the engine has not answered, `Sounding` and
 * `Waiting` are the engine's own word, and the rest are the ways of not
 * sounding, each with its own cause.
 */
export const Playback = defineTaggedUnion({
  /** Asked for an instant ago. Nothing is worth saying yet but that the tap was heard. */
  Acknowledged: {},
  /** Asked for, and taking long enough to say so. */
  Starting: {},
  /** The engine says it sounds. */
  Sounding: {},
  /** The engine was sounding and has run out of data. */
  Waiting: {},
  /** The listener asked for silence. */
  Paused: {},
  /**
   * Silent, and not by the listener's wish: the system would not let the
   * sound start, or stopped it under way. Only the listener can undo it.
   */
  Stopped: { cause: Schema.Literals(["Refused", "Interrupted"]) },
  /** The engine could not load the source: the catalog is being asked for the track again. */
  Recovering: {},
  /** The source the catalog gave on asking again could not be loaded either. */
  Failed: {},
});
export type Playback = typeof Playback.Type;

/**
 * Where the listener wants the position to be, while it is not there.
 * Dragging moves the wish and asks nothing of the engine; letting go asks,
 * and the wish stands until the engine says it has arrived.
 */
export const Seek = defineTaggedUnion({
  Settled: {},
  Scrubbing: { targetSeconds: Schema.Number },
  Seeking: { targetSeconds: Schema.Number },
});
export type Seek = typeof Seek.Type;

/**
 * How the current track came to be current: the listener picked it, or it
 * followed the one before when that ended.
 */
export const Cue = Schema.Literals(["Chosen", "Followed"]);
export type Cue = typeof Cue.Type;

/** Whether the source loaded is the one the catalog gave on being asked again after a failure. */
export const SourceRefresh = Schema.Literals(["Untried", "Tried"]);
export type SourceRefresh = typeof SourceRefresh.Type;

/**
 * What the player holds once something has been played. The queue is the
 * list the track was played from, split around the current track: there is
 * always exactly one, and never a position that points at nothing.
 */
export const Session = Schema.Struct({
  earlier: Schema.Array(TrackSummary),
  current: TrackSummary,
  later: Schema.Array(TrackSummary),
  cue: Cue,
  playback: Playback,
  sourceRefresh: SourceRefresh,
  /** The engine's own account, as last reported in answer to the latest order. */
  positionSeconds: Schema.Number,
  /** The length of the audio as the engine read it, not the length the catalog lists. */
  maybeDurationSeconds: Schema.Option(Schema.Number),
  bufferedSeconds: Schema.Number,
  seek: Seek,
  seekSlider: Slider.Model,
});
export type Session = typeof Session.Type;

/**
 * The light that travels the island's edge. It is dark until there has been
 * sound. From then on it travels while there is sound and rests, dimmed,
 * where it stopped when there is not.
 */
export const IslandLight = Schema.Literals(["Dark", "Travelling", "Resting"]);
export type IslandLight = typeof IslandLight.Type;

/**
 * The island's title, when it is too long for its place: it stands, travels
 * across once, and stands again. `maybeTravelPixels` is how far one pass
 * takes it, as measured in the document, and nothing when the title fits.
 * Each time the title or its place changes the run takes the next number,
 * and a wait or a pass that ends for an earlier run is dropped.
 */
export const TitleMarquee = Schema.Struct({
  run: Schema.Int,
  placePixels: Schema.Number,
  maybeTravelPixels: Schema.Option(Schema.Number),
  phase: Schema.Literals(["Standing", "Travelling"]),
});
export type TitleMarquee = typeof TitleMarquee.Type;

export const Model = Schema.Struct({
  /**
   * The number of the latest order given to the engine. A report counts only
   * if the engine made it after hearing that order: the latest wish wins, and
   * what the engine says of an earlier one is dropped.
   */
  lastOrder: Schema.Int,
  /** Nothing until the first track is played; from then on, for the life of the page. */
  maybeSession: Schema.Option(Session),
  light: IslandLight,
  title: TitleMarquee,
});
export type Model = typeof Model.Type;

export const initialTitle: TitleMarquee = {
  run: 0,
  placePixels: 0,
  maybeTravelPixels: Option.none(),
  phase: "Standing",
};

/**
 * What the light does once the playback is `playback`. Only the engine's
 * word that there is sound sets it going, and a tap is only a wish: until it
 * is answered it changes nothing, however long the start takes, so going on
 * to another track does not halt the light and a first track does not light
 * it. Anything else puts a light that has travelled to rest: a pause, a
 * stop, a failure, sound that had started and ran out of data.
 */
export const lightAfter = (light: IslandLight, playback: Playback): IslandLight =>
  Playback.matchOrElse<IslandLight>(
    playback,
    {
      Sounding: () => "Travelling",
      Acknowledged: () => light,
      Starting: () => light,
    },
    () => (light === "Dark" ? "Dark" : "Resting"),
  );

export const SEEK_SLIDER_ID = "player-seek";

/** The slider steps by whole seconds: an arrow key moves one, Page Up and Down ten. */
export const SEEK_STEP_SECONDS = 1;

export const initialSeekSlider: Slider.Model = Slider.init({
  id: SEEK_SLIDER_ID,
  min: 0,
  max: 1,
  step: SEEK_STEP_SECONDS,
});

/**
 * The session a tap on a track in a list starts: the list is the queue, less
 * the tracks with nothing to play, split around the track. A track that has
 * nothing to play, or is not in the list, starts none.
 */
export const queueFrom = (
  list: ReadonlyArray<TrackSummary>,
  trackId: TrackId,
): Option.Option<Session> => {
  const [earlier, rest] = pipe(
    Array.filter(list, isPlayable),
    Array.map(toQueued),
    Array.span((track) => track.id !== trackId),
  );
  return Array.match(rest, {
    onEmpty: () => Option.none(),
    onNonEmpty: (found) =>
      Option.some({
        earlier,
        current: Array.headNonEmpty(found),
        later: Array.tailNonEmpty(found),
        cue: "Chosen",
        playback: Playback.Acknowledged(),
        sourceRefresh: "Untried",
        positionSeconds: 0,
        maybeDurationSeconds: Option.none(),
        bufferedSeconds: 0,
        seek: Seek.Settled(),
        seekSlider: initialSeekSlider,
      }),
  });
};

// READ

export const hasSession = (model: Model): boolean => Option.isSome(model.maybeSession);

export const maybeCurrentTrackId = (model: Model): Option.Option<TrackId> =>
  Option.map(model.maybeSession, (session) => session.current.id);

/**
 * Whether the listener has just put another track in the player. A track
 * that followed the one before by itself is not that: nobody tapped.
 */
export const choseAnotherTrack = (previous: Model, next: Model): boolean =>
  Option.exists(
    next.maybeSession,
    (session) =>
      session.cue === "Chosen" &&
      !Option.contains(maybeCurrentTrackId(previous), session.current.id),
  );

/** Wanting to sound: every state a press of the main control would answer with silence. */
export const wantsToSound = Playback.isAnyOf([
  "Acknowledged",
  "Starting",
  "Sounding",
  "Waiting",
  "Recovering",
]);

/** The engine has sounded this source: it sounds now, or waits for more of it. */
export const isUnderWay = Playback.isAnyOf(["Sounding", "Waiting"]);

/** Asked to sound, with nothing heard from the engine yet: no sound, and no refusal. */
export const isAwaitingFirstSound = Playback.isAnyOf(["Acknowledged", "Starting"]);

/** A wait long enough to show: the slow start, and the second try with a fresh source. */
export const isShowingActivity = Playback.isAnyOf(["Starting", "Recovering"]);

/**
 * What a track's row, or its page, has to show of the player. Plain words,
 * so that a list is redrawn when one of its tracks changes state and not on
 * every second of progress.
 */
export type TrackStatus =
  | "Elsewhere"
  | "Chosen"
  | "Starting"
  | "Sounding"
  | "Waiting"
  | "Paused"
  | "Stopped"
  | "Failed";

export const currentTrackStatus = (model: Model): TrackStatus =>
  Option.match(model.maybeSession, {
    onNone: () => "Elsewhere",
    onSome: ({ playback }) =>
      Playback.match<TrackStatus>(playback, {
        Acknowledged: () => "Chosen",
        Starting: () => "Starting",
        Recovering: () => "Starting",
        Sounding: () => "Sounding",
        Waiting: () => "Waiting",
        Paused: () => "Paused",
        Stopped: () => "Stopped",
        Failed: () => "Failed",
      }),
  });

/**
 * A track's status, from the id of the track the player holds and that
 * track's status: the two plain values a page is drawn from.
 */
export const statusFor = (
  playingTrackId: TrackId | undefined,
  playingStatus: TrackStatus,
  trackId: TrackId,
): TrackStatus => (trackId === playingTrackId ? playingStatus : "Elsewhere");

export const trackStatus = (model: Model, trackId: TrackId): TrackStatus =>
  statusFor(Option.getOrUndefined(maybeCurrentTrackId(model)), currentTrackStatus(model), trackId);

/** Where the progress bar stands: where the listener wants to be while seeking, else where the engine is. */
export const shownPositionSeconds = (session: Session): number =>
  Seek.match(session.seek, {
    Settled: () => session.positionSeconds,
    Scrubbing: ({ targetSeconds }) => targetSeconds,
    Seeking: ({ targetSeconds }) => targetSeconds,
  });

export const hasLater = (session: Session): boolean => Array.isReadonlyArrayNonEmpty(session.later);
