import type { Track, TrackId, TrackSummary } from "@bafle/domain/Catalog/Track";
import { Button } from "@foldkit/ui";
import { clsx } from "clsx";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";
import { defineTaggedUnion } from "foldkit/schema";
import { LoadError } from "../catalog.ts";
import { Message, type PlayOrigin } from "../message.ts";
import type { TrackData } from "../model.ts";
import { isPlayable, type TrackStatus } from "../player/model.ts";
import { trackRouter } from "../route.ts";
import { artworkView, coverTransitionStyle } from "./artwork.ts";
import { reason } from "./feedback.ts";
import { forwardIcon, spinnerIcon } from "./icon.ts";
import { type Presence, SECTION_HEADING_CLASS, TRACK_ROW_ATTRIBUTE } from "./layout.ts";
import { formatDuration } from "./time.ts";

// VIEW

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
 * screen, which page it is, what the app holds about each of its tracks, and
 * what the player is doing with each.
 */
export type TrackListContext = Readonly<{
  presence: Presence;
  from: PlayOrigin;
  trackDataOf: (trackId: TrackId) => TrackData;
  statusOf: (trackId: TrackId) => TrackStatus;
}>;

const isInPlayer = (status: TrackStatus): boolean => status !== "Elsewhere";

const BAR_CLASS = "w-0.5 origin-bottom rounded-full bg-white";

/**
 * The mark of the track the player holds, over its cover. The bars move
 * while the engine says it sounds and lie low while it does not; a start
 * slow enough to mention turns a spinner instead. Under reduced motion the
 * bars keep still, tall for sound and low for silence.
 */
const nowPlayingMarkView = (status: TrackStatus, h: HtmlBuilder<Message>): Html => {
  if (status === "Elsewhere" || status === "Chosen" || status === "Failed") {
    return h.empty;
  }
  const isSounding = status === "Sounding";
  const bar = (delay: string): Html =>
    h.span([
      h.Class(
        clsx(BAR_CLASS, delay, {
          "h-3.5 animate-equalize motion-reduce:animate-none": isSounding,
          "h-1": !isSounding,
          "animate-pulse motion-reduce:animate-none": status === "Waiting",
        }),
      ),
    ]);

  return h.span(
    [
      h.AriaHidden(true),
      h.DataAttribute("now-playing", status),
      h.Class("absolute inset-0 flex items-end justify-center gap-0.5 rounded-lg bg-black/50 pb-3.5"),
    ],
    status === "Starting"
      ? [spinnerIcon("mb-[-0.125rem] size-5 animate-spin text-white motion-reduce:animate-pulse")]
      : [bar("[animation-delay:-600ms]"), bar("[animation-delay:-300ms]"), bar("")],
  );
};

/** What every row shows, whatever can be done with it. */
const rowContentView = (
  track: TrackSummary,
  maybePosition: Option.Option<number>,
  status: TrackStatus,
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
    [
      h.DataAttribute("cover", ""),
      h.Class(clsx(TRACK_THUMBNAIL_CLASS, "relative")),
      h.Style(coverTransitionStyle(track.id, { presence, isInPlayer: isInPlayer(status) })),
    ],
    [
      artworkView(Option.fromNullishOr(track.album.cover), "Square", "small", h),
      nowPlayingMarkView(status, h),
    ],
  ),
  h.div(
    [h.Class("min-w-0 flex-1 text-left")],
    [
      h.p(
        [h.Class(clsx("flex items-center font-medium", { "text-accent": isInPlayer(status) }))],
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
    [formatDuration(track.durationSeconds)],
  ),
];

/**
 * What the row's control is called. The name replaces what the row shows, so
 * it carries all of it: what a press does, the track, whether it is
 * explicit, who it is by and how long it is.
 */
const rowLabel = (track: TrackSummary, status: TrackStatus): string =>
  `${status === "Sounding" || status === "Waiting" ? "Pause" : "Play"}: ${track.title}${track.explicit ? ", explicit," : ""} by ${track.artist.name}, ${formatDuration(track.durationSeconds)}`;

const ROW_PART_CLASS = "flex min-w-0 flex-1 items-center gap-4 py-2.5 pl-2";

/**
 * Pressing a row plays its track, and the whole row but its last control is
 * the target. For the track the player holds, the row is that track's own
 * control: a press stops the sound or brings it back.
 */
const playRowView = (
  track: TrackSummary,
  maybePosition: Option.Option<number>,
  status: TrackStatus,
  context: TrackListContext,
  h: HtmlBuilder<Message>,
): Html =>
  Button.view(
    {
      onClick: Message.ClickedPlayTrack({ trackId: track.id, from: context.from }),
      toView: (attributes) =>
        h.button(
          [
            ...attributes.button,
            h.AriaLabel(rowLabel(track, status)),
            ...(isInPlayer(status) ? [h.AriaCurrent("true")] : []),
            h.AriaBusy(status === "Starting"),
            h.Class(
              clsx(
                ROW_PART_CLASS,
                "cursor-pointer touch-manipulation rounded-l-lg hover:bg-panel focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent active:bg-tile",
              ),
            ),
          ],
          rowContentView(track, maybePosition, status, context.presence, h),
        ),
    },
    h,
  );

/** A track with nothing to play: the row is there to be read, and is not a control. */
const silentRowView = (
  track: TrackSummary,
  maybePosition: Option.Option<number>,
  context: TrackListContext,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Class(ROW_PART_CLASS)],
    rowContentView(track, maybePosition, "Elsewhere", context.presence, h),
  );

const DETAILS_CLASS =
  "flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-full text-muted hover:bg-panel hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent active:bg-tile";

/**
 * The way to the track's page: a real link, so it opens in a new tab too.
 * It answers a press at once, before anything has loaded, by turning its
 * arrow into a spinner: the URL does not move until the page takes the screen.
 */
const detailsLinkView = (track: TrackSummary, state: RowState, h: HtmlBuilder<Message>): Html =>
  h.a(
    [
      h.Href(trackRouter({ trackId: track.id })),
      h.DataAttribute(TRACK_ROW_ATTRIBUTE, track.id),
      h.AriaLabel(`Details: ${track.title}`),
      h.AriaBusy(RowState.guards.Opening(state)),
      h.Class(DETAILS_CLASS),
    ],
    [
      RowState.guards.Opening(state)
        ? spinnerIcon("size-5 animate-spin motion-reduce:animate-pulse")
        : forwardIcon("size-5"),
    ],
  );

/**
 * Where the way to the page was, for a track the catalog does not have. It
 * is no longer something to open, so there is no link: nothing to press,
 * nothing in the tab order. It can still be given the focus the link held.
 */
const noDetailsView = (track: TrackSummary, h: HtmlBuilder<Message>): Html =>
  h.span([
    h.DataAttribute(TRACK_ROW_ATTRIBUTE, track.id),
    h.Tabindex(-1),
    h.Class(
      "size-11 shrink-0 rounded-full focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
    ),
  ]);

/**
 * What a row has to say in words, each sentence with whether it is shown or
 * only said. That a page is opening is only said: the spinner shows it.
 */
type Sentence = Readonly<{ words: string; isShown: boolean }>;

const sentences = (
  track: TrackSummary,
  state: RowState,
  status: TrackStatus,
): ReadonlyArray<Sentence> =>
  Array.getSomes([
    Option.liftPredicate<Sentence>(
      { words: "This song has no audio to play.", isShown: true },
      () => !isPlayable(track),
    ),
    Option.liftPredicate<Sentence>(
      { words: "This song could not be played.", isShown: true },
      () => status === "Failed",
    ),
    RowState.match<Option.Option<Sentence>>(state, {
      Openable: () => Option.none(),
      Opening: () => Option.some({ words: "Opening…", isShown: false }),
      Failed: ({ error }) =>
        Option.some({ words: `This song could not be opened. ${reason(error)}`, isShown: true }),
      NotAvailable: () => Option.some({ words: "This song is not available.", isShown: true }),
    }),
  ]);

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

/**
 * Where a row says what became of its track: that its page is opening, that
 * it failed to open, that the track is gone, that it has nothing to play, or
 * that it could not be played. The words are a status: said politely when
 * they change, without taking the focus. The place is there whether or not
 * there is anything to say, so that what is said is heard as a change.
 */
const noticeView = (
  track: TrackSummary,
  state: RowState,
  status: TrackStatus,
  h: HtmlBuilder<Message>,
): Html => {
  const said = sentences(track, state, status);
  const isShown = Array.some(said, (sentence) => sentence.isShown);

  return h.div(
    [
      h.Class(
        clsx("flex flex-wrap items-center gap-x-3 gap-y-1 px-2 text-sm text-muted", {
          "pb-2.5": isShown,
        }),
      ),
    ],
    [
      h.p(
        [h.Role("status"), h.Class(clsx({ "sr-only": !isShown }))],
        [Array.join(Array.map(said, (sentence) => sentence.words), " ")],
      ),
      RowState.guards.Failed(state) ? tryAgainView(track, h) : h.empty,
    ],
  );
};

/**
 * A row: its control, its link, and under them what it has to say. The row
 * of the track the player holds is tinted from the tap on, before the engine
 * has said anything: that is how it shows it was chosen.
 */
const trackRowView = (
  track: TrackSummary,
  maybePosition: Option.Option<number>,
  context: TrackListContext,
  h: HtmlBuilder<Message>,
): Html => {
  const state = rowStateOf(context.trackDataOf(track.id));
  const status = context.statusOf(track.id);

  return h.keyed("li")(
    track.id,
    [h.Class(TRACK_ROW_LINE_CLASS)],
    [
      h.div(
        [
          h.DataAttribute("track", track.id),
          h.Class(
            clsx("-mx-2 flex items-center rounded-lg transition-colors duration-150", {
              "bg-accent-wash": isInPlayer(status),
            }),
          ),
        ],
        [
          isPlayable(track)
            ? playRowView(track, maybePosition, status, context, h)
            : silentRowView(track, maybePosition, context, h),
          RowState.guards.NotAvailable(state)
            ? noDetailsView(track, h)
            : detailsLinkView(track, state, h),
        ],
      ),
      noticeView(track, state, status, h),
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
