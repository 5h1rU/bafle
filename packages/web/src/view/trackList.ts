import type { ArtistId } from "@bafle/domain/Catalog/Artist";
import type { AlbumId } from "@bafle/domain/Catalog/Album";
import type { TrackId, TrackSummary } from "@bafle/domain/Catalog/Track";
import { Button, type Menu } from "@foldkit/ui";
import { clsx } from "clsx";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import { type Attribute, childAttributes, type Html, type HtmlBuilder } from "foldkit/html";
import { defineTaggedUnion } from "foldkit/schema";
import { LoadError } from "../catalog.ts";
import { Message, type PlayOrigin } from "../message.ts";
import { type AlbumData, isKnownMissing, type TrackData } from "../model.ts";
import { isPlayable, type QueuePlace, type TrackStatus } from "../player/model.ts";
import { type RowAction, RowMenu, rowMenuId } from "../rowMenu.ts";
import {
  artworkView,
  artworkFlightRules,
  coverTransitionName,
  coverTransitionStyle,
  flightAttributes,
  type PictureLoading,
} from "./artwork.ts";
import { reason } from "./feedback.ts";
import { COLUMN_ROWS_AT_ONCE, ROWS_AT_ONCE } from "./firstPictures.ts";
import {
  albumIcon,
  alertIcon,
  checkIcon,
  detailsIcon,
  moreIcon,
  playLastIcon,
  playNextIcon,
  spinnerIcon,
  retryIcon,
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

const BAR_CLASS = "now-bar w-0.5 origin-bottom rounded-full bg-white";

/**
 * The mark of the track the player holds, over its cover. The bars move
 * while the engine says it sounds and lie low while it does not; a start
 * slow enough to mention turns a spinner instead. Under reduced motion the
 * bars keep still, tall for sound and low for silence.
 *
 * The spinner and the bars are both in the mark whatever it shows, one over
 * the other, and the one that is not shown is drawn small and clear
 * (`now-mark` in styles.css). So a start that was slow turns into sound
 * where it stands, the spinner drawing in as the bars come out of it, and
 * is not one picture taken away and another put in its place.
 */
const nowPlayingMarkView = (status: TrackStatus, h: HtmlBuilder<Message>): Html => {
  if (status === "Elsewhere" || status === "Chosen") {
    return h.empty;
  }
  // NOTE: a song that could not be played says so where it would have shown
  // that it sounds, and the row stays the height it was: words under the
  // row made it a row of three lines among rows of two.
  if (status === "Failed") {
    return h.span(
      [
        h.AriaHidden(true),
        h.DataAttribute("now-playing", "Failed"),
        h.Class("now-mark absolute inset-0 grid place-items-center rounded-lg bg-black/55"),
      ],
      [alertIcon("size-5 text-white")],
    );
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
      h.Class("now-mark absolute inset-0 grid items-end justify-items-center rounded-lg bg-black/50 pb-3.5"),
    ],
    [
      h.span(
        [h.Class("now-spinner mb-[-0.125rem] flex")],
        [spinnerIcon("size-5 animate-spin text-white motion-reduce:animate-pulse")],
      ),
      h.span(
        [h.Class("now-bars flex h-3.5 items-end gap-0.5")],
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
      h.Class(clsx(TRACK_THUMBNAIL_CLASS, "catalog-art relative")),
      ...flightAttributes(coverTransitionStyle(track.id, { presence, isInPlayer: isInPlayer(status) }), h),
    ],
    [
      artworkView(Option.fromNullishOr(track.album.cover), "Square", "small", h, loading),
      nowPlayingMarkView(status, h),
    ],
  );

/**
 * What every row shows, whatever can be done with it. A track with nothing
 * to play says so where its length would be, and is drawn fainter: a length
 * is of no use for what cannot be played, and the row stays two lines.
 */
const rowContentView = (
  track: TrackSummary,
  maybePosition: Option.Option<number>,
  loading: PictureLoading,
  status: TrackStatus,
  context: TrackListContext,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => [
  Option.match(maybePosition, {
    onNone: () => h.empty,
    // Hidden from assistive technology: the ordered list already says the position.
    onSome: (position) =>
      h.span(
        [h.AriaHidden(true), h.Class("relative w-6 shrink-0 text-right text-sm text-muted tabular-nums")],
        context.from === "Album"
          ? [String(position).padStart(2, "0"), nowPlayingMarkView(status, h)]
          : [position.toString()],
      ),
  }),
  context.from === "Album" ? h.empty : trackThumbnailView(track, status, context.presence, loading, h),
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
  loading: PictureLoading,
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
          rowContentView(track, maybePosition, loading, status, context, h),
        ),
    },
    h,
  );

/** A track with nothing to play: the row is there to be read, and is not a control. */
const silentRowView = (
  track: TrackSummary,
  maybePosition: Option.Option<number>,
  loading: PictureLoading,
  context: TrackListContext,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Class(ROW_PART_CLASS)],
    rowContentView(track, maybePosition, loading, "Elsewhere", context, h),
  );

// NOTE: the control answers a press over the whole of its place, a finger
// wide, and lights a smaller circle within it. The song's length stands
// hard against that place, and a circle the size of the place touched it:
// the light is drawn in from the place's edge, and the row keeps its
// spacing. The circle is a piece of its own behind the mark (`before`).
const MORE_CLASS =
  "relative isolate flex size-11 shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-full text-muted before:absolute before:inset-1.5 before:-z-10 before:rounded-full before:content-[''] hover:text-ink hover:before:bg-panel focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent active:before:bg-tile data-[open]:text-ink data-[open]:before:bg-tile";

/** Over the whole screen: nothing under it is pressed or scrolled while the menu is open. */
const MENU_BACKDROP_CLASS = "fixed inset-0 z-40 touch-none";

// NOTE: the menu is drawn in the document's body, over everything, and is
// placed by the component under the row's control. It grows out of the
// corner nearest that control.
export const MENU_CLASS =
  "z-50 min-w-60 origin-top-right data-[placement=top]:origin-bottom-right overflow-hidden rounded-2xl bg-canvas text-ink shadow-[0_10px_38px_rgb(0_0_0/0.22)] ring-1 ring-line outline-none transition-[scale,opacity] duration-150 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 motion-reduce:transition-none";

export const MENU_ITEM_CLASS =
  "flex cursor-pointer items-center justify-between gap-8 border-line px-4 py-3 select-none not-first:border-t data-[active]:bg-panel active:bg-tile";

type ActionLook = Readonly<{ label: string; icon: (className: string) => Html }>;

const ACTION_LOOKS: Readonly<Record<RowAction, ActionLook>> = {
  PlayNext: { label: "Play next", icon: playNextIcon },
  AddToQueue: { label: "Add to queue", icon: playLastIcon },
  OpenAlbum: { label: "Go to album", icon: albumIcon },
  OpenSong: { label: "Song details", icon: detailsIcon },
};

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

const ITEM_ICON_CLASS = "size-5 shrink-0 text-muted";

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
    Openable: () =>
      h.div([h.Class("contents")], [h.span([], [look.label]), look.icon(ITEM_ICON_CLASS)]),
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
          spinnerIcon(clsx(ITEM_ICON_CLASS, "animate-spin motion-reduce:animate-pulse")),
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
      buttonClassName: MORE_CLASS,
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
  h.p(
    [h.Role("status"), h.Class("sr-only")],
    [Array.join(sentences(track, pages, status, context.queuedOf(track.id)), " ")],
  );

/**
 * A row: its surface, with the control that plays and the control that
 * opens the menu, and under it what the row has to say. The surface of the
 * track the player holds is tinted from the tap on, before the engine has
 * said anything: that is how it shows it was chosen.
 */
const trackRowView = (
  track: TrackSummary,
  maybePosition: Option.Option<number>,
  loading: PictureLoading,
  isColumnHead: boolean,
  context: TrackListContext,
  h: HtmlBuilder<Message>,
): Html => {
  const pages = rowPagesOf(track, context);
  const status = context.statusOf(track.id);

  return h.keyed("li")(
    track.id,
    [
      // NOTE: read by the style sheet, for the line under the row before
      // this one: that row is the foot of the column before, and no
      // neighbour of this one (`track-columns` in styles.css).
      ...(isColumnHead ? [h.DataAttribute("column-head", "")] : []),
      h.Class(TRACK_ROW_LINE_CLASS),
    ],
    [
      h.div(
        [
          h.DataAttribute("track", track.id),
          ...(isInPlayer(status) ? [h.DataAttribute("in-player", "")] : []),
          h.Class("track-row-surface -mx-2 flex items-center"),
        ],
        [
          isPlayable(track)
            ? playRowView(track, maybePosition, loading, status, context, h)
            : silentRowView(track, maybePosition, loading, context, h),
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

/** Ranked lists number their rows: the order is the catalog's chart. */
export type TrackOrder = "Ranked" | "Unranked";

/**
 * How a list uses the room it is given. `Single` is one column of a width
 * that reads well, however wide the page, and as long as the list is.
 * `Columns` takes the page's width and is never taller than a few rows: the
 * list is laid out in columns of `ROWS_IN_COLUMN` at most, as many as it
 * takes, the first rows down the first and the next down the one after, so
 * a chart still reads from its top. The columns stand in a row that goes on
 * sideways and snaps, as a shelf does: a wide page shows two of them and a
 * narrow one shows one, with the next showing at the edge.
 *
 * Top songs are `Columns` wherever they are listed, on New, on an artist's
 * page and on a genre's: a chart is one thing, and looks one way. So are
 * the songs a search found, past the few that stand beside the artist. The
 * songs of an album, a playlist or a station are `Single`: they are what
 * the page is, and nothing stands under them to be reached.
 */
export type TrackSpread = "Single" | "Columns";

/** The most rows a column holds: what an artist's ten top songs come to in two. */
export const ROWS_IN_COLUMN = 5;

const columnsOf = (count: number): number => Math.ceil(count / ROWS_IN_COLUMN);

/**
 * How many rows each column of a list holds. The columns are as even as
 * they can be: eight songs are four and four, not five and three.
 */
const rowsInColumnOf = (count: number): number => Math.ceil(count / columnsOf(count));

// NOTE: the row of columns reaches the page's edges and is padded back in
// by as much, as a shelf's row is, so what is scrolled is cut off at the
// edge of the page and not at the edge of its text. Where each column
// stands, and how wide it is, is the style sheet's (`track-columns`).
export const TRACK_COLUMNS_CLASS =
  "track-columns -mx-5 mt-2 snap-x snap-mandatory scroll-px-5 overflow-x-auto overscroll-x-contain px-5 pb-3 [scrollbar-color:var(--color-line)_transparent] [scrollbar-width:thin] md:-mx-10 md:scroll-px-10 md:px-10";

/** What a list in columns says of itself to the style sheet: how many rows a column holds, and how many columns there are. */
export const trackColumnsAttributes = (
  count: number,
  h: HtmlBuilder<Message>,
  className?: string,
): ReadonlyArray<Attribute<Message>> => [
  h.Style({ "--rows": String(rowsInColumnOf(count)) }),
  h.DataAttribute("columns", String(columnsOf(count))),
  h.Class(clsx(TRACK_COLUMNS_CLASS, className)),
];

/**
 * The first rows of a list are what its page opens with: their thumbnails
 * are drawn at once, and the reply for the page waits for them
 * (`firstPicturesOf`). A list in columns opens with the two columns a wide
 * page shows.
 */
const rowLoading = (spread: TrackSpread, index: number): PictureLoading =>
  index < (spread === "Columns" ? COLUMN_ROWS_AT_ONCE : ROWS_AT_ONCE) ? "AtOnce" : "WhenNear";

export const trackListView = (
  labelledBy: string,
  order: TrackOrder,
  spread: TrackSpread,
  tracks: Array.NonEmptyReadonlyArray<TrackSummary>,
  context: TrackListContext,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => {
  const listAttributes = [
    h.Role("list"),
    h.AriaLabelledBy(labelledBy),
    ...(spread === "Columns" ? trackColumnsAttributes(tracks.length, h) : [h.Class("mt-2")]),
  ];
  const rowsInColumn = rowsInColumnOf(tracks.length);
  const isColumnHead = (index: number): boolean =>
    spread === "Columns" && index > 0 && index % rowsInColumn === 0;

  return [
    context.presence === "OnScreen" && context.from !== "Album"
      ? artworkFlightRules(tracks.map((track) => coverTransitionName(track.id)), h)
      : h.empty,
    order === "Ranked"
      ? h.ol(
          listAttributes,
          Array.map(tracks, (track, index) =>
            trackRowView(track, Option.some(index + 1), rowLoading(spread, index), isColumnHead(index), context, h),
          ),
        )
      : h.ul(
          listAttributes,
          Array.map(tracks, (track, index) =>
            trackRowView(track, Option.none(), rowLoading(spread, index), isColumnHead(index), context, h),
          ),
        ),
  ];
};

/** A titled list of tracks, or nothing when there are none. */
export const maybeTrackSectionView = (
  id: string,
  title: string,
  order: TrackOrder,
  spread: TrackSpread,
  tracks: ReadonlyArray<TrackSummary>,
  context: TrackListContext,
  h: HtmlBuilder<Message>,
): Option.Option<Html> =>
  Array.match(tracks, {
    onEmpty: () => Option.none(),
    onNonEmpty: (listed) =>
      Option.some(
        h.section(
          [h.Class(spread === "Columns" ? "track-columns-place" : "max-w-3xl")],
          [
            h.h2([h.Id(id), h.Class(SECTION_HEADING_CLASS)], [title]),
            ...trackListView(id, order, spread, listed, context, h),
          ],
        ),
      ),
  });
