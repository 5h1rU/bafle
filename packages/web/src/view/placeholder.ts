import { clsx } from "clsx";
import * as Array from "effect/Array";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "../message.ts";
import type { ArtworkShape } from "./artwork.ts";
import { SECTION_HEADING_CLASS } from "./layout.ts";
import {
  SHELF_ROW_CLASS,
  SHELF_TILE_CLASS,
  TILE_GRID_CLASS,
  TILE_GRID_TILE_CLASS,
} from "./shelf.ts";

// VIEW

const SHELF_PLACEHOLDER_TILES = 8;
const GRID_PLACEHOLDER_TILES = 12;

/** A grey block standing in for content on its way. It keeps still under reduced motion. */
export const BLOCK_CLASS = "animate-pulse bg-tile motion-reduce:animate-none";

/** How many lines of text the tiles to come have under their picture. */
type TileLines = "OneLine" | "TwoLines";

const tilePlaceholderView = (
  shape: ArtworkShape,
  className: string,
  lines: TileLines,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Class(className)],
    [
      h.div([
        h.Class(
          clsx(BLOCK_CLASS, "aspect-square", {
            "rounded-full": shape === "Round",
            "rounded-lg": shape === "Square",
          }),
        ),
      ]),
      h.div([h.Class(clsx(BLOCK_CLASS, "mt-3 h-4 w-4/5 rounded"))]),
      lines === "TwoLines"
        ? h.div([h.Class(clsx(BLOCK_CLASS, "mt-2 h-4 w-3/5 rounded"))])
        : h.empty,
    ],
  );

/**
 * A shelf before its tiles are known: the real title, since that never
 * depends on the catalog, over blocks the size of the tiles to come.
 */
export const shelfPlaceholderView = (
  title: string,
  shape: ArtworkShape,
  h: HtmlBuilder<Message>,
): Html =>
  h.section(
    [],
    [
      h.h2([h.Class(SECTION_HEADING_CLASS)], [title]),
      h.div(
        [h.AriaHidden(true), h.Class(clsx(SHELF_ROW_CLASS, "overflow-x-hidden"))],
        Array.makeBy(SHELF_PLACEHOLDER_TILES, () =>
          tilePlaceholderView(shape, SHELF_TILE_CLASS, "TwoLines", h),
        ),
      ),
    ],
  );

/**
 * A shelf whose title depends on the reply too: a block where the title will
 * be, over blocks the size of the tiles to come, which have their title alone.
 */
export const untitledShelfPlaceholderView = (shape: ArtworkShape, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.AriaHidden(true)],
    [
      h.div([h.Class(clsx(BLOCK_CLASS, "h-6 w-32 rounded"))]),
      h.div(
        [h.Class(clsx(SHELF_ROW_CLASS, "overflow-x-hidden"))],
        Array.makeBy(SHELF_PLACEHOLDER_TILES, () =>
          tilePlaceholderView(shape, SHELF_TILE_CLASS, "OneLine", h),
        ),
      ),
    ],
  );

/** A grid of tiles before they are known: blocks the size of the tiles to come, which have their title alone. */
export const tileGridPlaceholderView = (shape: ArtworkShape, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.AriaHidden(true), h.Class(TILE_GRID_CLASS)],
    Array.makeBy(GRID_PLACEHOLDER_TILES, () =>
      tilePlaceholderView(shape, TILE_GRID_TILE_CLASS, "OneLine", h),
    ),
  );

/** A block where a heading will be, when even the heading depends on the reply. */
export const headingPlaceholderView = (h: HtmlBuilder<Message>): Html =>
  h.div([h.AriaHidden(true), h.Class(clsx(BLOCK_CLASS, "h-6 w-32 rounded"))]);
