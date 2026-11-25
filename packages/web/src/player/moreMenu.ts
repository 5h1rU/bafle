import { Menu } from "@foldkit/ui";
import * as Schema from "effect/Schema";

// THE PLAYER'S MENU

// Under the controls of the expanded player is a control, three dots, that
// opens a menu of what else can be done with the track that is playing, as
// the control at the end of a row does for the row's track. What it offers
// is what would otherwise have to be laid out on the sheet, under the
// controls, for the listener to scroll to.

/**
 * What the player's menu can offer: the page of the album the track is on,
 * and what the catalog knows of the track, which is a face of the player.
 */
export const PlayerAction = Schema.Literals(["OpenAlbum", "SongDetails"]);
export type PlayerAction = typeof PlayerAction.Type;

export const MoreMenu = Menu.create<PlayerAction>();

export const MORE_MENU_ID = "player-more";

/** The menu as a session starts with it: closed. */
export const initialMoreMenu: Menu.Model = Menu.init({ id: MORE_MENU_ID, isAnimated: true });
