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

/**
 * A flame: what is new is what is hot now. Not a sparkle, which every app
 * that has an assistant in it has taken for that.
 */
export const newIcon = (className: string): Html =>
  outlineIcon(className, [
    "M12 2.75c.6 2.9 2.2 4.6 3.9 6.4 1.5 1.6 2.6 3.4 2.6 5.6a6.5 6.5 0 0 1-13 0c0-1.9.8-3.5 1.9-4.7.3 1.3 1 2.2 2 2.7-.3-3.6.6-6.9 2.6-10Z",
    "M12 20.5a2.75 2.75 0 0 0 2.75-2.75c0-1.4-1-2.3-2.75-4-1.75 1.7-2.75 2.6-2.75 4A2.75 2.75 0 0 0 12 20.5Z",
  ]);

/** Four tiles: music sorted into its kinds. */
export const genresIcon = (className: string): Html =>
  outlineIcon(className, [
    "M4.5 4.5h6v6h-6v-6Z",
    "M13.5 4.5h6v6h-6v-6Z",
    "M4.5 13.5h6v6h-6v-6Z",
    "M13.5 13.5h6v6h-6v-6Z",
  ]);

/** A mast and the waves it sends out: a station on air. */
export const radioIcon = (className: string): Html =>
  outlineIcon(className, [
    "M12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
    "M12 13.5V20",
    "M8.8 15.2a4.5 4.5 0 0 1 0-6.4",
    "M15.2 8.8a4.5 4.5 0 0 1 0 6.4",
    "M6 18a8.5 8.5 0 0 1 0-12",
    "M18 6a8.5 8.5 0 0 1 0 12",
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

// NOTE: the three glyphs of the transport are the design's own
// (design/album.pen), with their corners rounded: one shape each, so a
// glyph is the same on the island and in the expanded player.
export const pauseIcon = (className: string): Html =>
  solidIcon(className, [
    "M5 4q0-1 1-1h3q1 0 1 1v16q0 1-1 1h-3q-1 0-1-1z m9 0q0-1 1-1h3q1 0 1 1v16q0 1-1 1h-3q-1 0-1-1z",
  ]);

export const nextIcon = (className: string): Html =>
  solidIcon(className, [
    "M2 5q0-2 2-1l11 6.5q2 1.5 0 3l-11 6.5q-2 1-2-1z m15 0q0-1 1-1h2q1 0 1 1v14q0 1-1 1h-2q-1 0-1-1z",
  ]);

export const previousIcon = (className: string): Html =>
  solidIcon(className, [
    "M22 5q0-2-2-1l-11 6.5q-2 1.5 0 3l11 6.5q2 1 2-1z m-15 0q0-1-1-1h-2q-1 0-1 1v14q0 1 1 1h2q1 0 1-1z",
  ]);

/** An arrow turning back on itself: do it again. */
export const retryIcon = (className: string): Html =>
  outlineIcon(className, ["M19 12a7 7 0 1 1-2.05-4.95", "M19 4.5V8h-3.5"]);

/** Points onward, to a page with more. */
export const forwardIcon = (className: string): Html =>
  outlineIcon(className, ["M9.5 5.5 16 12l-6.5 6.5"]);

/** Three dots in a row: there is more that can be done here. */
export const moreIcon = (className: string): Html =>
  solidIcon(className, [
    "M5.5 10.25a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5Z",
    "M12 10.25a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5Z",
    "M18.5 10.25a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5Z",
  ]);

/** Done. */
export const checkIcon = (className: string): Html =>
  outlineIcon(className, ["M5.5 12.5 10 17l8.5-10"]);

/** A list with a track put at its head: it plays next. */
export const playNextIcon = (className: string): Html =>
  outlineIcon(className, ["M4 4.75v5.5l4.5-2.75L4 4.75Z", "M12 7.5h8", "M4 13h16", "M4 18h16"]);

/** A list with a note at its end: the songs that are to play. */
export const queueIcon = (className: string): Html =>
  outlineIcon(className, [
    "M16 5H3",
    "M11 12H3",
    "M11 19H3",
    "M21 16V5",
    "M21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  ]);

/** A list with a track put at its foot: it plays after the rest. */
export const playLastIcon = (className: string): Html =>
  outlineIcon(className, ["M4 6h16", "M4 11h16", "M4 13.75v5.5l4.5-2.75L4 13.75Z", "M12 16.5h8"]);

/** A record: the album a track is on. */
export const albumIcon = (className: string): Html =>
  outlineIcon(className, [
    "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Z",
    "M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  ]);

/** More about this one thing. */
export const detailsIcon = (className: string): Html =>
  outlineIcon(className, [
    "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Z",
    "M12 11v5.5",
    "M12 7.75v.01",
  ]);

/** Six dots, two by three: the handle of a row in the queue's column, where a pointer takes it up. */
export const gripDotsIcon = (className: string): Html =>
  solidIcon(className, [
    "M9.25 4.75a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z",
    "M14.75 4.75a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z",
    "M9.25 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z",
    "M14.75 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z",
    "M9.25 16.25a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z",
    "M14.75 16.25a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z",
  ]);

/** A cross: what it stands on is closed. */
export const closeIcon = (className: string): Html =>
  outlineIcon(className, ["M6.5 6.5 17.5 17.5", "M17.5 6.5 6.5 17.5"]);

/** Three bars: the handle a row of a list is taken up by, to be put elsewhere in it. */
export const gripIcon = (className: string): Html =>
  outlineIcon(className, ["M5 8.5h14", "M5 12h14", "M5 15.5h14"]);

