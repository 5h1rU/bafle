import { TrackId } from "@bafle/domain/Catalog/Track";
import { DragAndDrop } from "@foldkit/ui";
import * as Schema from "effect/Schema";
import { defineMessageUnion } from "foldkit/message";

// MESSAGE

export const Message = defineMessageUnion({
  ClickedItem: { index: Schema.Int, trackId: TrackId },
  /** The island's own way to the queue, on a desktop's screen: it opens the queue beside the page, and closes it. */
  ClickedColumnControl: {},
  /** The control at the head of the queue's column. */
  ClickedCloseColumn: {},
  GotDragMessage: { message: DragAndDrop.Message },
  CompletedFocusControl: {},
});
export type Message = typeof Message.Type;

// OUT MESSAGE

/**
 * What the queue tells whoever holds its order. The queue draws the songs
 * to come and lets the listener choose one or carry one elsewhere, and says
 * so: it changes no order and starts no sound itself.
 */
export const OutMessage = defineMessageUnion({
  ChoseItem: { index: Schema.Int, trackId: TrackId },
  /** A song was put down in another place: both places are counted among the others, the song moved left out. */
  MovedItem: { fromIndex: Schema.Int, toIndex: Schema.Int },
});
export type OutMessage = typeof OutMessage.Type;
