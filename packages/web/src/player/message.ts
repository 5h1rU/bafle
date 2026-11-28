import { Track, TrackId } from "@bafle/domain/Catalog/Track";
import { DragAndDrop, Menu, Slider } from "@foldkit/ui";
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
  /** The island's own way to the queue, on a desktop's screen: it opens the queue beside the page, and closes it. */
  ClickedIslandQueue: {},
  /** The control at the head of the queue's column. */
  ClickedCloseQueue: {},
  /** The name at the head of the face that says what the catalog knows of the track: it leads back to the song. */
  ClickedDetails: {},
  ClickedQueueItem: { index: Schema.Int, trackId: TrackId },
  ClickedTryAgain: {},
  PressedMediaKey: { key: MediaKey },
  /** The system's own bar for the sound, on a lock screen or a headset's display, was moved to another place. */
  MovedMediaPosition: { positionSeconds: Schema.Number },
  GotSeekSliderMessage: { message: Slider.Message },
  GotMoreMenuMessage: { message: Menu.Message },
  GotQueueDragMessage: { message: DragAndDrop.Message },
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
  /** The line under the title, who the track is by, as it lies in the document: measured as the title is. */
  MeasuredArtist: { placePixels: Schema.Number, maybeTravelPixels: Schema.Option(Schema.Number) },
  CompletedWaitToTravelArtist: { run: Schema.Int },
  CompletedTravelArtist: { run: Schema.Int },
  CompletedDrawIslandFigure: {},
  CompletedFollowIslandPress: {},
  CompletedChangeIslandLightPace: {},
  CompletedStartIslandLight: {},
  CompletedShowFaceFromTop: {},
  CompletedFocusQueueControl: {},
});
export type Message = typeof Message.Type;

// OUT MESSAGE

/**
 * What the player tells whoever holds it. The player knows no pages and no
 * screens: what it cannot do itself it says, and its owner does it.
 */
export const OutMessage = defineMessageUnion({
  /** The listener chose the album from the player's menu. An album is a page, and pages are not the player's. */
  RequestedAlbum: {},
  /**
   * The listener chose the song's details from the player's menu. Where the
   * player expands they are a face of it, which its owner turns it to
   * (`showDetails`); where it does not, they are the track's own page.
   */
  RequestedSongDetails: {},
  /** Another track has become the one the player holds: chosen, or come by itself as the one before ended. */
  ChangedTrack: { maybeFromTrackId: Schema.Option(TrackId), trackId: TrackId },
});
export type OutMessage = typeof OutMessage.Type;
