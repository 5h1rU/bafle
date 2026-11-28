import type { Update } from "foldkit";
import { modifyFields } from "foldkit/struct";
import { Message, OutMessage } from "./message.ts";
import type { Model } from "./model.ts";
import { SlideAway } from "./mount.ts";

// UPDATE

type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, OutMessage>;

/** The listener asked for the sheet to go, and it has not moved: its owner says how it goes. */
const askToClose = (model: Model): UpdateReturn => ({
  model,
  outMessage: OutMessage.RequestedClose(),
});

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    ChangedReach: ({ reach }) => {
      if (reach === model.reach) {
        return { model };
      }
      const next = modifyFields(model, { reach: () => reach });
      return reach === "Gone" ? { model: next, outMessage: OutMessage.Left() } : { model: next };
    },
    PressedEscape: () => model.dismissedByKeyboard
      ? { model }
      : askToClose(modifyFields(model, { dismissedByKeyboard: () => true })),
    ClickedClose: () => askToClose(model),
    CompletedSlideAway: () => ({ model }),
  });

/**
 * Send the sheet away by its edge. Its owner hears `Left` when it is off the
 * screen, as of a sheet the listener swiped away.
 */
export const leave = (model: Model): UpdateReturn => ({
  model,
  commands: [SlideAway({ id: model.id, edge: model.edge })],
});
