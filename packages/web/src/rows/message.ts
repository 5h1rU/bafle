import { Menu } from "@foldkit/ui";
import * as Schema from "effect/Schema";
import { defineMessageUnion } from "foldkit/message";
import { RowAction, RowId } from "./model.ts";

// MESSAGE

export const Message = defineMessageUnion({
  GotMenuMessage: { rowId: RowId, message: Menu.Message },
  CompletedWaitToClearDone: { turn: Schema.Int },
});
export type Message = typeof Message.Type;

// OUT MESSAGE

/**
 * What the rows tell the app: that something was chosen from a row's menu.
 * A row knows no player and no pages, so nothing is done about it here.
 */
export const OutMessage = defineMessageUnion({
  Chose: { rowId: RowId, action: RowAction },
});
export type OutMessage = typeof OutMessage.Type;
