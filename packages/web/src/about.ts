import { Popover } from "@foldkit/ui";

// WHO MADE THE APP

// The app says who made it, and where they are found. Beside the page, where
// the navigation is a column, that stands at the column's foot. On a narrow
// screen there is no such column, and Home has a control at its head that
// opens the same words (`view/about.ts`).

export const AUTHOR = "Felipe Janer";

/** A place the author is found: what the place is called, what they are called there, and its address. */
export type AuthorPlace = "X" | "LinkedIn";

export const AUTHOR_PLACES: ReadonlyArray<AuthorPlace> = ["X", "LinkedIn"];

export const AUTHOR_HANDLES: Readonly<Record<AuthorPlace, string>> = {
  X: "@5h1rU",
  LinkedIn: "felipejaner",
};

export const AUTHOR_HREFS: Readonly<Record<AuthorPlace, string>> = {
  X: "https://x.com/5h1rU",
  LinkedIn: "https://www.linkedin.com/in/felipejaner",
};

export const ABOUT_ID = "about";

/** What Home's control opens, as the app starts with it: closed. */
export const initialAbout: Popover.Model = Popover.init({ id: ABOUT_ID, isAnimated: true });
