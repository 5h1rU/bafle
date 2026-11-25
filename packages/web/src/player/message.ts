import { Track, TrackId } from "@bafle/domain/Catalog/Track";
import { Slider } from "@foldkit/ui";
import * as Schema from "effect/Schema";
import { defineMessageUnion } from "foldkit/message";
import { EngineReport, StartOutcome } from "./audioEngine.ts";

// MESSAGE

/** The keys a headset, a keyboard or a lock screen has for a player. */
export const MediaKey = Schema.Literals(["Play", "Pause", "Next", "Previous"]);
export type MediaKey = typeof MediaKey.Type;

export const Message = defineMessageUnion({
  ClickedPlay: {},
  ClickedPause: {},
  ClickedNext: {},
  ClickedPrevious: {},
  ClickedQueue: {},
  ClickedEditQueue: {},
  ClickedQueueItem: { index: Schema.Int, trackId: TrackId },
  ClickedQueueEdit: {
    index: Schema.Int,
    trackId: TrackId,
    action: Schema.Literals(["Earlier", "Later", "Remove"]),
  },
  ClickedTryAgain: {},
  PressedMediaKey: { key: MediaKey },
  GotSeekSliderMessage: { message: Slider.Message },
  /** The engine's word. Everything the interface says of the sound comes from here. */
  UpdatedEngineStatus: { report: EngineReport },
  CompletedStartPlayback: { order: Schema.Int, outcome: StartOutcome },
  CompletedResumePlayback: { order: Schema.Int, outcome: StartOutcome },
  CompletedPausePlayback: {},
  CompletedSeekPlayback: {},
  CompletedWaitBeforeShowingActivity: { order: Schema.Int },
  SucceededRefreshSource: { order: Schema.Int, track: Track },
  FailedRefreshSource: { order: Schema.Int },
  CompletedPublishNowPlaying: {},
  /**
   * The island's title as it lies in the document: how wide its place is,
   * and how far one pass takes it, or nothing when it fits.
   */
  MeasuredTitle: { placePixels: Schema.Number, maybeTravelPixels: Schema.Option(Schema.Number) },
  CompletedWaitToTravelTitle: { run: Schema.Int },
  CompletedTravelTitle: { run: Schema.Int },
  CompletedDrawIslandFigure: {},
  CompletedFollowIslandPress: {},
  CompletedChangeIslandLightPace: {},
  CompletedStartIslandLight: {},
});
export type Message = typeof Message.Type;
