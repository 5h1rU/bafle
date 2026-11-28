import type { Menu } from "@foldkit/ui";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import { Update } from "foldkit";
import { modifyFields } from "foldkit/struct";
import type { QueuePlace } from "../player/model.ts";
import { WaitToClearDone } from "./command.ts";
import { Message, OutMessage } from "./message.ts";
import { type Model, type RowAction, type RowId, RowMenu, menuOf, rowMenuId } from "./model.ts";

// UPDATE

type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, OutMessage>;
type StepWithOutMessage = Update.StepWithOutMessage<Model, Message, OutMessage>;

const tellOfChoice =
  (rowId: RowId, action: RowAction): StepWithOutMessage =>
  (model) => ({ model, outMessage: OutMessage.Chose({ rowId, action }) });

/** The page a Message of a row's menu chooses, when it chooses one: the song's, or its album's. */
const maybePageChosen = (message: Menu.Message): Option.Option<"OpenSong" | "OpenAlbum"> =>
  message._tag === "SelectedItem" && (message.item === "OpenSong" || message.item === "OpenAlbum")
    ? Option.some(message.item)
    : Option.none();

// NOTE: a menu has no way of its own to be told how it is to come and go
// after it is made, so that is said on its Model as it is read, each time.
const foldMenu = Update.foldChildAt({
  update: RowMenu.update,
  readAt: (model: Model, rowId: RowId) =>
    Option.some(modifyFields(menuOf(model, rowId), { isAnimated: () => model.isAnimated })),
  writeAt: (model: Model, rowId: RowId, nextMenu: Menu.Model) =>
    modifyFields(model, { menus: HashMap.set(rowMenuId(rowId), nextMenu) }),
  toParentMessage: (rowId: RowId, message: Menu.Message): Message =>
    Message.GotMenuMessage({ rowId, message }),
  foldOutMessage: (rowId: RowId) => (chosen: Menu.OutMessage<RowAction>) =>
    tellOfChoice(rowId, chosen.value),
});

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    // NOTE: choosing a page from a row's menu is heard here and not by the
    // menu, which would close on it. The menu stays open while the page is
    // on its way: the item that was chosen says so, and says it if the page
    // fails to open, where a second press tries again. It is closed, with
    // every other, when the page takes the screen (`withMenusClosed`).
    GotMenuMessage: ({ rowId, message }) =>
      Option.match(maybePageChosen(message), {
        onNone: () => foldMenu(model, rowId, message),
        onSome: (action) => tellOfChoice(rowId, action)(model),
      }),
    CompletedWaitToClearDone: ({ turn }) => ({
      model:
        model.done.turn === turn && Option.isSome(model.done.maybeRow)
          ? modifyFields(model, { done: () => ({ turn, maybeRow: Option.none() }) })
          : model,
    }),
  });

/**
 * A row's track was put in the queue: its control shows that it was done,
 * for as long as `WaitToClearDone` waits.
 */
export const showQueued = (
  model: Model,
  queued: Readonly<{ rowId: RowId; place: QueuePlace }>,
): Update.Return<Model, Message> => {
  const turn = model.done.turn + 1;

  return {
    model: modifyFields(model, {
      done: () => ({
        turn,
        maybeRow: Option.some({
          from: queued.rowId.from,
          trackId: queued.rowId.trackId,
          place: queued.place,
        }),
      }),
    }),
    commands: [WaitToClearDone({ turn })],
  };
};

/** The rows are told how the listener last did something: with a pointer, or with the keys. */
export const informInputMethod = (
  model: Model,
  isByPointer: boolean,
): Update.Return<Model, Message> => ({
  model: model.isAnimated === isByPointer ? model : modifyFields(model, { isAnimated: () => isByPointer }),
});
