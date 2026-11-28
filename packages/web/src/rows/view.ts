import type { Menu } from "@foldkit/ui";
import { Submodel } from "foldkit";
import { Message } from "./message.ts";
import { type Model, type RowAction, type RowId, RowMenu, menuOf } from "./model.ts";

// VIEW

/**
 * What a row's menu is drawn with: the row it is the menu of, and what its
 * list wants it to offer and to look like, as any menu is told.
 */
export type MenuInputs = Menu.ViewInputs<RowAction> & Readonly<{ rowId: RowId }>;

/** The menu at the end of a row: one of the rows' own, found by the row's id. */
export const menuView = Submodel.defineView<Model, Message, MenuInputs>((model, viewInputs, h) => {
  const { rowId, ...menuInputs } = viewInputs;

  return h.submodel({
    slotId: "menu",
    model: menuOf(model, rowId),
    view: RowMenu.view,
    viewInputs: menuInputs,
    toParentMessage: (message) => Message.GotMenuMessage({ rowId, message }),
  });
});
