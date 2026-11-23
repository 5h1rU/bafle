import type { Artwork } from "@bafle/domain/Catalog/Artwork";
import { clsx } from "clsx";
import * as Option from "effect/Option";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "../message.ts";
import { noteIcon } from "./icon.ts";

// VIEW

export type ArtworkShape = "Square" | "Round";

/** Which of a picture's renditions to load: a list row's thumbnail or a shelf's tile. */
export type ArtworkSize = keyof Pick<Artwork, "small" | "medium">;

const pictureView = (url: string, h: HtmlBuilder<Message>): Html =>
  h.img([
    h.Loading("lazy"),
    h.Decoding("async"),
    h.Src(url),
    // The title sits beside every picture, so the picture itself says nothing new.
    h.Alt(""),
    h.Class("size-full object-cover"),
  ]);

const missingPictureView = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class("flex size-full items-center justify-center text-muted")],
    [noteIcon("size-2/5")],
  );

/**
 * A picture in a box that has its final size before the picture arrives: a
 * fixed ratio over a neutral fill, so nothing around it moves when it loads.
 * Without a picture the box holds a placeholder mark instead.
 */
export const artworkView = (
  maybeArtwork: Option.Option<Artwork>,
  shape: ArtworkShape,
  size: ArtworkSize,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [
      h.Class(
        clsx("aspect-square overflow-hidden bg-tile", {
          "rounded-full": shape === "Round",
          "rounded-lg": shape === "Square",
        }),
      ),
    ],
    [
      Option.match(maybeArtwork, {
        onNone: () => missingPictureView(h),
        onSome: (artwork) => pictureView(artwork[size], h),
      }),
    ],
  );
