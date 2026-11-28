import type { Html, HtmlBuilder } from "foldkit/html";
import type { PlayerAction } from "../player/moreMenu.ts";
import type { RowAction } from "../rows/model.ts";
import { albumIcon, detailsIcon, playLastIcon, playNextIcon } from "./icon.ts";

// MENUS

// What every menu of the app looks like, whatever it offers and whichever
// component draws it: the one at the end of a row, the player's, and what
// Home's control opens. A menu is drawn in the document's body, over
// everything, and is placed by its component under the control that opens
// it; it grows out of the corner nearest that control.

export const MENU_CLASS =
  "z-50 min-w-60 origin-top-right data-[placement=top]:origin-bottom-right overflow-hidden rounded-2xl bg-canvas text-ink shadow-menu ring-1 ring-line outline-none transition-[scale,opacity] duration-150 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 motion-reduce:transition-none";

export const MENU_ITEM_CLASS =
  "flex cursor-pointer items-center justify-between gap-8 border-line px-4 py-3 select-none not-first:border-t data-[active]:bg-panel active:bg-tile";

/** The mark at the end of an item, for what the item does. */
export const MENU_ITEM_ICON_CLASS = "size-5 shrink-0 text-muted";

/**
 * What hears the press that closes a menu: a press anywhere else. It is over
 * the whole screen, so nothing under it is pressed or scrolled while the
 * menu is open.
 */
export const MENU_BACKDROP_CLASS = "fixed inset-0 z-40 touch-none";

// NOTE: the player's sheet is drawn over the pages at the height a menu's
// backdrop has (`z-40`): at that height the sheet lay over the backdrop of
// its own menu, and no press reached it. This one is over the sheet and
// under the menu.
export const MENU_BACKDROP_OVER_SHEET_CLASS = "fixed inset-0 z-[45] touch-none";

/** What a thing a menu offers is called, and its mark. */
export type ActionLook = Readonly<{ label: string; icon: (className: string) => Html }>;

/**
 * What can be done with a track, wherever it is offered: at the end of its
 * row, under the player's controls, on its own page. One name and one mark
 * for each, so the same thing is called the same everywhere.
 */
export const ACTION_LOOKS: Readonly<Record<RowAction | PlayerAction, ActionLook>> = {
  PlayNext: { label: "Play next", icon: playNextIcon },
  AddToQueue: { label: "Add to queue", icon: playLastIcon },
  OpenAlbum: { label: "Go to album", icon: albumIcon },
  OpenSong: { label: "Song details", icon: detailsIcon },
  SongDetails: { label: "Song details", icon: detailsIcon },
};

/** An item as it is at rest: its name, and its mark at the far end. */
export const menuItemContentView = <Message>(look: ActionLook, h: HtmlBuilder<Message>): Html =>
  h.div([h.Class("contents")], [h.span([], [look.label]), look.icon(MENU_ITEM_ICON_CLASS)]);
