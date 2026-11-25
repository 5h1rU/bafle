/**
 * What the document says while a change of page is one the browser has
 * already shown: a move through the history that it drew itself, as the
 * swipe from the screen's edge is drawn. The page it leads to is then in
 * view before the app has drawn it, and whatever the app set moving on
 * drawing it (a page coming in, the navigation's mark going to its item,
 * the dock drawing back) would be seen to happen a second time, after the
 * fact. While this is said, nothing is set moving: the style sheet holds
 * every transition, and what moves by script asks here first.
 *
 * `entry.ts` says it and takes it back: it is what hears the browser.
 */
export const SHOWN_BY_BROWSER_ATTRIBUTE = "data-shown-by-browser";

export const isShownByBrowser = (): boolean =>
  document.documentElement.hasAttribute(SHOWN_BY_BROWSER_ATTRIBUTE);
