import type { TrackId } from "@bafle/domain/Catalog/Track";
import { Menu } from "@foldkit/ui";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { PlayOrigin } from "./message.ts";

// ROW MENU

// Every row of a list ends in a control that opens a menu of what can be
// done with its track besides playing it, which is what a press of the row
// does. The menu is Foldkit UI's, one for each row, and each keeps its own
// Model: whether it is open, which of its items is active.

/**
 * What a row's menu can offer. Not every row offers all of it: a track is
 * queued only after something else is playing, and its page is opened only
 * while the catalog has it.
 */
export const RowAction = Schema.Literals(["PlayNext", "AddToQueue", "OpenSong"]);
export type RowAction = typeof RowAction.Type;

export const RowMenu = Menu.create<RowAction>();

/** A row: the page it is on and its track. The same track can be listed on two pages at once. */
export type RowRef = Readonly<{ from: PlayOrigin; trackId: TrackId }>;

/** The id of a row's menu, and what it is kept under. */
export const rowMenuId = ({ from, trackId }: RowRef): string =>
  `row-menu-${from.toLowerCase()}-${trackId}`;

export type RowMenus = HashMap.HashMap<string, Menu.Model>;

/**
 * A row's menu. One that has never been touched is not kept: it is a closed
 * menu like any other.
 */
// NOTE: not `isModal`. A modal menu makes everything but its button and its
// items inert, its own backdrop included, so a press outside would close it
// only by taking the focus from it. Here the backdrop hears the press itself,
// and does what is wanted of a modal one besides: it covers the screen, so
// the list behind keeps still and a press anywhere else only closes the menu.
export const rowMenuIn = (menus: RowMenus, row: RowRef): Menu.Model =>
  Option.getOrElse(HashMap.get(menus, rowMenuId(row)), () =>
    Menu.init({ id: rowMenuId(row), isAnimated: true }),
  );
