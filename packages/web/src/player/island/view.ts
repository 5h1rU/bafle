import { clsx } from "clsx";
import * as Option from "effect/Option";
import { Submodel } from "foldkit";
import type { Html } from "foldkit/html";
import * as Marquee from "../../marquee/index.ts";
import type { Screen } from "../../screen.ts";
import { islandFigureView } from "./figure.ts";
import { Message } from "./message.ts";
import type { Model } from "./model.ts";
import {
  DrawFigure,
  FollowPress,
  ISLAND_CHIN_ATTRIBUTE,
  ISLAND_SURFACE_ATTRIBUTE,
} from "./mount.ts";

// VIEW

/**
 * What the island is drawn with. The island is its figure, its light and
 * its two lines of words: what the words say, and everything else that
 * stands on it, is its owner's.
 * - `id`: the id the island goes by in the document. Under the sheet it has
 *   none (`isUnderSheet`).
 * - `sound`: what the sound is doing, in its owner's own word for it, said
 *   on the island for whoever reads the document.
 * - `maybeCover`: the picture the figure takes its colours from.
 * - `trackId`, `title`, `artist`: the track the words are of. Another track's
 *   words are other pieces, which come in place of these.
 * - `maybeNotice`: a few words that stand where the artist was, when
 *   something has to be said that the island's controls cannot.
 * - `toBody`: draws the island's body round its words: what stands before
 *   them, and whether they lead anywhere.
 * - `toControls`: what stands on the island's surface after its body.
 * - `toFoot`: what stands under the surface, and is no part of what a press
 *   swells.
 */
export type ViewInputs = Readonly<{
  id: string;
  label: string;
  screen: Screen;
  /**
   * Whether the island is drawn under the expanded player's sheet, which is
   * on its way off the screen. It is then a picture of the island to come:
   * out of reach, and with no name in a view transition, since the player on
   * the sheet is the one that carries the names.
   */
  isUnderSheet: boolean;
  sound: string;
  maybeCover: string | undefined;
  trackId: string;
  title: string;
  artist: string;
  maybeNotice: Option.Option<string>;
  toBody: (words: ReadonlyArray<Html>) => Html;
  toControls: () => ReadonlyArray<Html>;
  toFoot: () => ReadonlyArray<Html>;
}>;

/**
 * Where the island stands: over the navigation, and in its row, between the
 * circle and Search, once the navigation has drawn back. `dock-island` is
 * what the style sheet times its way by (view/dock.css).
 */
const PLACE_CLASS =
  "dock-island absolute right-5 left-5 z-30 flex text-on-island max-md:w-[calc(100%-2.5rem)] minimized:w-[calc(100%-9.75rem)] minimized:transform-[translate(3.625rem,3.875rem)] md:right-6 md:left-6 md:mx-auto md:max-w-2xl";

/**
 * The island's surface: what its layers and its pieces stand in. A press
 * swells all of it a little, quickly, and it comes back on the island's own
 * spring, whatever the dock is doing (`data-pressed`, from `FollowPress`).
 */
const SURFACE_CLASS =
  "relative isolate flex w-full items-center motion-safe:transition-[scale] motion-safe:duration-[280ms] motion-safe:ease-(--ease-island-out) motion-safe:data-pressed:scale-[1.025_1.055] motion-safe:data-pressed:duration-[85ms] motion-safe:data-pressed:ease-[ease-out] keyboard:transition-none!";

/**
 * The island's box. On a compact screen it is as high as its body and stands
 * over the navigation. On a desktop's it is taller by the chin under its
 * body, where the progress of the sound lies (design/desktop.pen): the body,
 * with the cover, the words and the controls, is the top of that box, and
 * the chin hangs below where the island's foot was. The box is as high as
 * the two together so that a picture of it taken for a view transition has
 * all of it.
 */
const BOX_CLASS: Readonly<Record<Screen, string>> = {
  Compact: "bottom-[5.125rem] h-11 items-center md:bottom-[max(1rem,env(safe-area-inset-bottom))]",
  Desktop: "bottom-[max(0.6875rem,env(safe-area-inset-bottom))] h-17.25 items-start",
};

/**
 * The island's words. They arrive with a short fade when the track changes;
 * the island itself stays where it is. Under the title stands the artist, or
 * what happened to the sound when that needs saying.
 */
export const view = Submodel.defineView<Model, Message, ViewInputs>((model, viewInputs, h) => {
  const { isUnderSheet } = viewInputs;
  const isDesktop = viewInputs.screen === "Desktop";
  const words = [
    // NOTE: keyed by the track, so another track's words are another
    // element; and not by the track's id alone, which is the key of the
    // cover beside them.
    h.keyed("span")(
      `${viewInputs.trackId}/words`,
      [
        h.Class(
          "island-words block min-w-0 transition-opacity duration-200 starting:opacity-0 motion-reduce:transition-none keyboard:transition-none!",
        ),
      ],
      [
        h.submodel({
          slotId: "title",
          model: model.title,
          view: Marquee.view,
          viewInputs: {
            name: "title",
            words: viewInputs.title,
            className: "text-15 leading-tight font-bold",
          },
          toParentMessage: (message) => Message.GotTitleMessage({ message }),
        }),
        Option.match(viewInputs.maybeNotice, {
          onNone: () =>
            h.submodel({
              slotId: "artist",
              model: model.artist,
              view: Marquee.view,
              viewInputs: {
                name: "artist",
                words: viewInputs.artist,
                className: "mt-0.5 text-xs leading-tight tracking-wide text-island-muted",
              },
              toParentMessage: (message) => Message.GotArtistMessage({ message }),
            }),
          onSome: (notice) =>
            h.span(
              [
                h.DataAttribute("notice", ""),
                h.Class("mt-0.5 block truncate text-xs leading-tight text-island-light"),
              ],
              [notice],
            ),
        }),
      ],
    ),
  ];

  // NOTE: under the sheet the island gives up its id and its names: the
  // player on the sheet has them, and two pieces by one name end a view
  // transition before it starts. `data-under-sheet` takes the names of its
  // light and its shadow too (figure.ts).
  return h.section(
    [
      ...(isUnderSheet ? [h.DataAttribute("under-sheet", "")] : [h.Id(viewInputs.id)]),
      h.AriaLabel(viewInputs.label),
      h.Inert(isUnderSheet),
      h.DataAttribute("layout", "island"),
      h.DataAttribute("playback", viewInputs.sound),
      // The figure has a chin on a desktop's screen: read as it is drawn.
      ...(isDesktop ? [h.DataAttribute(ISLAND_CHIN_ATTRIBUTE, "")] : []),
      h.OnMount(DrawFigure()),
      h.Class(clsx(PLACE_CLASS, BOX_CLASS[viewInputs.screen])),
    ],
    [
      h.div(
        [
          h.OnMount(FollowPress()),
          h.DataAttribute(ISLAND_SURFACE_ATTRIBUTE, ""),
          h.Class(clsx(SURFACE_CLASS, isDesktop ? "h-11" : "h-full")),
        ],
        [
          ...islandFigureView(viewInputs.maybeCover, model.light, h),
          viewInputs.toBody(words),
          ...viewInputs.toControls(),
        ],
      ),
      ...viewInputs.toFoot(),
    ],
  );
});
