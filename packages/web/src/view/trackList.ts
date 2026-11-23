import type { TrackSummary } from "@bafle/domain/Catalog/Track";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "../message.ts";
import { artworkView } from "./artwork.ts";
import { SECTION_HEADING_CLASS } from "./layout.ts";

// VIEW

const SECONDS_PER_MINUTE = 60;

/** A track's length as a listener reads it: `4:07`. */
const formatDuration = (durationSeconds: number): string => {
  const minutes = Math.floor(durationSeconds / SECONDS_PER_MINUTE);
  const seconds = durationSeconds % SECONDS_PER_MINUTE;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

export const TRACK_ROW_CLASS = "flex items-center gap-4 border-b border-line py-2.5";

export const TRACK_THUMBNAIL_CLASS = "w-11 shrink-0";

const explicitMarkerView = (h: HtmlBuilder<Message>): Html =>
  h.span(
    [h.Class("ml-2 inline-flex shrink-0 items-center")],
    [
      h.span(
        [
          h.AriaHidden(true),
          h.Class("rounded-sm bg-muted px-1 text-[0.625rem] leading-4 font-bold text-canvas"),
        ],
        ["E"],
      ),
      h.span([h.Class("sr-only")], ["Explicit"]),
    ],
  );

const trackRowView = (
  track: TrackSummary,
  maybePosition: Option.Option<number>,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed("li")(
    track.id,
    [h.Class(TRACK_ROW_CLASS)],
    [
      Option.match(maybePosition, {
        onNone: () => h.empty,
        // Hidden from assistive technology: the ordered list already says the position.
        onSome: (position) =>
          h.span(
            [h.AriaHidden(true), h.Class("w-6 shrink-0 text-right text-sm text-muted tabular-nums")],
            [position.toString()],
          ),
      }),
      h.div(
        [h.Class(TRACK_THUMBNAIL_CLASS)],
        [artworkView(Option.fromNullishOr(track.album.cover), "Square", "small", h)],
      ),
      h.div(
        [h.Class("min-w-0 flex-1")],
        [
          h.p(
            [h.Class("flex items-center font-medium")],
            [
              h.span([h.Class("truncate")], [track.title]),
              track.explicit ? explicitMarkerView(h) : h.empty,
            ],
          ),
          h.p([h.Class("truncate text-sm text-muted")], [track.artist.name]),
        ],
      ),
      h.span(
        [h.Class("shrink-0 text-sm text-muted tabular-nums")],
        [formatDuration(track.durationSeconds)],
      ),
    ],
  );

/** Ranked lists number their rows: the order is the catalog's chart. */
export type TrackOrder = "Ranked" | "Unranked";

const trackListView = (
  labelledBy: string,
  order: TrackOrder,
  tracks: Array.NonEmptyReadonlyArray<TrackSummary>,
  h: HtmlBuilder<Message>,
): Html =>
  order === "Ranked"
    ? h.ol(
        [h.Role("list"), h.AriaLabelledBy(labelledBy), h.Class("mt-2")],
        Array.map(tracks, (track, index) => trackRowView(track, Option.some(index + 1), h)),
      )
    : h.ul(
        [h.Role("list"), h.AriaLabelledBy(labelledBy), h.Class("mt-2")],
        Array.map(tracks, (track) => trackRowView(track, Option.none(), h)),
      );

/** A titled list of tracks, or nothing when there are none. */
export const maybeTrackSectionView = (
  id: string,
  title: string,
  order: TrackOrder,
  tracks: ReadonlyArray<TrackSummary>,
  h: HtmlBuilder<Message>,
): Option.Option<Html> =>
  Array.match(tracks, {
    onEmpty: () => Option.none(),
    onNonEmpty: (listed) =>
      Option.some(
        h.section(
          [h.Class("max-w-3xl")],
          [
            h.h2([h.Id(id), h.Class(SECTION_HEADING_CLASS)], [title]),
            trackListView(id, order, listed, h),
          ],
        ),
      ),
  });
