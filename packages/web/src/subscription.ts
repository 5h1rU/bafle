import * as Option from "effect/Option";
import { Subscription } from "foldkit";
import { Message } from "./message.ts";
import type { Model } from "./model.ts";
import * as Player from "./player/index.ts";

// SUBSCRIPTION

/** The player's own: the engine's reports, the system's media keys, the drag of its progress bar. */
export const subscriptions = Subscription.lift(Player.subscriptions)<Model, Message>({
  read: (model) => Option.some(model.player),
  toParentMessage: (message) => Message.GotPlayerMessage({ message }),
});
