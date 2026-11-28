import type { ArtistId } from "@bafle/domain/Catalog/Artist";
import type { AlbumId } from "@bafle/domain/Catalog/Album";
import type { TrackId, TrackSummary } from "@bafle/domain/Catalog/Track";
import { Button, type Menu } from "@foldkit/ui";
import { clsx } from "clsx";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import { type Html, type HtmlBuilder, childAttributes } from "foldkit/html";
import { defineTaggedUnion } from "foldkit/schema";
import { LoadError } from "../catalog.ts";
import { Message, type PlayOrigin } from "../message.ts";
import { type AlbumData, type TrackData, isKnownMissing } from "../model.ts";
import { type QueuePlace, type TrackStatus, isPlayable } from "../player/model.ts";
import { type RowAction, RowMenu, rowMenuId } from "../rowMenu.ts";
import {
  type PictureLoading,
  artworkView,
  coverTransitionStyle,
  flightAttributes,
} from "./artwork.ts";
import { iconControlClass } from "./control.ts";
import { reason, saidView } from "./feedback.ts";
import { alertIcon, checkIcon, moreIcon, retryIcon, spinnerIcon } from "./icon.ts";
import { type Presence, TRACK_ROW_ATTRIBUTE } from "./layout.ts";
import {
  ACTION_LOOKS,
  MENU_BACKDROP_CLASS,
  MENU_CLASS,
  MENU_ITEM_CLASS,
  MENU_ITEM_ICON_CLASS,
  menuItemContentView,
} from "./menu.ts";
import { BLOCK_CLASS } from "./placeholder.ts";
import { formatDuration } from "./time.ts";

// A ROW OF SONGS

// One row of a list of songs: its surface, the control that plays its track
// and the control that opens the menu of what else can be done with it
// (`trackRowView`). The list that lays the rows out is `trackList.ts`.
//
// A row is drawn in a frame that every row of songs shares, the queue's
// among them: the row, with the line under it; its surface, which is what a
// press lights; and the control that plays, which is the whole row but its
// last place.

/** The data attribute that marks the control that plays a row's track: what lights the row is a press of it, or a pointer over it. */
const ROW_PLAY_ATTRIBUTE = "row-play";

// THE LINE UNDER A ROW
//
// The line is the row's and not its surface's. A surface has rounded corners
// and reaches a little past the lines between the rows, so a line that ran
// up to a lit surface would meet a curve it does not follow. A lit surface
// therefore stands free: the line under its own row and the line under the
// row above it are not drawn. A row is lit while it is pressed, while a
// pointer is over it, and for as long as the player holds its track.
const ROW_LINE_CLASS = "border-b border-line transition-[border-color] duration-150";

const OWN_SURFACE_LIT_CLASS =
  "has-[>[data-in-player]]:border-b-transparent has-[[data-row-play]:active]:border-b-transparent can-hover:has-[[data-row-play]:hover]:border-b-transparent";

const NEXT_SURFACE_LIT_CLASS =
  "has-[+_*>[data-in-player]]:border-b-transparent has-[+_*_[data-row-play]:active]:border-b-transparent can-hover:has-[+_*_[data-row-play]:hover]:border-b-transparent";

// NOTE: the row at the head of a column comes after the foot of the column
// before in the list, and is no neighbour of it on the page: lit, it leaves
// that row's line alone. Where the list is narrow it is one column, and that
// row is its neighbour like any other.
const NEXT_SURFACE_LIT_IN_ONE_COLUMN_CLASS =
  "@max-2xl:has-[+_*>[data-in-player]]:border-b-transparent @max-2xl:has-[+_*_[data-row-play]:active]:border-b-transparent @max-2xl:can-hover:has-[+_*_[data-row-play]:hover]:border-b-transparent";

/**
 * A row, with the line under it. `isColumnFoot` is whether the row after it
 * stands at the head of the next column of a list laid out in columns.
 */
export const rowClass = (isColumnFoot = false): string =>
  clsx(
    ROW_LINE_CLASS,
    OWN_SURFACE_LIT_CLASS,
    isColumnFoot ? NEXT_SURFACE_LIT_IN_ONE_COLUMN_CLASS : NEXT_SURFACE_LIT_CLASS,
  );

/**
 * What a row's surface is lit with. On a page it is the panel's colour, and a
 * tile's while pressed; in the queue's column, whose ground is the panel's
 * own colour, it is a share of the ink's.
 */
export type SurfaceGround = "OnPage" | "OnPanel";

// NOTE: a pointer over a row that is being pressed is still over it, so what
// a pointer lights is said not to hold during a press: the two never both
// hold, and which is written first does not matter.
const SURFACE_LIT: Readonly<Record<SurfaceGround, string>> = {
  OnPage:
    "has-[[data-row-play]:active]:bg-tile can-hover:has-[[data-row-play]:hover:not(:active)]:bg-panel",
  OnPanel:
    "has-[[data-row-play]:active]:bg-ink/12 has-[[data-row-play]:hover:not(:active)]:bg-ink/8",
};

/**
 * A row's surface: it reaches a little past the row at both ends. The
 * surface of the track the player holds is tinted for as long as the player
 * holds it.
 */
export const rowSurfaceClass = (ground: SurfaceGround = "OnPage", isInPlayer = false): string =>
  clsx(
    "-mx-2 flex items-center rounded-lg transition-[background-color] duration-150",
    SURFACE_LIT[ground],
    { "bg-accent-wash": isInPlayer },
  );

/** What a row shows, laid out: the whole row but its last place. */
const ROW_BODY_CLASS = "flex min-w-0 flex-1 items-center";

/**
 * The control that plays a row's track. It has no colour of its own: a
 * press, or a pointer over it, lights the row's whole surface, the last
 * control's place included, so the row answers as one piece.
 */
export const ROW_PLAY_CLASS = clsx(
  ROW_BODY_CLASS,
  "cursor-pointer rounded-lg select-none focus-ring-inset",
);

/** What marks the control that plays, on the control: the row's line and its surface are lit by it. */
export const rowPlayAttribute = <M>(h: HtmlBuilder<M>) => h.DataAttribute(ROW_PLAY_ATTRIBUTE, "");

/** A press held on a row is a press, not the start of picking out its words. */
export const ROW_TOUCH_CLASS = "touch-manipulation [-webkit-touch-callout:none]";

const THUMBNAIL_CLASS = "w-11 shrink-0";

export const explicitMarkerView = (h: HtmlBuilder<Message>): Html =>
  h.span(
    [h.Class("ml-2 inline-flex shrink-0 items-center")],
    [
      h.span(
        [
          h.AriaHidden(true),
          h.Class("rounded-sm bg-muted px-1 text-10 leading-4 font-bold text-canvas"),
        ],
        ["E"],
      ),
      h.span([h.Class("sr-only")], ["Explicit"]),
    ],
  );

/**
 * What a row has to say about opening one of the pages it leads to: its
 * track's, or the album's. It is read from what the catalog said of that
 * page, so a row is in one state at a time for each: it cannot be loading
 * and failed at once.
 */
const RowState = defineTaggedUnion({
  Openable: {},
  Opening: {},
  Failed: { error: LoadError },
  NotAvailable: {},
});
type RowState = typeof RowState.Type;

/** A page held, or one being refreshed behind itself, opens at once: its row is a plain row. */
const rowStateOf = <A>(data: AsyncData.AsyncData<Option.Option<A>, LoadError>): RowState => {
  const whenHeld = (maybeFound: Option.Option<A>): RowState =>
    Option.match(maybeFound, {
      onNone: () => RowState.NotAvailable(),
      onSome: () => RowState.Openable(),
    });

  return AsyncData.match(data, {
    onIdle: () => RowState.Openable(),
    onLoading: () => RowState.Opening(),
    onFailure: (error) => RowState.Failed({ error }),
    onRefreshing: whenHeld,
    onStale: ({ data: held }) => whenHeld(held),
    onSuccess: whenHeld,
  });
};

/**
 * What a list of tracks needs to know of the page it is on: whether it is on
 * screen, which page it is, what the app holds about each of its tracks and
 * about the album each is on, which row an album was asked from, what the
 * player is doing with each track and whether it holds anything at all, each
 * row's menu, and whether a row has just had its track queued.
 */
export type TrackListContext = Readonly<{
  presence: Presence;
  albumArtistId?: ArtistId;
  from: PlayOrigin;
  trackDataOf: (trackId: TrackId) => TrackData;
  albumDataOf: (albumId: AlbumId) => AlbumData;
  /** Whether this list's row for the track is the one its album was last asked from. */
  isAlbumAskedFrom: (track: TrackSummary) => boolean;
  statusOf: (trackId: TrackId) => TrackStatus;
  isPlayerHolding: boolean;
  menuOf: (trackId: TrackId) => Menu.Model;
  queuedOf: (trackId: TrackId) => Option.Option<QueuePlace>;
}>;

const isInPlayer = (status: TrackStatus): boolean => status !== "Elsewhere";

/**
 * Where the mark of the track the player holds is drawn: over the track's
 * cover, dark under white bars, or over the row's number where a list has no
 * covers (an album's), in the accent's colours.
 */
type MarkPlace = "OverCover" | "OverNumber";

// NOTE: the mark comes over the cover, or the row's number, out of nothing.
const MARK_CLASS =
  "motion-safe:transition-opacity motion-safe:duration-150 motion-safe:ease-[ease-out] motion-safe:starting:opacity-0";

// THE SPINNER AND THE BARS
//
// Both are in the mark whatever it shows, one over the other, and the one
// that is not shown is small and clear: the spinner draws in as the bars
// come out of where it was, so the one turns into the other. The one that
// goes is gone sooner than the other is whole, and is taken out of the
// picture only once it is clear.
const MARK_PIECE_CLASS =
  "col-start-1 row-start-1 motion-safe:transition-[opacity,scale,visibility]";

// NOTE: each is a whole way of moving, the one that comes and the one that
// goes: its times and its curves, for the three things that change. The one
// that goes is quicker, and is hidden only once it is small and clear.
const MARK_PIECES = {
  Shown:
    "motion-safe:duration-[160ms,240ms,0s] motion-safe:ease-[ease-out,var(--ease-settle),ease]",
  Gone: "invisible scale-[0.4] opacity-0 motion-safe:delay-[0s,0s,160ms] motion-safe:duration-[110ms,160ms,0s] motion-safe:ease-[ease-in,ease-in,ease]",
} as const;

type MarkLook = Readonly<{
  sounding: string;
  failed: string;
  failedIcon: string;
  bar: string;
  spinner: string;
  spinnerIcon: string;
}>;

const MARK_LOOKS: Readonly<Record<MarkPlace, MarkLook>> = {
  OverCover: {
    sounding: "absolute inset-0 grid items-end justify-items-center rounded-lg bg-shade/50 pb-3.5",
    failed: "absolute inset-0 grid place-items-center rounded-lg bg-shade/55",
    failedIcon: "size-5 text-on-night",
    bar: "w-0.5 origin-bottom rounded-full bg-on-night",
    spinner: "mb-[-0.125rem] flex",
    spinnerIcon: "size-5 animate-spin text-on-night motion-reduce:animate-pulse",
  },
  // NOTE: a little taller than the number it stands over, which is one line
  // of small figures: the bars need the room.
  OverNumber: {
    sounding:
      "absolute inset-x-0 -inset-y-[0.15rem] grid items-center justify-items-center rounded-lg bg-accent-wash",
    failed: "absolute inset-x-0 -inset-y-[0.15rem] grid place-items-center rounded-lg bg-canvas",
    failedIcon: "size-5 text-danger",
    bar: "w-0.5 origin-bottom rounded-full bg-accent",
    spinner: "flex",
    spinnerIcon: "size-5 animate-spin text-accent motion-reduce:animate-pulse",
  },
};

/**
 * The mark of the track the player holds. The bars move while the engine
 * says it sounds and lie low while it does not; a start slow enough to
 * mention turns a spinner instead. Under reduced motion the bars keep still,
 * tall for sound and low for silence.
 *
 * The spinner and the bars are both in the mark whatever it shows, one over
 * the other, and the one that is not shown is drawn small and clear
 * (`MARK_PIECE_CLASS`). So a start that was slow turns into sound
 * where it stands, the spinner drawing in as the bars come out of it, and
 * is not one picture taken away and another put in its place.
 */
const nowPlayingMarkView = (status: TrackStatus, place: MarkPlace, h: HtmlBuilder<Message>): Html => {
  if (status === "Elsewhere" || status === "Chosen") {
    return h.empty;
  }
  const look = MARK_LOOKS[place];
  // NOTE: a song that could not be played says so where it would have shown
  // that it sounds, and the row stays the height it was: words under the
  // row made it a row of three lines among rows of two.
  if (status === "Failed") {
    return h.span(
      [
        h.AriaHidden(true),
        h.DataAttribute("now-playing", "Failed"),
        h.Class(clsx(MARK_CLASS, look.failed)),
      ],
      [alertIcon(look.failedIcon)],
    );
  }
  const isSounding = status === "Sounding";
  const isStarting = status === "Starting";
  const bar = (delay: string): Html =>
    h.span([
      h.Class(
        clsx(look.bar, delay, {
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
      h.Class(clsx(MARK_CLASS, look.sounding)),
    ],
    [
      h.span(
        [
          h.Class(
            clsx(MARK_PIECE_CLASS, look.spinner, isStarting ? MARK_PIECES.Shown : MARK_PIECES.Gone),
          ),
        ],
        [spinnerIcon(look.spinnerIcon)],
      ),
      h.span(
        [
          h.Class(
            clsx(
              MARK_PIECE_CLASS,
              "flex h-3.5 items-end gap-0.5",
              isStarting ? MARK_PIECES.Gone : MARK_PIECES.Shown,
            ),
          ),
        ],
        [bar("[animation-delay:-600ms]"), bar("[animation-delay:-300ms]"), bar("")],
      ),
    ],
  );
};

const trackThumbnailView = (
  track: TrackSummary,
  status: TrackStatus,
  presence: Presence,
  loading: PictureLoading,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [
      h.DataAttribute("cover", ""),
      h.Class(clsx(THUMBNAIL_CLASS, "catalog-art relative")),
      ...flightAttributes(coverTransitionStyle(track.id, { presence, isInPlayer: isInPlayer(status) }), h),
    ],
    [
      artworkView(Option.fromNullishOr(track.album.cover), "Square", "small", h, loading),
      nowPlayingMarkView(status, "OverCover", h),
    ],
  );

/**
 * What a row leads with. A list with covers has each track's thumbnail, and
 * before it the track's place when the list is a chart; a list of one
 * album's songs has no covers to tell them by, and leads with the track's
 * number, set close, with the mark of the track the player holds over it.
 */
export type RowLead = "Cover" | "Number";

/** How close a row's parts are set, and how tall it is at the least. */
const ROW_DENSITY_CLASS: Readonly<Record<RowLead, string>> = {
  Cover: "gap-4 py-2.5 pl-2",
  Number: "min-h-13 gap-3 py-2.5 pl-2",
};

const ROW_SURFACE_HEIGHT_CLASS: Readonly<Record<RowLead, string>> = {
  Cover: "",
  Number: "min-h-13",
};

/**
 * One row of a list: its track, and what the list says of it. `maybePosition`
 * is the row's place where the list numbers its rows, a chart's or an
 * album's; `isColumnHead` is whether the row stands at the head of a column
 * of a list laid out in columns, and `isColumnFoot` whether the row after it
 * does.
 */
export type TrackRow = Readonly<{
  track: TrackSummary;
  maybePosition: Option.Option<number>;
  lead: RowLead;
  loading: PictureLoading;
  isColumnHead: boolean;
  isColumnFoot: boolean;
}>;

const POSITION_CLASS: Readonly<Record<RowLead, string>> = {
  Cover: "relative w-6 shrink-0 text-right text-sm text-muted tabular-nums",
  Number:
    "relative w-5.5 shrink-0 text-left text-13 leading-(--text-sm--line-height) text-muted tabular-nums",
};

/**
 * What every row shows, whatever can be done with it. A track with nothing
 * to play says so where its length would be, and is drawn fainter: a length
 * is of no use for what cannot be played, and the row stays two lines.
 */
const rowContentView = (
  { track, maybePosition, lead, loading }: TrackRow,
  status: TrackStatus,
  context: TrackListContext,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => [
  Option.match(maybePosition, {
    onNone: () => h.empty,
    // Hidden from assistive technology: the ordered list already says the position.
    onSome: (position) =>
      h.span(
        [h.AriaHidden(true), h.Class(POSITION_CLASS[lead])],
        lead === "Number"
          ? [String(position).padStart(2, "0"), nowPlayingMarkView(status, "OverNumber", h)]
          : [position.toString()],
      ),
  }),
  lead === "Number" ? h.empty : trackThumbnailView(track, status, context.presence, loading, h),
  h.div(
    [h.Class("min-w-0 flex-1 text-left")],
    [
      h.p(
        [
          h.Class(
            clsx("flex items-center font-medium", {
              "text-accent": isInPlayer(status),
              "text-muted": !isPlayable(track),
            }),
          ),
        ],
        [
          h.span([h.Class("truncate")], [track.title]),
          track.explicit ? explicitMarkerView(h) : h.empty,
        ],
      ),
      context.albumArtistId === track.artist.id
        ? h.empty
        : h.p([h.Class("truncate text-sm text-muted")], [track.artist.name]),
    ],
  ),
  isPlayable(track)
    ? h.span(
        [h.Class("flex min-w-10 shrink-0 justify-end text-sm text-muted tabular-nums")],
        [formatDuration(track.durationSeconds)],
      )
    : h.span(
        [h.DataAttribute("silent", ""), h.Class("shrink-0 text-xs font-medium text-muted")],
        ["No audio"],
      ),
];

/**
 * What the row's control is called. The name replaces what the row shows, so
 * it carries all of it: what a press does, the track, whether it is
 * explicit, who it is by and how long it is.
 */
const rowLabel = (track: TrackSummary, status: TrackStatus): string =>
  `${status === "Sounding" || status === "Waiting" ? "Pause" : "Play"}: ${track.title}${track.explicit ? ", explicit," : ""} by ${track.artist.name}, ${formatDuration(track.durationSeconds)}`;

/**
 * Pressing a row plays its track, and the whole row but its last control is
 * the target. For the track the player holds, the row is that track's own
 * control: a press stops the sound or brings it back. The control has no
 * colour of its own: a press, or a pointer over it, lights the whole row,
 * the last control's place included, so the row answers as one piece.
 */
const playRowView = (
  row: TrackRow,
  status: TrackStatus,
  context: TrackListContext,
  h: HtmlBuilder<Message>,
): Html =>
  Button.view(
    {
      onClick: Message.ClickedPlayTrack({ trackId: row.track.id, from: context.from }),
      toView: (attributes) =>
        h.button(
          [
            ...attributes.button,
            h.AriaLabel(rowLabel(row.track, status)),
            ...(isInPlayer(status) ? [h.AriaCurrent("true")] : []),
            h.AriaBusy(status === "Starting"),
            rowPlayAttribute(h),
            h.Class(clsx(ROW_PLAY_CLASS, ROW_TOUCH_CLASS, ROW_DENSITY_CLASS[row.lead])),
          ],
          rowContentView(row, status, context, h),
        ),
    },
    h,
  );

/** A track with nothing to play: the row is there to be read, and is not a control. */
const silentRowView = (row: TrackRow, context: TrackListContext, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class(clsx(ROW_BODY_CLASS, ROW_DENSITY_CLASS[row.lead]))],
    rowContentView(row, "Elsewhere", context, h),
  );

/**
 * What a row has to say of the two pages its menu leads to. What is said of
 * the album is said by one row, the one it was asked from: an album can be
 * on every row of a list, and only one of them was used. That the catalog
 * does not have the album is true of them all: the row that asked says so,
 * and the others do not offer it.
 */
type RowPages = Readonly<{ song: RowState; album: RowState; isAlbumOffered: boolean }>;

const rowPagesOf = (track: TrackSummary, context: TrackListContext): RowPages => {
  const album = context.albumDataOf(track.album.id);
  const isAsked = context.isAlbumAskedFrom(track);

  return {
    song: rowStateOf(context.trackDataOf(track.id)),
    album: isAsked ? rowStateOf(album) : RowState.Openable(),
    // On the album's own page there is no album to go to: the listener is there.
    isAlbumOffered: context.from !== "Album" && (isAsked || !isKnownMissing(album)),
  };
};

const isOpening = (pages: RowPages): boolean =>
  RowState.guards.Opening(pages.song) || RowState.guards.Opening(pages.album);

/** A page that would not open, or that the catalog does not have: the row has something to answer for. */
const isAmiss = (state: RowState): boolean =>
  RowState.guards.Failed(state) || RowState.guards.NotAvailable(state);

const hasSomethingAmiss = (pages: RowPages): boolean =>
  isAmiss(pages.song) || isAmiss(pages.album);

/**
 * What a row's menu offers for its track, in the order it is offered. A
 * track is queued once something else is playing: a queue is what comes
 * after a track. Its page and its album's are always listed: one the
 * catalog does not have is listed as not available, and cannot be chosen,
 * so the menu is where the row says what became of what was asked of it.
 */
const actionsOf = (
  track: TrackSummary,
  pages: RowPages,
  status: TrackStatus,
  context: TrackListContext,
): ReadonlyArray<RowAction> => [
  ...(isPlayable(track) && context.isPlayerHolding && !isInPlayer(status)
    ? (["PlayNext", "AddToQueue"] as const)
    : []),
  ...(pages.isAlbumOffered ? (["OpenAlbum"] as const) : []),
  "OpenSong",
];

/**
 * What the row's last control shows. It answers at once what was chosen
 * from its menu: a spinner while the page chosen is on its way, since the
 * URL does not move until the page takes the screen; a tick for a moment
 * when the track was queued; and a mark, in the colour of what went wrong,
 * for a page that would not open or is not to be had. The menu it opens says
 * which, and is the way to try again.
 */
// NOTE: the mark stands in the row's last place and not under the row. What
// a row had to say was once a line of its own under it, with its own "Try
// again": a row of three lines among rows of two, and wider than the row
// where the words were long.
const moreContentView = (
  pages: RowPages,
  maybeQueued: Option.Option<QueuePlace>,
  isMenuOpen: boolean,
): Html => {
  // An open menu says it itself, on the item that was chosen.
  if (isOpening(pages) && !isMenuOpen) {
    return spinnerIcon("size-5 animate-spin motion-reduce:animate-pulse");
  }
  if (Option.isSome(maybeQueued)) {
    return checkIcon("size-5 text-accent");
  }
  return hasSomethingAmiss(pages) ? alertIcon("size-5 text-danger") : moreIcon("size-5");
};

/** What a row has to say of the page an item of its menu leads to, if it leads to one. */
const pageStateOf = (action: RowAction, pages: RowPages): RowState => {
  if (action === "OpenSong") {
    return pages.song;
  }
  return action === "OpenAlbum" ? pages.album : RowState.Openable();
};

/** An item's name over a line that says what became of what it leads to. */
const itemWithNoteView = (
  label: string,
  note: string,
  noteClass: string,
  h: HtmlBuilder<Message>,
): Html =>
  h.span(
    [h.Class("flex min-w-0 flex-col")],
    [h.span([], [label]), h.span([h.Class(clsx("text-sm", noteClass))], [note])],
  );

/**
 * One item of the menu. An item that leads to a page answers a press where
 * it was pressed: the menu stays open, the item's mark turns while the page
 * is on its way, and if the page fails to open the item says so, in the
 * colour of what went wrong, with why, and is the way to try again. Nobody
 * has to open the menu a second time to do that. A page the catalog does not
 * have is listed as not available, and is not to be pressed.
 */
const menuItemView = (action: RowAction, pages: RowPages, h: HtmlBuilder<Message>): Html => {
  const look = ACTION_LOOKS[action];

  return RowState.match(pageStateOf(action, pages), {
    Openable: () => menuItemContentView(look, h),
    NotAvailable: () =>
      h.div(
        [h.DataAttribute("item-state", "not-available"), h.Class("contents text-muted")],
        [
          itemWithNoteView(look.label, "Not available", "text-danger", h),
          alertIcon("size-5 shrink-0 text-danger"),
        ],
      ),
    Opening: () =>
      h.div(
        [h.DataAttribute("item-state", "opening"), h.Class("contents")],
        [
          h.span([], [look.label]),
          spinnerIcon(clsx(MENU_ITEM_ICON_CLASS, "animate-spin motion-reduce:animate-pulse")),
        ],
      ),
    Failed: ({ error }) =>
      h.div(
        [h.DataAttribute("item-state", "failed"), h.Class("contents text-danger")],
        [
          itemWithNoteView(look.label, `${reason(error)} Tap to try again.`, "", h),
          retryIcon("size-5 shrink-0"),
        ],
      ),
  });
};

/**
 * The row's last control: what else can be done with its track. It is where
 * the row keeps the focus, so it carries the mark the focus is given back by.
 */
const rowMenuView = (
  track: TrackSummary,
  actions: Array.NonEmptyReadonlyArray<RowAction>,
  pages: RowPages,
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
        content: menuItemView(action, pages, h),
      }),
      isItemDisabled: (action) => RowState.guards.NotAvailable(pageStateOf(action, pages)),
      itemToSearchText: (action) => ACTION_LOOKS[action].label,
      ariaLabel: `More: ${track.title}`,
      buttonContent: moreContentView(
        pages,
        context.queuedOf(track.id),
        context.menuOf(track.id).isOpen,
      ),
      buttonClassName: iconControlClass("OnPage"),
      buttonAttributes: childAttributes([
        h.DataAttribute(TRACK_ROW_ATTRIBUTE, track.id),
        h.AriaBusy(isOpening(pages)),
        ...(hasSomethingAmiss(pages) ? [h.DataAttribute("amiss", "")] : []),
      ]),
      itemsClassName: MENU_CLASS,
      backdropClassName: MENU_BACKDROP_CLASS,
      anchor: { placement: "bottom-end", gap: 4, padding: 12 },
    },
    toParentMessage: (message) =>
      Message.GotRowMenuMessage({ from: context.from, trackId: track.id, message }),
  });

/**
 * What a row has to say in words, for assistive technology: what is shown of
 * it is a mark, a spinner or a tick in the row itself, and the words of it
 * are in the row's menu.
 */
const sentences = (
  track: TrackSummary,
  pages: RowPages,
  status: TrackStatus,
  maybeQueued: Option.Option<QueuePlace>,
): ReadonlyArray<string> =>
  Array.getSomes([
    Option.liftPredicate("This song has no audio to play.", () => !isPlayable(track)),
    Option.liftPredicate("This song could not be played.", () => status === "Failed"),
    RowState.match<Option.Option<string>>(pages.song, {
      Openable: () => Option.none(),
      Opening: () => Option.some("Opening…"),
      Failed: ({ error }) => Option.some(`This song could not be opened. ${reason(error)}`),
      NotAvailable: () => Option.some("This song is not available."),
    }),
    RowState.match<Option.Option<string>>(pages.album, {
      Openable: () => Option.none(),
      Opening: () => Option.some("Opening the album…"),
      Failed: ({ error }) => Option.some(`This album could not be opened. ${reason(error)}`),
      NotAvailable: () => Option.some("This album is not available."),
    }),
    Option.map(maybeQueued, (place) => (place === "Next" ? "Plays next." : "Added to the queue.")),
  ]);

/**
 * Where a row says what became of its track, to assistive technology: that
 * its page or its album's is opening, that it failed to open, that the track
 * or the album is gone, that it has nothing to play, that it could not be
 * played, or that it was queued. The words are a status: said politely when
 * they change, without taking the focus. The place is there whether or not
 * there is anything to say, so that what is said is heard as a change. It
 * takes no room: a row is the same height whatever became of its track.
 */
const noticeView = (
  track: TrackSummary,
  pages: RowPages,
  status: TrackStatus,
  context: TrackListContext,
  h: HtmlBuilder<Message>,
): Html =>
  saidView(Array.join(sentences(track, pages, status, context.queuedOf(track.id)), " "), h);

/**
 * A row: its surface, with the control that plays and the control that
 * opens the menu, and under it what the row has to say. The surface of the
 * track the player holds is tinted from the tap on, before the engine has
 * said anything: that is how it shows it was chosen.
 */
export const trackRowView = (
  row: TrackRow,
  context: TrackListContext,
  h: HtmlBuilder<Message>,
): Html => {
  const { track, isColumnHead } = row;
  const pages = rowPagesOf(track, context);
  const status = context.statusOf(track.id);

  return h.keyed("li")(
    track.id,
    [
      ...(isColumnHead ? [h.DataAttribute("column-head", "")] : []),
      h.Class(rowClass(row.isColumnFoot)),
    ],
    [
      h.div(
        [
          h.DataAttribute("track", track.id),
          ...(isInPlayer(status) ? [h.DataAttribute("in-player", "")] : []),
          h.Class(
            clsx(rowSurfaceClass("OnPage", isInPlayer(status)), ROW_SURFACE_HEIGHT_CLASS[row.lead]),
          ),
        ],
        [
          isPlayable(track)
            ? playRowView(row, status, context, h)
            : silentRowView(row, context, h),
          Array.match(actionsOf(track, pages, status, context), {
            onEmpty: () => h.empty,
            onNonEmpty: (actions) => rowMenuView(track, actions, pages, context, h),
          }),
        ],
      ),
      noticeView(track, pages, status, context, h),
    ],
  );
};

/** A row the size of a row of songs, for a list whose tracks are on their way. */
export const trackRowPlaceholderView = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class(clsx(ROW_LINE_CLASS, "flex items-center gap-4 py-2.5"))],
    [
      h.div([h.Class(clsx(BLOCK_CLASS, THUMBNAIL_CLASS, "aspect-square rounded-lg"))]),
      h.div(
        [h.Class("min-w-0 flex-1")],
        [
          h.div([h.Class(clsx(BLOCK_CLASS, "h-4 w-2/5 rounded"))]),
          h.div([h.Class(clsx(BLOCK_CLASS, "mt-2 h-4 w-1/4 rounded"))]),
        ],
      ),
      h.div([h.Class(clsx(BLOCK_CLASS, "h-4 w-8 rounded"))]),
    ],
  );
