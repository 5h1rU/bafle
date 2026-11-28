import { DragAndDrop } from "@foldkit/ui";
import * as Schema from "effect/Schema";

// MODEL

/**
 * Whether the queue stands open beside the page, on a screen with room for a
 * column of its own (`screen.ts`). It is the queue's and no list's: a queue
 * left open stays open when another list is played.
 */
export const Column = Schema.Literals(["Closed", "Open"]);
export type Column = typeof Column.Type;

/**
 * The queue as a thing on screen: the song of it being moved, if any, and
 * whether its column is open. Which songs are to come, and in what order, is
 * not here: that is whoever plays them, who is told when the listener
 * chooses one or moves one.
 */
export const Model = Schema.Struct({
  drag: DragAndDrop.Model,
  column: Column,
});
export type Model = typeof Model.Type;

/** The island's control for the queue, on a desktop's screen, and the column it opens. */
export const CONTROL_ID = "player-queue-control";
export const COLUMN_ID = "player-queue-column";

/** The id the queue's list goes by, to what moves its songs. */
export const CONTAINER_ID = "player-queue-list";

/** Nothing of the queue is being moved. */
const initialDrag: DragAndDrop.Model = DragAndDrop.init({ id: "player-queue-drag" });

export const init = (): Model => ({ drag: initialDrag, column: "Closed" });

/** A queue for a list just chosen: nothing of it is being moved, and its column is as it was. */
export const forNewList = (model: Model): Model =>
  model.drag === initialDrag ? model : { drag: initialDrag, column: model.column };

// READ

export const isColumnOpen = (model: Model): boolean => model.column === "Open";
