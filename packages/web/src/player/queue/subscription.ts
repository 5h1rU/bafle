import { DragAndDrop } from "@foldkit/ui";
import * as Option from "effect/Option";
import { Subscription } from "foldkit";
import { Message } from "./message.ts";
import type { Model } from "./model.ts";

// SUBSCRIPTION

/**
 * A song of the queue taken up by its handle is carried over the whole
 * document, and one moved with the keys is moved by keys heard there.
 */
export const subscriptions = Subscription.lift(DragAndDrop.subscriptions)<Model, Message>({
  read: (model) => Option.some(model.drag),
  toParentMessage: (message) => Message.GotDragMessage({ message }),
});
