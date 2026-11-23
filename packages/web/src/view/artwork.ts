import type { Artwork } from "@bafle/domain/Catalog/Artwork";
import type { TrackId } from "@bafle/domain/Catalog/Track";
import { clsx } from "clsx";
import * as Option from "effect/Option";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "../message.ts";
import { noteIcon } from "./icon.ts";
import type { Presence } from "./layout.ts";

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

export const missingPictureView = (h: HtmlBuilder<Message>): Html =>
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

/**
 * A track's id as part of a CSS name. The catalog's ids are opaque, so every
 * character outside the plainest set is spelled by its code.
 */
const trackIdent = (trackId: TrackId): string =>
  trackId.replace(/[^A-Za-z0-9-]/g, (character) => `_${character.charCodeAt(0).toString(16)}_`);

/**
 * What makes a track's cover one element to a view transition, so the
 * browser moves it between its row and its page instead of fading one out
 * and the other in. The name must be on one element at a time: the page on
 * screen gives it, and pages kept behind it do not.
 */
export const coverTransitionStyle = (
  trackId: TrackId,
  presence: Presence,
): Readonly<Record<string, string>> =>
  presence === "OnScreen"
    ? {
        viewTransitionName: `track-cover-${trackIdent(trackId)}`,
        viewTransitionClass: "track-cover",
      }
    : {};

/**
 * A track's cover at the size of its page. The row the listener came from
 * has already loaded the small rendition, so that one is drawn at once, with
 * no wait for the network or for decoding; the large one is drawn over it
 * when it arrives. The box never stands empty and nothing flashes in.
 */
export const coverView = (
  trackId: TrackId,
  maybeArtwork: Option.Option<Artwork>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [
      h.Class("relative aspect-square overflow-hidden rounded-2xl bg-tile"),
      h.Style(coverTransitionStyle(trackId, "OnScreen")),
    ],
    Option.match(maybeArtwork, {
      onNone: () => [missingPictureView(h)],
      onSome: (artwork) => [
        h.img([
          h.Decoding("sync"),
          h.Src(artwork.small),
          h.Alt(""),
          h.Class("absolute inset-0 size-full object-cover"),
        ]),
        h.img([
          h.Decoding("async"),
          h.Fetchpriority("high"),
          h.Src(artwork.large),
          h.Alt(""),
          h.Class("absolute inset-0 size-full object-cover"),
        ]),
      ],
    }),
  );
