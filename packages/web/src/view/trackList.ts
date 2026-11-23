import type { Track, TrackId, TrackSummary } from "@bafle/domain/Catalog/Track";
import { Button } from "@foldkit/ui";
import { clsx } from "clsx";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";
import { defineTaggedUnion } from "foldkit/schema";
import { LoadError } from "../catalog.ts";
import { Message } from "../message.ts";
import type { TrackData } from "../model.ts";
import { trackRouter } from "../route.ts";
import { artworkView, coverTransitionStyle } from "./artwork.ts";
import { reason } from "./feedback.ts";
import { spinnerIcon } from "./icon.ts";
import { type Presence, SECTION_HEADING_CLASS, TRACK_ROW_ATTRIBUTE } from "./layout.ts";

// VIEW

const SECONDS_PER_MINUTE = 60;

/** A track's length as a listener reads it: `4:07`. */
export const formatDuration = (durationSeconds: number): string => {
  const minutes = Math.floor(durationSeconds / SECONDS_PER_MINUTE);
  const seconds = durationSeconds % SECONDS_PER_MINUTE;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

export const TRACK_ROW_CLASS = "flex items-center gap-4 py-2.5";

/** The line under a row. It is not on the link itself, whose corners are rounded. */
export const TRACK_ROW_LINE_CLASS = "border-b border-line";

export const TRACK_THUMBNAIL_CLASS = "w-11 shrink-0";

export const explicitMarkerView = (h: HtmlBuilder<Message>): Html =>
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

/**
 * What a row has to say about opening its track. It is read from what the
 * catalog said of the track, so a row is in one state at a time: it cannot
 * be loading and failed at once.
 */
const RowState = defineTaggedUnion({
  Openable: {},
  Opening: {},
  Failed: { error: LoadError },
  NotAvailable: {},
});
type RowState = typeof RowState.Type;

/** A track held, or one being refreshed behind its page, opens at once: its row is a plain row. */
const rowStateOf = (trackData: TrackData): RowState => {
  const whenHeld = (maybeTrack: Option.Option<Track>): RowState =>
    Option.match(maybeTrack, {
      onNone: () => RowState.NotAvailable(),
      onSome: () => RowState.Openable(),
    });

  return AsyncData.match(trackData, {
    onIdle: () => RowState.Openable(),
    onLoading: () => RowState.Opening(),
    onFailure: (error) => RowState.Failed({ error }),
    onRefreshing: whenHeld,
    onStale: ({ data }) => whenHeld(data),
    onSuccess: whenHeld,
  });
};

/**
 * What a list of tracks needs to know of the page it is on: whether it is on
 * screen, and what the app holds about each of its tracks.
 */
export type TrackListContext = Readonly<{
  presence: Presence;
  trackDataOf: (trackId: TrackId) => TrackData;
}>;

/** What every row shows, whatever can be done with it. */
const rowContentView = (
  track: TrackSummary,
  maybePosition: Option.Option<number>,
  state: RowState,
  presence: Presence,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => [
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
    [h.Class(TRACK_THUMBNAIL_CLASS), h.Style(coverTransitionStyle(track.id, presence))],
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
    [h.Class("flex min-w-10 shrink-0 justify-end text-sm text-muted tabular-nums")],
    [
      // The spinner stands where the length was, so the row keeps its size while its track loads.
      RowState.guards.Opening(state)
        ? spinnerIcon("size-5 animate-spin motion-reduce:animate-pulse")
        : formatDuration(track.durationSeconds),
    ],
  ),
];

/**
 * A row is a link to its track, and the whole row is the target. It answers
 * a press at once, before anything has loaded: the URL does not move until
 * the track's page takes the screen, but the link is a real one, so it still
 * opens in a new tab.
 */
const linkRowView = (
  track: TrackSummary,
  maybePosition: Option.Option<number>,
  state: RowState,
  presence: Presence,
  h: HtmlBuilder<Message>,
): Html =>
  h.a(
    [
      h.Href(trackRouter({ trackId: track.id })),
      h.DataAttribute(TRACK_ROW_ATTRIBUTE, track.id),
      h.AriaBusy(RowState.guards.Opening(state)),
      h.Class(
        clsx(
          TRACK_ROW_CLASS,
          "-mx-2 touch-manipulation rounded-lg px-2 hover:bg-panel focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent active:bg-tile",
        ),
      ),
    ],
    rowContentView(track, maybePosition, state, presence, h),
  );

/**
 * The row of a track the catalog does not have. It is no longer something to
 * open, so it is not a link: nothing to press, nothing in the tab order. It
 * can still be given the focus, which the link it replaces was holding.
 */
const unavailableRowView = (
  track: TrackSummary,
  maybePosition: Option.Option<number>,
  state: RowState,
  presence: Presence,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [
      h.DataAttribute(TRACK_ROW_ATTRIBUTE, track.id),
      h.Tabindex(-1),
      h.Class(
        clsx(
          TRACK_ROW_CLASS,
          "-mx-2 rounded-lg px-2 opacity-60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
        ),
      ),
    ],
    rowContentView(track, maybePosition, state, presence, h),
  );

const notice = (state: RowState): string =>
  RowState.match(state, {
    Openable: () => "",
    Opening: () => "Opening…",
    Failed: ({ error }) => `This song could not be opened. ${reason(error)}`,
    NotAvailable: () => "This song is not available.",
  });

/** There can be several on a page, so each says which track it tries again. */
const tryAgainView = (track: TrackSummary, h: HtmlBuilder<Message>): Html =>
  Button.view(
    {
      onClick: Message.ClickedTryAgainOnTrack({ trackId: track.id }),
      toView: (attributes) =>
        h.button(
          [
            ...attributes.button,
            h.AriaLabel(`Try again: ${track.title}`),
            h.Class(
              "cursor-pointer rounded-full font-semibold text-accent underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            ),
          ],
          ["Try again"],
        ),
    },
    h,
  );

const isStatedOnScreen = RowState.isAnyOf(["Failed", "NotAvailable"]);

/**
 * Where a row says what became of opening its track: that it is opening, that
 * it failed, or that the track is gone. The words are a status: said politely
 * when they change, without taking the focus from the row. The place is there
 * whether or not there is anything to say, so that what is said is heard as a
 * change. While the track opens the spinner says it on screen, and the words
 * are only for assistive technology.
 */
const noticeView = (track: TrackSummary, state: RowState, h: HtmlBuilder<Message>): Html =>
  h.div(
    [
      h.Class(
        clsx("flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted", {
          "pb-2.5": isStatedOnScreen(state),
        }),
      ),
    ],
    [
      h.p(
        [h.Role("status"), h.Class(clsx({ "sr-only": !isStatedOnScreen(state) }))],
        [notice(state)],
      ),
      RowState.guards.Failed(state) ? tryAgainView(track, h) : h.empty,
    ],
  );

const trackRowView = (
  track: TrackSummary,
  maybePosition: Option.Option<number>,
  context: TrackListContext,
  h: HtmlBuilder<Message>,
): Html => {
  const state = rowStateOf(context.trackDataOf(track.id));

  return h.keyed("li")(
    track.id,
    [h.Class(TRACK_ROW_LINE_CLASS)],
    [
      RowState.guards.NotAvailable(state)
        ? unavailableRowView(track, maybePosition, state, context.presence, h)
        : linkRowView(track, maybePosition, state, context.presence, h),
      noticeView(track, state, h),
    ],
  );
};

/** Ranked lists number their rows: the order is the catalog's chart. */
export type TrackOrder = "Ranked" | "Unranked";

const trackListView = (
  labelledBy: string,
  order: TrackOrder,
  tracks: Array.NonEmptyReadonlyArray<TrackSummary>,
  context: TrackListContext,
  h: HtmlBuilder<Message>,
): Html =>
  order === "Ranked"
    ? h.ol(
        [h.Role("list"), h.AriaLabelledBy(labelledBy), h.Class("mt-2")],
        Array.map(tracks, (track, index) => trackRowView(track, Option.some(index + 1), context, h)),
      )
    : h.ul(
        [h.Role("list"), h.AriaLabelledBy(labelledBy), h.Class("mt-2")],
        Array.map(tracks, (track) => trackRowView(track, Option.none(), context, h)),
      );

/** A titled list of tracks, or nothing when there are none. */
export const maybeTrackSectionView = (
  id: string,
  title: string,
  order: TrackOrder,
  tracks: ReadonlyArray<TrackSummary>,
  context: TrackListContext,
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
            trackListView(id, order, listed, context, h),
          ],
        ),
      ),
  });
