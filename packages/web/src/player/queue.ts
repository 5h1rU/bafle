import type { TrackSummary } from "@bafle/domain/Catalog/Track";
import { Button, DragAndDrop } from "@foldkit/ui";
import { clsx } from "clsx";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import { createLazy, type Html, type HtmlBuilder } from "foldkit/html";
import { iconButtonView } from "../view/control.ts";
import { closeIcon, gripDotsIcon, gripIcon, noteIcon, queueIcon } from "../view/icon.ts";
import { formatDuration } from "../view/time.ts";
import {
  ROW_PLAY_CLASS,
  ROW_TOUCH_CLASS,
  rowClass,
  rowPlayAttribute,
  rowSurfaceClass,
  type SurfaceGround,
} from "../view/trackRow.ts";
import { Message } from "./message.ts";
import {
  type Model,
  QUEUE_COLUMN_ID,
  QUEUE_CONTAINER_ID,
  QUEUE_CONTROL_ID,
  type Session,
} from "./model.ts";

// THE QUEUE

// The songs to come, on a face of the expanded player. The way to it and
// back is a control under the player's controls. Every row ends in a handle:
// a song is taken up by it and carried to another place in the queue, or
// moved there with the keys. That is the whole of what can be done to the
// queue's order, with nothing to switch on first.
//
// On a desktop's screen the player does not expand, and the queue is a
// column beside the page, opened and closed from the island (`THE QUEUE
// BESIDE THE PAGE`, below). It is the same queue, moved the same way: one of
// the two is in the document at a time, never both.

const PANEL_ID = "player-queue";

/**
 * What a face of the expanded player lists takes the room between the head
 * and the deck, which stands under it at the foot of the sheet.
 */
export const FACE_BODY_CLASS = "order-1 grow shrink-0 basis-auto";

/** What a face of the expanded player lists is named once, at its head. */
export const FACE_HEADING_CLASS = "text-[1.625rem] leading-[1.2] font-bold tracking-[-0.04em]";
const NEXT_ID = "player-queue-next";

/** What plays next, in a line: the song and who it is by, or that there is none. */
const nextLine = (session: Session): string =>
  Option.match(Array.head(session.later), {
    onNone: () => "No upcoming songs",
    onSome: (track) => `${track.title} · ${track.artist.name}`,
  });

/**
 * The way to the queue and back from it: a control under the player's
 * controls, on every face. On the queue's it is lit, and leads back to the
 * song; on any other it leads to the queue. What plays next is said to
 * assistive technology, where a row once showed it.
 */
export const queueButtonView = (session: Session, h: HtmlBuilder<Message>): Html => {
  const isOpen = session.pane === "Queue";
  return iconButtonView(
    {
      look: "OnSheet",
      label: "Playing Next",
      content: [
        queueIcon("size-6"),
        h.span([h.Id(NEXT_ID), h.Class("sr-only")], [nextLine(session)]),
      ],
      onClick: Message.ClickedQueue(),
      attributes: [
        h.AriaDescribedBy(NEXT_ID),
        h.AriaExpanded(isOpen),
        h.AriaControls(PANEL_ID),
        ...(isOpen ? [h.DataAttribute("lit", "")] : []),
      ],
    },
    h,
  );
};

/** A song's place in all that is played: the current one's, and on from there. */
const placeLabel = (place: number): string => String(place).padStart(2, "0");

/** A row of the queue: its song, where it stands among those to come, and the id it is moved by. */
type QueueRow = Readonly<{ track: TrackSummary; index: number; itemId: string }>;

// NOTE: a playlist may repeat a song, so a row is known by its song and by
// which of that song's turns it is: its identity holds across a reordering.
const rowsOf = (later: Session["later"]): ReadonlyArray<QueueRow> => {
  const occurrences = new Map<string, number>();
  return later.map((track, index) => {
    const occurrence = occurrences.get(track.id) ?? 0;
    occurrences.set(track.id, occurrence + 1);
    return { track, index, itemId: `${track.id}/${occurrence}` };
  });
};

/**
 * Before which row the song being moved would be put down, were it let go
 * now: the row's place in the list as it is drawn, or one past the last.
 * Carried, the component counts that place among all the rows. Moved with
 * the keys, it counts among the others only, so the rows from the one moved
 * onwards are one further on.
 */
const maybePutBefore = (drag: DragAndDrop.Model): Option.Option<number> => {
  const { dragState } = drag;
  if (dragState._tag === "Dragging") {
    return Option.map(dragState.maybeDropTarget, (target) => target.index);
  }
  if (dragState._tag === "KeyboardDragging") {
    const { sourceIndex, targetIndex } = dragState;
    return Option.some(targetIndex >= sourceIndex ? targetIndex + 1 : targetIndex);
  }
  return Option.none();
};

/** Where the queue is drawn: on a face of the expanded player's sheet, or in the column beside the page. */
type QueueFace = "OnSheet" | "InColumn";

/** How a song of the queue is marked while one is being moved: itself moved, or where the moved one would go. */
const moveMarks = (
  row: QueueRow,
  count: number,
  drag: DragAndDrop.Model,
  h: HtmlBuilder<Message>,
) => {
  const putBefore = Option.getOrUndefined(maybePutBefore(drag));
  const isMoved =
    DragAndDrop.isDragging(drag) &&
    Option.contains(DragAndDrop.maybeDraggedItemId(drag), row.itemId);
  // Where it would be put down is shown as a line: over this row, or under the last.
  const mark =
    putBefore === row.index
      ? "before"
      : row.index === count - 1 && putBefore === count
        ? "after"
        : undefined;
  return [
    ...(isMoved ? [h.DataAttribute("moved", "")] : []),
    ...(mark === undefined ? [] : [h.DataAttribute("put", mark)]),
  ];
};

// MOVING A SONG OF THE QUEUE

// A song is taken up by its handle and carried: the row it came from grows
// dim, the song is drawn at the height of the finger that carries it, and a
// line shows where it would be put down.
//
// NOTE: the line is drawn in the row's own box, over its top or under its
// foot, and takes no room: rows that moved to show the place would move what
// the place is measured by.
const MOVE_CLASS =
  "data-moved:*:opacity-35 data-[put=before]:inset-shadow-[0_2px_0_var(--color-accent)] data-[put=after]:inset-shadow-[0_-2px_0_var(--color-accent)]";

// NOTE: a row of the queue is a list's row (`view/trackRow.ts`): the same
// row with the line under it, the same surface that a press lights, the same
// control that plays.
const QUEUE_ROW_CLASS = clsx(rowClass(), MOVE_CLASS);

const GRIP_CLASS =
  "flex flex-none cursor-grab items-center justify-center rounded-lg text-muted focus-ring-inset active:cursor-grabbing active:text-ink";

const GRIPS: Readonly<
  Record<QueueFace, Readonly<{ place: string; icon: (className: string) => Html; size: string }>>
> = {
  OnSheet: { place: "-mr-2 h-14.25 w-11", icon: gripIcon, size: "size-6" },
  // Six dots, in the column: smaller, beside a song's length.
  InColumn: { place: "-mr-1.5 h-11 w-8", icon: gripDotsIcon, size: "size-5" },
};

/**
 * The handle a song is taken up by, at the end of its row. On the sheet it
 * stands where a list's row has the song's length: there what matters of a
 * song is its place.
 */
const gripView = (
  row: QueueRow,
  drag: DragAndDrop.Model,
  face: QueueFace,
  h: HtmlBuilder<Message>,
): Html =>
  h.span(
    [
      ...DragAndDrop.draggable(
        {
          model: drag,
          toParentMessage: (message) => Message.GotQueueDragMessage({ message }),
          itemId: row.itemId,
          containerId: QUEUE_CONTAINER_ID,
          index: row.index,
        },
        h,
      ),
      // NOTE: after the component's own, so that these are the ones that
      // hold: it calls what is dragged an option of a listbox, and this is a
      // control at the end of a row of a list.
      h.Role("button"),
      h.AriaLabel(`Move: ${row.track.title}`),
      h.Class(clsx(GRIP_CLASS, GRIPS[face].place)),
    ],
    [GRIPS[face].icon(GRIPS[face].size)],
  );

/** The control that plays a song of the queue: the whole of its row, or its card, but the handle. */
const playView = (
  { track, index }: QueueRow,
  className: string,
  content: ReadonlyArray<Html>,
  h: HtmlBuilder<Message>,
): Html =>
  Button.view(
    {
      onClick: Message.ClickedQueueItem({ trackId: track.id, index }),
      toView: (attributes) =>
        h.button(
          [
            ...attributes.button,
            h.AriaLabel(`Play: ${track.title} by ${track.artist.name}`),
            rowPlayAttribute(h),
            h.Class(clsx(ROW_PLAY_CLASS, className)),
          ],
          content,
        ),
    },
    h,
  );

/** A song's title over who it is by, in the two sizes the column has. */
const columnWordsView = (
  track: TrackSummary,
  titleClass: string,
  artistClass: string,
  h: HtmlBuilder<Message>,
): Html =>
  h.span(
    [h.Class("block min-w-0 flex-1")],
    [
      h.span([h.Class(clsx("block truncate", titleClass))], [track.title]),
      h.span([h.Class(clsx("block truncate text-muted", artistClass))], [track.artist.name]),
    ],
  );

const columnLengthView = (track: TrackSummary, h: HtmlBuilder<Message>): Html =>
  h.span(
    [h.Class("shrink-0 pl-3 text-13 text-muted tabular-nums")],
    [formatDuration(track.durationSeconds)],
  );

/**
 * What a row of the queue shows of its song, and how tall it is. On the
 * sheet: its place in all that is played, and its title, large. In the
 * column: its place, its title over who it is by, and its length.
 */
const QUEUE_ROWS: Readonly<
  Record<
    QueueFace,
    Readonly<{
      ground: SurfaceGround;
      surface: string;
      play: string;
      content: (row: QueueRow, place: number, h: HtmlBuilder<Message>) => ReadonlyArray<Html>;
    }>
  >
> = {
  OnSheet: {
    ground: "OnPage",
    surface: "min-h-14.25 px-2",
    play: clsx(ROW_TOUCH_CLASS, "-ml-2 min-h-14.25 gap-3.5 pl-2"),
    content: ({ track }, place, h) => [
      h.span(
        [h.AriaHidden(true), h.Class("w-5.25 shrink-0 text-left text-13 text-muted tabular-nums")],
        [placeLabel(place)],
      ),
      h.span(
        [h.Class("min-w-0 flex-1 truncate text-left text-lg font-demi tracking-[-0.03em]")],
        [track.title],
      ),
    ],
  },
  InColumn: {
    ground: "OnPanel",
    surface: "min-h-13 px-2",
    play: "-ml-2 min-h-13 gap-3 pl-2 text-left",
    content: ({ track }, place, h) => [
      h.span(
        [h.AriaHidden(true), h.Class("w-5 shrink-0 text-xs text-muted tabular-nums")],
        [placeLabel(place)],
      ),
      columnWordsView(track, "text-15 leading-snug font-semibold tracking-[-0.01em]", "text-xs", h),
      columnLengthView(track, h),
    ],
  },
};

/** A song of those to come: what the face shows of it, and the handle it is moved by. */
const queueRowView = (
  row: QueueRow,
  place: number,
  count: number,
  drag: DragAndDrop.Model,
  face: QueueFace,
  h: HtmlBuilder<Message>,
): Html => {
  const look = QUEUE_ROWS[face];

  return h.keyed("li")(
    row.itemId,
    [...moveMarks(row, count, drag, h), h.Class(QUEUE_ROW_CLASS)],
    [
      h.div(
        [h.Class(clsx(rowSurfaceClass(look.ground), look.surface))],
        [playView(row, look.play, look.content(row, place, h), h), gripView(row, drag, face, h)],
      ),
    ],
  );
};

const rowsView = (
  later: Session["later"],
  firstPlace: number,
  drag: DragAndDrop.Model,
  h: HtmlBuilder<Message>,
): Html =>
  h.ol(
    [
      h.AriaLabel("Upcoming songs"),
      h.DataAttribute("droppable-id", QUEUE_CONTAINER_ID),
      h.Class("mt-2"),
    ],
    rowsOf(later).map((row) =>
      queueRowView(row, firstPlace + row.index, later.length, drag, "OnSheet", h),
    ),
  );

const lazyRows = createLazy();

/**
 * The songs to come, each with its place in all that is played and the
 * handle it is moved by. Kept in the document on the other faces too, empty
 * and hidden: the control that opens it names it as what it opens.
 */
export const queuePanelView = (session: Session, h: HtmlBuilder<Message>): Html => {
  const open = session.pane === "Queue";
  return h.div(
    [
      h.Id(PANEL_ID),
      h.Class(clsx("px-6 pt-1 pb-6", session.pane === "Artwork" ? "flex-none" : FACE_BODY_CLASS)),
      h.Hidden(!open),
    ],
    open
      ? [
          h.h2([h.Class(FACE_HEADING_CLASS)], ["Up next"]),
          session.later.length > 0
            ? lazyRows(rowsView, [session.later, session.earlier.length + 2, session.queueDrag, h])
            : h.p([h.Class("mt-3 text-sm text-muted")], ["No upcoming songs."]),
        ]
      : [],
  );
};

/**
 * The song being carried, drawn at the height of the finger that carries
 * it. It is drawn by the shell and not in the player's sheet: it is placed by
 * the screen, and the sheet is a box that what is in it is placed by.
 *
 * It goes up and down only. A song is moved to another place in a list that
 * runs one way, so the finger's drift to either side says nothing, and a row
 * that followed it sideways looked like one being taken out of the list.
 * Across, it stands where the list stands.
 */
export const queueGhostView = <M>(model: Model, isBeside: boolean, h: HtmlBuilder<M>): Html =>
  Option.match(
    Option.flatMap(model.maybeSession, (session) => {
      const { dragState } = session.queueDrag;
      return dragState._tag === "Dragging"
        ? Option.map(
            Array.findFirst(rowsOf(session.later), (row) => row.itemId === dragState.itemId),
            (row) => ({ row, clientY: dragState.current.clientY }),
          )
        : Option.none();
    }),
    {
      onNone: () => h.empty,
      onSome: ({ row, clientY }) =>
        h.div(
          [
            h.AriaHidden(true),
            h.Class(
              clsx("pointer-events-none fixed top-0 right-0 z-9999 flex justify-center", {
                // The lane is the width of the page the sheet is drawn over:
                // beside the navigation, where that is a column.
                "left-0 md:left-60": !isBeside,
                // Beside the page, the lane is the column the queue stands in.
                "w-(--queue-column)": isBeside,
              }),
            ),
            h.Style({ transform: `translate3d(0, ${String(clientY)}px, 0)` }),
          ],
          [
            h.div(
              [
                h.Class(
                  "w-[min(calc(100%-2rem),30rem)] -translate-y-1/2 truncate rounded-[0.875rem] bg-canvas px-4.5 py-4 text-lg/[1.5] font-demi tracking-[-0.03em] text-ink shadow-carried",
                ),
              ],
              [row.track.title],
            ),
          ],
        ),
    },
  );

// THE QUEUE BESIDE THE PAGE

const NEXT_IN_ISLAND_ID = "player-queue-control-next";
const COLUMN_TITLE_ID = "player-queue-column-title";

/**
 * The island's own way to the queue, on a desktop's screen: it opens the
 * queue beside the page and closes it again, and is lit while the queue is
 * there. What plays next is said to assistive technology here too.
 */
export const islandQueueButtonView = (
  model: Model,
  session: Session,
  h: HtmlBuilder<Message>,
): Html => {
  const isOpen = model.queueColumn === "Open";
  return iconButtonView(
    {
      look: "OnIsland",
      label: "Queue",
      content: [
        queueIcon("size-5"),
        h.span([h.Id(NEXT_IN_ISLAND_ID), h.Class("sr-only")], [nextLine(session)]),
      ],
      onClick: Message.ClickedIslandQueue(),
      attributes: [
        h.Id(QUEUE_CONTROL_ID),
        h.AriaDescribedBy(NEXT_IN_ISLAND_ID),
        h.AriaExpanded(isOpen),
        // NOTE: the column is in the document only while it is open, and a
        // control must not name what is not there.
        ...(isOpen ? [h.AriaControls(QUEUE_COLUMN_ID), h.DataAttribute("lit", "")] : []),
      ],
    },
    h,
  );
};

/**
 * The song that plays next, set apart at the head of the column on a card of
 * its own, with its cover. It is the first of the songs to come, and is
 * moved as any of them is.
 */
// NOTE: the card has a ground of its own, and is lit as the column's rows
// are, with the ink's colour and not the panel's, which is the column's own.
// It is a surface of its own and not a row's: what a row's surface is drawn
// with is the style sheet's, and a card that took it would have to undo it.
const nextCardView = (
  row: QueueRow,
  count: number,
  drag: DragAndDrop.Model,
  h: HtmlBuilder<Message>,
): Html => {
  const { track } = row;

  return h.div(
    [...moveMarks(row, count, drag, h), h.Class(clsx("mt-3 rounded-[0.875rem]", MOVE_CLASS))],
    [
      h.div(
        [
          h.Class(
            "flex min-h-21 items-center rounded-[0.875rem] border border-line bg-ink/5 py-2.5 pr-1.5 pl-2.5 transition-[background-color] duration-150 has-[[data-row-play]:active]:bg-ink/12 has-[[data-row-play]:hover:not(:active)]:bg-ink/8",
          ),
        ],
        [
          playView(
            row,
            "gap-3.5 text-left",
            [
              h.span(
                [
                  h.AriaHidden(true),
                  h.Class(
                    "flex size-14 flex-none items-center justify-center overflow-hidden rounded-lg bg-tile text-muted",
                  ),
                ],
                Option.match(Option.fromNullishOr(track.album.cover), {
                  onNone: () => [noteIcon("size-2/5")],
                  onSome: (cover) => [
                    h.img([
                      h.Decoding("async"),
                      h.Src(cover.small),
                      h.Alt(""),
                      h.Class("size-full object-cover"),
                    ]),
                  ],
                }),
              ),
              columnWordsView(
                track,
                "text-17 leading-snug font-bold tracking-[-0.02em]",
                "mt-0.5 text-13",
                h,
              ),
              columnLengthView(track, h),
            ],
            h,
          ),
          gripView(row, drag, "InColumn", h),
        ],
      ),
    ],
  );
};

const COLUMN_HEADING_CLASS = "text-15 font-[650] tracking-[-0.015em]";

const songCount = (count: number): string => `${String(count)} ${count === 1 ? "song" : "songs"}`;

/**
 * What the column lists: the song that plays next, on its card, and under it
 * the ones that play later. The whole of it is the one place a song can be
 * put down in, so a song is carried between the card and the list as it is
 * within the list.
 */
const columnBodyView = (
  later: Session["later"],
  firstPlace: number,
  drag: DragAndDrop.Model,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.DataAttribute("droppable-id", QUEUE_CONTAINER_ID), h.Class("min-h-0 flex-1 overflow-y-auto overscroll-contain px-5.5 pt-5 pb-8")],
    Array.match(rowsOf(later), {
      onEmpty: () => [h.p([h.Class("text-sm text-muted")], ["No upcoming songs."])],
      onNonEmpty: (rows) => {
        const rest = Array.tailNonEmpty(rows);
        return [
          h.h3([h.Class(COLUMN_HEADING_CLASS)], ["Up next"]),
          nextCardView(Array.headNonEmpty(rows), rows.length, drag, h),
          ...(Array.isReadonlyArrayNonEmpty(rest)
            ? [
                h.div(
                  [h.Class("mt-7 flex items-baseline justify-between")],
                  [
                    h.h3([h.Class(COLUMN_HEADING_CLASS)], ["Later"]),
                    h.span([h.Class("text-xs text-muted")], [songCount(rest.length)]),
                  ],
                ),
                h.ol(
                  [h.AriaLabel("Later"), h.Class("mt-1")],
                  rest.map((row) =>
                    queueRowView(row, firstPlace + row.index, rows.length, drag, "InColumn", h),
                  ),
                ),
              ]
            : []),
        ];
      },
    }),
  );

const lazyColumnBody = createLazy();

/**
 * The queue's column: its name and the control that closes it at its head,
 * and under them what it lists, which scrolls by itself. The page beside it
 * and the navigation each scroll by themselves too.
 */
export const queueColumnView = (session: Session, h: HtmlBuilder<Message>): Html =>
  h.aside(
    [h.Id(QUEUE_COLUMN_ID), h.AriaLabelledBy(COLUMN_TITLE_ID), h.Class(
        "flex min-h-0 w-(--queue-column) flex-none flex-col border-l border-line bg-panel text-ink [view-transition-name:queue-column]",
      ),
    ],
    [
      h.header(
        [h.Class("mx-5.5 flex flex-none items-center justify-between border-b border-line pt-5 pb-3.5")],
        [
          h.h2([h.Id(COLUMN_TITLE_ID), h.Class("text-[1.6875rem] leading-[1.2] font-bold tracking-[-0.04em]")], ["Queue"]),
          iconButtonView(
            {
              look: "OnPanel",
              label: "Close the queue",
              content: [closeIcon("size-4")],
              onClick: Message.ClickedCloseQueue(),
            },
            h,
          ),
        ],
      ),
      lazyColumnBody(columnBodyView, [session.later, session.earlier.length + 2, session.queueDrag, h]),
    ],
  );
