import * as Schema from "effect/Schema";

// SCREEN

/**
 * How much room the app has, where that changes more than a style sheet can
 * say. On a compact screen the player expands into a sheet over the page, and
 * its queue is a face of that sheet. On a desktop's there is room for three
 * columns, the navigation, the page and the queue: the island stays an
 * island, with controls of its own for what the sheet would have held, and
 * the queue opens beside the page.
 *
 * It is not the same line as the one the navigation moves at. The navigation
 * goes from the foot of the screen to its side at 48rem, and that is the
 * style sheet's alone; between there and a desktop's width the player is
 * still a sheet.
 */
export const Screen = Schema.Literals(["Compact", "Desktop"]);
export type Screen = typeof Screen.Type;

/** From this width on the screen is a desktop's: the width the style sheet calls `lg`. */
export const DESKTOP_QUERY = "(width >= 64rem)";
