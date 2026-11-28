import { DragAndDrop } from "@foldkit/ui";
import * as Option from "effect/Option";
import { Update } from "foldkit";
import { modifyFields } from "foldkit/struct";
import { FocusControl } from "./command.ts";
import { Message, OutMessage } from "./message.ts";
import { type Model, forNewList } from "./model.ts";

// UPDATE

type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, OutMessage>;
type StepWithOutMessage = Update.StepWithOutMessage<Model, Message, OutMessage>;

/** The island's control for the queue, on a desktop's screen: it opens the column, and closes it. */
const toggleColumn = (model: Model): UpdateReturn => ({
  model: modifyFields(model, { column: (column) => (column === "Open" ? "Closed" : "Open") }),
});

/**
 * The column's own control closes it. What held the focus goes with the
 * column, so the control that opens it takes it: the listener is left where
 * they would open it again.
 */
const closeColumn = (model: Model): UpdateReturn =>
  model.column === "Closed"
    ? { model }
    : { model: modifyFields(model, { column: () => "Closed" }), commands: [FocusControl()] };

// NOTE: the component tells where a song was put down in two ways. Carried
// by its handle, the place is counted among all the rows of the list, the
// row carried among them, since that row is still in the list while it is
// carried. Moved with the keys, it is counted among the others only. Whoever
// holds the order wants the second, so the first is brought to it here.
const foldDrag = (wasCarried: boolean) =>
  Update.foldChild({
    update: DragAndDrop.update,
    read: (model: Model) => Option.some(model.drag),
    write: (model: Model, nextDrag: DragAndDrop.Model): Model =>
      nextDrag === model.drag ? model : modifyFields(model, { drag: () => nextDrag }),
    toParentMessage: (message: DragAndDrop.Message): Message => Message.GotDragMessage({ message }),
    foldOutMessage: DragAndDrop.OutMessage.match<StepWithOutMessage>({
      Reordered:
        ({ fromIndex, toIndex }) =>
        (model) => ({
          model,
          outMessage: OutMessage.MovedItem({
            fromIndex,
            toIndex: wasCarried && toIndex > fromIndex ? toIndex - 1 : toIndex,
          }),
        }),
      Cancelled: () => (model) => ({ model }),
    }),
  });

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    ClickedItem: ({ index, trackId }) => ({
      model,
      outMessage: OutMessage.ChoseItem({ index, trackId }),
    }),
    ClickedColumnControl: () => toggleColumn(model),
    ClickedCloseColumn: () => closeColumn(model),
    GotDragMessage: ({ message }) =>
      foldDrag(model.drag.dragState._tag === "Dragging")(model, message),
    CompletedFocusControl: () => ({ model }),
  });

/**
 * Another list has become what is played: nothing of the queue is being
 * moved any more, since what was being moved was a song of the list before.
 */
export const informNewList = (model: Model): Update.Return<Model, Message> => ({
  model: forNewList(model),
});
