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
