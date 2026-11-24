import type { Track, TrackId, TrackSummary } from "@bafle/domain/Catalog/Track";
import { Button, type Menu } from "@foldkit/ui";
import { clsx } from "clsx";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import { childAttributes, type Html, type HtmlBuilder } from "foldkit/html";
import { defineTaggedUnion } from "foldkit/schema";
import { LoadError } from "../catalog.ts";
import { Message, type PlayOrigin } from "../message.ts";
import type { TrackData } from "../model.ts";
import { isPlayable, type QueuePlace, type TrackStatus } from "../player/model.ts";
import { type RowAction, RowMenu, rowMenuId } from "../rowMenu.ts";
import { artworkView, coverTransitionStyle } from "./artwork.ts";
import { reason } from "./feedback.ts";
import {
  checkIcon,
  detailsIcon,
  moreIcon,
  playLastIcon,
  playNextIcon,
  spinnerIcon,
} from "./icon.ts";
import { type Presence, SECTION_HEADING_CLASS, TRACK_ROW_ATTRIBUTE } from "./layout.ts";
import { formatDuration } from "./time.ts";

// VIEW

export const TRACK_ROW_CLASS = "flex items-center gap-4 py-2.5";

/**
 * A row, with the line under it. The line is the row's and not its
 * surface's, whose corners are rounded: styles.css hides it wherever it
 * would run into a surface that is lit, under the `track-row` names.
 */
export const TRACK_ROW_LINE_CLASS = "track-row";

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
 * screen, which page it is, what the app holds about each of its tracks,
 * what the player is doing with each and whether it holds anything at all,
 * each row's menu, and whether a row has just had its track queued.
 */
export type TrackListContext = Readonly<{
  presence: Presence;
  from: PlayOrigin;
  trackDataOf: (trackId: TrackId) => TrackData;
  statusOf: (trackId: TrackId) => TrackStatus;
  isPlayerHolding: boolean;
  menuOf: (trackId: TrackId) => Menu.Model;
  queuedOf: (trackId: TrackId) => Option.Option<QueuePlace>;
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
 * control: a press stops the sound or brings it back. The control has no
 * colour of its own: a press, or a pointer over it, lights the whole row,
 * the last control's place included, so the row answers as one piece.
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
                // A press held on the row is a press, not the start of picking out its words.
                "track-row-play cursor-pointer touch-manipulation rounded-lg select-none [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
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

const MORE_CLASS =
  "flex size-11 shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-full text-muted hover:bg-panel hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent active:bg-tile data-[open]:bg-tile data-[open]:text-ink";

/** Over the whole screen: nothing under it is pressed or scrolled while the menu is open. */
const MENU_BACKDROP_CLASS = "fixed inset-0 z-40 touch-none";

// NOTE: the menu is drawn in the document's body, over everything, and is
// placed by the component under the row's control. It grows out of the
// corner nearest that control.
const MENU_CLASS =
  "z-50 min-w-60 origin-top-right overflow-hidden rounded-2xl bg-canvas text-ink shadow-[0_10px_38px_rgb(0_0_0/0.22)] ring-1 ring-line outline-none transition duration-150 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 motion-reduce:transition-none";

const MENU_ITEM_CLASS =
  "flex cursor-pointer items-center justify-between gap-8 border-line px-4 py-3 select-none not-first:border-t data-[active]:bg-panel active:bg-tile";

type ActionLook = Readonly<{ label: string; icon: (className: string) => Html }>;

const ACTION_LOOKS: Readonly<Record<RowAction, ActionLook>> = {
  PlayNext: { label: "Play next", icon: playNextIcon },
  AddToQueue: { label: "Add to queue", icon: playLastIcon },
  OpenSong: { label: "Song details", icon: detailsIcon },
};

/**
 * What a row's menu offers for its track, in the order it is offered. A
 * track is queued once something else is playing: a queue is what comes
 * after a track. Its page is offered for as long as the catalog has it.
 */
const actionsOf = (
  track: TrackSummary,
  state: RowState,
  status: TrackStatus,
  context: TrackListContext,
): ReadonlyArray<RowAction> => [
  ...(isPlayable(track) && context.isPlayerHolding && !isInPlayer(status)
    ? (["PlayNext", "AddToQueue"] as const)
    : []),
  ...(RowState.guards.NotAvailable(state) ? [] : (["OpenSong"] as const)),
];

/**
 * What the row's last control shows. It answers at once what was chosen
 * from its menu: a spinner while the track's page is on its way, since the
 * URL does not move until the page takes the screen, and a tick for a moment
 * when the track was queued.
 */
const moreContentView = (state: RowState, maybeQueued: Option.Option<QueuePlace>): Html => {
  if (RowState.guards.Opening(state)) {
    return spinnerIcon("size-5 animate-spin motion-reduce:animate-pulse");
  }
  return Option.isSome(maybeQueued) ? checkIcon("size-5 text-accent") : moreIcon("size-5");
};

/**
 * The row's last control: what else can be done with its track. It is where
 * the row keeps the focus, so it carries the mark the focus is given back by.
 */
const rowMenuView = (
  track: TrackSummary,
  actions: Array.NonEmptyReadonlyArray<RowAction>,
  state: RowState,
  context: TrackListContext,
  h: HtmlBuilder<Message>,
): Html =>
  h.submodel({
    slotId: rowMenuId({ from: context.from, trackId: track.id }),
    model: context.menuOf(track.id),
    view: RowMenu.view,
    viewInputs: {
      items: actions,
      itemToConfig: (action) => ({
        className: MENU_ITEM_CLASS,
        content: h.div(
          [h.Class("contents")],
          [
            h.span([], [ACTION_LOOKS[action].label]),
            ACTION_LOOKS[action].icon("size-5 shrink-0 text-muted"),
          ],
        ),
      }),
      itemToSearchText: (action) => ACTION_LOOKS[action].label,
      ariaLabel: `More: ${track.title}`,
      buttonContent: moreContentView(state, context.queuedOf(track.id)),
      buttonClassName: MORE_CLASS,
      buttonAttributes: childAttributes([
        h.DataAttribute(TRACK_ROW_ATTRIBUTE, track.id),
        h.AriaBusy(RowState.guards.Opening(state)),
      ]),
      itemsClassName: MENU_CLASS,
      backdropClassName: MENU_BACKDROP_CLASS,
      anchor: { placement: "bottom-end", gap: 4, padding: 12 },
    },
    toParentMessage: (message) =>
      Message.GotRowMenuMessage({ from: context.from, trackId: track.id, message }),
  });

/**
 * Where the row's last control was, for a track there is nothing left to do
 * with but play it or read of it. There is nothing to press and nothing in
 * the tab order. It can still be given the focus the control held.
 */
const noMenuView = (track: TrackSummary, h: HtmlBuilder<Message>): Html =>
  h.span([
    h.DataAttribute(TRACK_ROW_ATTRIBUTE, track.id),
    h.Tabindex(-1),
    h.Class(
      "size-11 shrink-0 rounded-full focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
    ),
  ]);

/**
 * What a row has to say in words, each sentence with whether it is shown or
 * only said. That a page is opening is only said: the spinner shows it. So
 * is that the track was queued: the tick shows it.
 */
type Sentence = Readonly<{ words: string; isShown: boolean }>;

const sentences = (
  track: TrackSummary,
  state: RowState,
  status: TrackStatus,
  maybeQueued: Option.Option<QueuePlace>,
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
    Option.map(maybeQueued, (place) => ({
      words: place === "Next" ? "Plays next." : "Added to the queue.",
      isShown: false,
    })),
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
 * it failed to open, that the track is gone, that it has nothing to play,
 * that it could not be played, or that it was queued. The words are a status: said politely when
 * they change, without taking the focus. The place is there whether or not
 * there is anything to say, so that what is said is heard as a change.
 */
const noticeView = (
  track: TrackSummary,
  state: RowState,
  status: TrackStatus,
  maybeQueued: Option.Option<QueuePlace>,
  h: HtmlBuilder<Message>,
): Html => {
  const said = sentences(track, state, status, maybeQueued);
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
 * A row: its surface, with the control that plays and the control that
 * opens the menu, and under it what the row has to say. The surface of the
 * track the player holds is tinted from the tap on, before the engine has
 * said anything: that is how it shows it was chosen.
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
          ...(isInPlayer(status) ? [h.DataAttribute("in-player", "")] : []),
          h.Class("track-row-surface -mx-2 flex items-center"),
        ],
        [
          isPlayable(track)
            ? playRowView(track, maybePosition, status, context, h)
            : silentRowView(track, maybePosition, context, h),
          Array.match(actionsOf(track, state, status, context), {
            onEmpty: () => noMenuView(track, h),
            onNonEmpty: (actions) => rowMenuView(track, actions, state, context, h),
          }),
        ],
      ),
      noticeView(track, state, status, context.queuedOf(track.id), h),
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
