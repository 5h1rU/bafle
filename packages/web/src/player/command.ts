import { TrackId } from "@bafle/domain/Catalog/Track";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Command, Dom, Render } from "foldkit";
import { Catalog, REPLY_TIMEOUT } from "../catalog.ts";
import { AudioEngine } from "./audioEngine.ts";
import { changePace, ISLAND_LIGHTS_ATTRIBUTE } from "./islandLight.ts";
import { Message } from "./message.ts";
import { QUEUE_CONTROL_ID } from "./model.ts";

// COMMAND

/**
 * How long a start may take before the interface says it is waiting. A start
 * that sounds sooner shows no activity at all: a spinner that flashes for a
 * tenth of a second says something went slowly when nothing did.
 */
export const SHOW_ACTIVITY_AFTER = Duration.millis(400);

/**
 * NOTE: the engine's `start` is the first thing this does. The runtime runs a
 * Command in a microtask of the event that caused it, which is still inside
 * the listener's tap as a phone counts it; anything awaited before `start`
 * would put the sound outside it, and the phone would refuse.
 */
export const StartPlayback = Command.define("StartPlayback", {
  args: { order: Schema.Int, source: Schema.String, positionSeconds: Schema.Number },
  messages: [Message.CompletedStartPlayback],
  execute: ({ order, source, positionSeconds }) =>
    Effect.gen(function* () {
      const engine = yield* AudioEngine;
      const outcome = yield* engine.start({ order, source, positionSeconds });
      return Message.CompletedStartPlayback({ order, outcome });
    }),
});

export const ResumePlayback = Command.define("ResumePlayback", {
  args: { order: Schema.Int },
  messages: [Message.CompletedResumePlayback],
  execute: ({ order }) =>
    Effect.gen(function* () {
      const engine = yield* AudioEngine;
      const outcome = yield* engine.resume(order);
      return Message.CompletedResumePlayback({ order, outcome });
    }),
});

export const PausePlayback = Command.define("PausePlayback", {
  args: { order: Schema.Int },
  messages: [Message.CompletedPausePlayback],
  execute: ({ order }) =>
    Effect.gen(function* () {
      const engine = yield* AudioEngine;
      yield* engine.pause(order);
      return Message.CompletedPausePlayback();
    }),
});

export const SeekPlayback = Command.define("SeekPlayback", {
  args: { order: Schema.Int, positionSeconds: Schema.Number },
  messages: [Message.CompletedSeekPlayback],
  execute: ({ order, positionSeconds }) =>
    Effect.gen(function* () {
      const engine = yield* AudioEngine;
      yield* engine.seek(order, positionSeconds);
      return Message.CompletedSeekPlayback();
    }),
});

export const WaitBeforeShowingActivity = Command.define("WaitBeforeShowingActivity", {
  args: { order: Schema.Int },
  messages: [Message.CompletedWaitBeforeShowingActivity],
  execute: ({ order }) =>
    Effect.sleep(SHOW_ACTIVITY_AFTER).pipe(
      Effect.as(Message.CompletedWaitBeforeShowingActivity({ order })),
    ),
});

// The title's times and speed were read off the app the island is modelled
// on, frame by frame: a title starts to move about three and a half seconds
// after its place last changed, and crosses it at about 45 points a second.
// The wait between two passes is five seconds.

/** How long the title stands before its first pass, counted from when its place last changed. */
export const TITLE_STARTS_AFTER = Duration.millis(3500);

/** How long the title stands between one pass and the next. */
export const TITLE_RESTS_FOR = Duration.seconds(5);

export const TITLE_PIXELS_PER_SECOND = 45;

/** How long one pass takes: the way it goes, at the title's speed. */
export const titlePassDuration = (travelPixels: number): Duration.Duration =>
  Duration.millis((travelPixels / TITLE_PIXELS_PER_SECOND) * 1000);

/** The title stands for a while before it travels: before its first pass, and between passes. */
export const WaitToTravelTitle = Command.define("WaitToTravelTitle", {
  args: { run: Schema.Int, milliseconds: Schema.Number },
  messages: [Message.CompletedWaitToTravelTitle],
  execute: ({ run, milliseconds }) =>
    Effect.sleep(Duration.millis(milliseconds)).pipe(
      Effect.as(Message.CompletedWaitToTravelTitle({ run })),
    ),
});

/**
 * One pass of the title. The view moves it, with a transition as long as
 * this; the Command is the clock that says when the pass is over.
 */
export const TravelTitle = Command.define("TravelTitle", {
  args: { run: Schema.Int, milliseconds: Schema.Number },
  messages: [Message.CompletedTravelTitle],
  execute: ({ run, milliseconds }) =>
    Effect.sleep(Duration.millis(milliseconds)).pipe(
      Effect.as(Message.CompletedTravelTitle({ run })),
    ),
});

// NOTE: who the track is by is a line of its own under the title, with its
// own waits and passes at the title's times and speed. They are Commands of
// their own, and not the title's given a second purpose: the two lines wait
// and travel at once, and what ends for one must not be taken for the other.

/** The artist's line stands for a while before it travels, as the title does. */
export const WaitToTravelArtist = Command.define("WaitToTravelArtist", {
  args: { run: Schema.Int, milliseconds: Schema.Number },
  messages: [Message.CompletedWaitToTravelArtist],
  execute: ({ run, milliseconds }) =>
    Effect.sleep(Duration.millis(milliseconds)).pipe(
      Effect.as(Message.CompletedWaitToTravelArtist({ run })),
    ),
});

/** One pass of the artist's line: the clock that says when it is over. */
export const TravelArtist = Command.define("TravelArtist", {
  args: { run: Schema.Int, milliseconds: Schema.Number },
  messages: [Message.CompletedTravelArtist],
  execute: ({ run, milliseconds }) =>
    Effect.sleep(Duration.millis(milliseconds)).pipe(
      Effect.as(Message.CompletedTravelArtist({ run })),
    ),
});

/**
 * The light gathers speed, or loses it and comes to rest: the document's
 * side of a change in what the Model says the light is doing. The light's
 * animations are the document's, so this is done to the document, to the
 * island that is in it; with no island there, the player being the whole
 * screen, there is nothing to do, and the island sets its own pace when it
 * comes back (the Mount `StartIslandLight`). A change that overtakes one
 * under way carries on from the pace the light had reached.
 */
export const ChangeIslandLightPace = Command.define("ChangeIslandLightPace", {
  args: { pace: Schema.Number },
  messages: [Message.CompletedChangeIslandLightPace],
  execute: ({ pace }) =>
    Effect.suspend(() =>
      Option.match(
        Option.fromNullishOr(document.querySelector(`[data-${ISLAND_LIGHTS_ATTRIBUTE}]`)),
        { onNone: () => Effect.void, onSome: (lights) => changePace(lights, pace) },
      ),
    ).pipe(Effect.as(Message.CompletedChangeIslandLightPace())),
});

/**
 * Ask the catalog for the track again: the source a list gave can have gone
 * stale since the list loaded, and the catalog's answer carries a fresh one.
 * No answer in time is a failure like any other.
 */
export const RefreshSource = Command.define("RefreshSource", {
  args: { order: Schema.Int, trackId: TrackId },
  messages: [Message.SucceededRefreshSource, Message.FailedRefreshSource],
  execute: ({ order, trackId }) =>
    Catalog.TrackDetail({ input: { trackId }, requestId: `source:${order}` }).effect.pipe(
      Effect.map((reply) =>
        Match.value(reply).pipe(
          Match.tagsExhaustive({
            SucceededTrackDetail: ({ result }) =>
              Message.SucceededRefreshSource({ order, track: result }),
            FailedTrackDetail: () => Message.FailedRefreshSource({ order }),
          }),
        ),
      ),
      Effect.timeoutOrElse({
        duration: REPLY_TIMEOUT,
        orElse: () => Effect.succeed(Message.FailedRefreshSource({ order })),
      }),
    ),
});

/**
 * Tell the system what is playing, for the lock screen and for a headset's
 * display. A browser without the Media Session API is told nothing, and one
 * that will not take what it is told is left as it was: the sound does not
 * depend on it.
 */
export const PublishNowPlaying = Command.define("PublishNowPlaying", {
  args: {
    title: Schema.String,
    artist: Schema.String,
    album: Schema.String,
    maybeArtworkUrl: Schema.Option(Schema.String),
  },
  messages: [Message.CompletedPublishNowPlaying],
  execute: ({ title, artist, album, maybeArtworkUrl }) =>
    Effect.try(() => {
      if ("mediaSession" in navigator && typeof MediaMetadata !== "undefined") {
        navigator.mediaSession.metadata = new MediaMetadata({
          title,
          artist,
          album,
          artwork: Option.match(maybeArtworkUrl, {
            onNone: () => [],
            onSome: (src) => [{ src }],
          }),
        });
      }
    }).pipe(Effect.ignore, Effect.as(Message.CompletedPublishNowPlaying())),
});

/**
 * The expanded player's sheet, by what it is in the document: the piece that
 * scrolls is the one piece inside it.
 */
const SHEET_CONTENT_SELECTOR = '[data-layout="expanded"] > *';

/**
 * Puts what is in the expanded player's sheet back at its top, once the face
 * it has turned to is drawn. The two faces are of different lengths and
 * share the one box that scrolls: a face would otherwise be shown from where
 * the other was left, and the song's with its cover off the screen.
 */
export const ShowFaceFromTop = Command.define("ShowFaceFromTop", {
  messages: [Message.CompletedShowFaceFromTop],
  execute: Effect.gen(function* () {
    yield* Render.afterCommit;
    yield* Effect.sync(() =>
      document.querySelector(SHEET_CONTENT_SELECTOR)?.scrollTo({ top: 0, behavior: "instant" }),
    );
    return Message.CompletedShowFaceFromTop();
  }),
});

/**
 * Gives the focus to the island's control for the queue, once the column it
 * opened is closed by the column's own control: what held the focus went
 * with the column.
 */
export const FocusQueueControl = Command.define("FocusQueueControl", {
  messages: [Message.CompletedFocusQueueControl],
  execute: Dom.focus(`#${QUEUE_CONTROL_ID}`, { preventScroll: true }).pipe(
    Effect.ignore,
    Effect.as(Message.CompletedFocusQueueControl()),
  ),
});
