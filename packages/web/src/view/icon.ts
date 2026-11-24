import * as Array from "effect/Array";
import { type Html, inertHtml as ih } from "foldkit/html";

// VIEW

/** A 24-unit outline icon, hidden from assistive technology: the text beside it names the thing. */
const outlineIcon = (className: string, paths: ReadonlyArray<string>): Html =>
  ih.svg(
    [
      ih.AriaHidden(true),
      ih.Class(className),
      ih.Xmlns("http://www.w3.org/2000/svg"),
      ih.Fill("none"),
      ih.ViewBox("0 0 24 24"),
      ih.StrokeWidth("1.75"),
      ih.Stroke("currentColor"),
    ],
    Array.map(paths, (path) =>
      ih.path([ih.StrokeLinecap("round"), ih.StrokeLinejoin("round"), ih.D(path)]),
    ),
  );

export const homeIcon = (className: string): Html =>
  outlineIcon(className, ["M4 11.5 12 4l8 7.5", "M6 10v9.5h4.5V15h3v4.5H18V10"]);

export const newIcon = (className: string): Html =>
  outlineIcon(className, [
    "M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9L12 3.5Z",
    "M18.5 15.5v4M16.5 17.5h4",
  ]);

export const searchIcon = (className: string): Html =>
  outlineIcon(className, ["M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z", "M15.5 15.5 20 20"]);

/** Points the way back. */
export const backIcon = (className: string): Html =>
  outlineIcon(className, ["M14.5 5.5 8 12l6.5 6.5"]);

/** Stands where a picture would be when the catalog has none. */
export const noteIcon = (className: string): Html =>
  outlineIcon(className, [
    "M9 17.5V6l10-2v11.5",
    "M9 17.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z",
    "M19 15.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z",
  ]);

/** Three quarters of a ring. Spinning is the caller's class to add. */
export const spinnerIcon = (className: string): Html =>
  outlineIcon(className, ["M12 3.5a8.5 8.5 0 1 0 8.5 8.5"]);

/** A 24-unit filled icon, for the player's controls: shapes that read at a glance. */
const solidIcon = (className: string, paths: ReadonlyArray<string>): Html =>
  ih.svg(
    [
      ih.AriaHidden(true),
      ih.Class(className),
      ih.Xmlns("http://www.w3.org/2000/svg"),
      ih.Fill("currentColor"),
      ih.ViewBox("0 0 24 24"),
    ],
    Array.map(paths, (path) => ih.path([ih.D(path)])),
  );

export const playIcon = (className: string): Html => solidIcon(className, ["M8 5v14l11.5-7L8 5Z"]);

export const pauseIcon = (className: string): Html =>
  solidIcon(className, ["M7 5h3.5v14H7V5Z", "M13.5 5H17v14h-3.5V5Z"]);

export const nextIcon = (className: string): Html =>
  solidIcon(className, ["M6 6v12l9-6-9-6Z", "M16.5 6h2v12h-2V6Z"]);

export const previousIcon = (className: string): Html =>
  solidIcon(className, ["M18 6v12l-9-6 9-6Z", "M5.5 6h2v12h-2V6Z"]);

/** An arrow turning back on itself: do it again. */
export const retryIcon = (className: string): Html =>
  outlineIcon(className, ["M19 12a7 7 0 1 1-2.05-4.95", "M19 4.5V8h-3.5"]);

/** Points onward, to a page with more. */
export const forwardIcon = (className: string): Html =>
  outlineIcon(className, ["M9.5 5.5 16 12l-6.5 6.5"]);
