import type { AlbumId } from "@bafle/domain/Catalog/Album";
import { type Track, type TrackId, TrackSummary } from "@bafle/domain/Catalog/Track";
import { DragAndDrop, Menu, Slider } from "@foldkit/ui";
import * as Array from "effect/Array";
import { pipe } from "effect/Function";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { defineTaggedUnion } from "foldkit/schema";
import { initialMoreMenu } from "./moreMenu.ts";

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
 * How playback moved to this track: an in-app choice, the end of the
 * previous track, or a headset, lock-screen or keyboard media control.
 */
export const Cue = Schema.Literals(["Chosen", "Followed", "Remote"]);
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
  /**
   * The face of the expanded player: the song's, with its cover; the
   * queue's, with the songs to come; or the one that says what the catalog
   * knows of the track.
   */
  pane: Schema.Literals(["Artwork", "Queue", "Details"]),
  /** The menu under the controls of the expanded player (`moreMenu.ts`). */
  moreMenu: Menu.Model,
  /**
   * A song of the queue being moved to another place in it: taken up by its
   * handle and carried, or moved with the keys (Foldkit UI's `DragAndDrop`).
   */
  queueDrag: DragAndDrop.Model,
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
 * A line of the island's words, when it is too long for its place: it
 * stands, travels across once, and stands again. The island has two such
 * lines, the track's title and, under it, who it is by, and each is a
 * marquee of its own: either may fit while the other does not, and one
 * longer than the other takes longer to pass. `maybeTravelPixels` is how far
 * one pass takes the line, as measured in the document, and nothing when it
 * fits. Each time the line changes length, or starts or stops fitting while
 * it stands, the run takes the next number, and a wait or a pass that ends
 * for an earlier run is dropped.
 *
 * The island changes width as the navigation comes and goes, and that alone
 * is no reason to start over: a pass goes as far as the line is long,
 * whatever the width of its place, so the wait or the pass under way goes
 * on. A line that comes to fit in the middle of a pass is `Finishing`: it
 * ends the pass it is on, and then stands for good.
 */
export const Marquee = Schema.Struct({
  run: Schema.Int,
  placePixels: Schema.Number,
  maybeTravelPixels: Schema.Option(Schema.Number),
  phase: Schema.Literals(["Standing", "Travelling", "Finishing"]),
});
export type Marquee = typeof Marquee.Type;

/**
 * Whether the queue stands open beside the page, on a screen with room for a
 * column of its own (`screen.ts`). It is the player's and no session's: a
 * queue left open stays open when another list is played.
 */
export const QueueColumn = Schema.Literals(["Closed", "Open"]);
export type QueueColumn = typeof QueueColumn.Type;

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
  title: Marquee,
  artist: Marquee,
  queueColumn: QueueColumn,
});
export type Model = typeof Model.Type;

export const initialMarquee: Marquee = {
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

/** The island's control for the queue, on a desktop's screen, and the column it opens. */
export const QUEUE_CONTROL_ID = "player-queue-control";
export const QUEUE_COLUMN_ID = "player-queue-column";

/** The id the queue's list goes by, to what moves its songs. */
export const QUEUE_CONTAINER_ID = "player-queue-list";

/** Nothing of the queue is being moved. */
export const initialQueueDrag: DragAndDrop.Model = DragAndDrop.init({ id: "player-queue-drag" });

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
        pane: "Artwork",
        cue: "Chosen",
        playback: Playback.Acknowledged(),
        sourceRefresh: "Untried",
        positionSeconds: 0,
        maybeDurationSeconds: Option.none(),
        bufferedSeconds: 0,
        seek: Seek.Settled({}),
        seekSlider: initialSeekSlider,
        moreMenu: initialMoreMenu,
        queueDrag: initialQueueDrag,
      }),
  });
};

/** Where in the queue a track is put: right after the current one, or after all the rest. */
export const QueuePlace = Schema.Literals(["Next", "Last"]);
export type QueuePlace = typeof QueuePlace.Type;

// READ

export const hasSession = (model: Model): boolean => Option.isSome(model.maybeSession);

export const maybeCurrentTrackId = (model: Model): Option.Option<TrackId> =>
  Option.map(model.maybeSession, (session) => session.current.id);

/**
 * Whether the expanded player shows the song's face, the one it opens with.
 * With nothing played there is no other face to show.
 */
export const isOnSongFace = (model: Model): boolean =>
  Option.match(model.maybeSession, {
    onNone: () => true,
    onSome: (session) => session.pane === "Artwork",
  });

/** Whether the queue's column is there to draw: it was opened, and something has been played. */
export const isQueueColumnOpen = (model: Model): boolean =>
  model.queueColumn === "Open" && hasSession(model);

/** Whether the player's menu is open: under the expanded player's controls, or on the island of a desktop's screen. */
export const isMoreMenuOpen = (model: Model): boolean =>
  Option.exists(model.maybeSession, (session) => session.moreMenu.isOpen);

/** The album the track the player holds is on. */
export const maybeCurrentAlbumId = (model: Model): Option.Option<AlbumId> =>
  Option.map(model.maybeSession, (session) => session.current.album.id);

/**
 * Whether the listener has just put another track in the player. A track
 * that followed the one before by itself is not that: nobody tapped.
 */
export const maybeChosenTrackId = (previous: Model, next: Model): Option.Option<TrackId> =>
  Option.map(
    Option.filter(next.maybeSession, (session) =>
      session.cue === "Chosen" && !Option.contains(maybeCurrentTrackId(previous), session.current.id),
    ),
    (session) => session.current.id,
  );

/**
 * Whether the expanded player has just turned from one of its faces to the
 * other, the song's and the queue's, and which way. Told with the track it
 * holds, whose cover is what travels between the two. A track that changed
 * with the face is no turn: there is no one cover to carry across.
 */
export const maybeTurnedFace = (
  previous: Model,
  next: Model,
): Option.Option<Readonly<{ trackId: TrackId; toQueue: boolean }>> =>
  Option.flatMap(
    Option.all({ before: previous.maybeSession, after: next.maybeSession }),
    ({ before, after }) => {
      const wasSong = before.pane === "Artwork";
      return before.current.id === after.current.id && wasSong !== (after.pane === "Artwork")
        ? Option.some({ trackId: after.current.id, toQueue: wasSong })
        : Option.none();
    },
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

/**
 * Whether the bar of the sound's progress follows the sound: there is sound,
 * and the bar stands where the engine is and not where the listener wants to
 * be. Only then is the engine asked where the sound is, several times a
 * second (`soundPlaces` in subscription.ts).
 */
export const followsSound = (model: Model): boolean =>
  Option.exists(
    model.maybeSession,
    (session) => Playback.guards.Sounding(session.playback) && Seek.guards.Settled(session.seek),
  );

export const hasLater = (session: Session): boolean => Array.isReadonlyArrayNonEmpty(session.later);

/** Whether a track was played before this one, for Previous to lead back to. */
export const hasEarlier = (session: Session): boolean =>
  Array.isReadonlyArrayNonEmpty(session.earlier);
