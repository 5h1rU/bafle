import type { TrackSummary } from "@bafle/domain/Catalog/Track";
import { Button, DragAndDrop } from "@foldkit/ui";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import { createLazy, type Html, type HtmlBuilder } from "foldkit/html";
import { closeIcon, gripDotsIcon, gripIcon, noteIcon, queueIcon } from "../view/icon.ts";
import { formatDuration } from "../view/time.ts";
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
  return Button.view(
    {
      onClick: Message.ClickedQueue(),
      toView: (attributes) =>
        h.button(
          [
            ...attributes.button,
            h.AriaLabel("Playing Next"),
            h.AriaDescribedBy(NEXT_ID),
            h.AriaExpanded(isOpen),
            h.AriaControls(PANEL_ID),
            ...(isOpen ? [h.DataAttribute("lit", "")] : []),
            h.Class("player-action"),
          ],
          [
            queueIcon("size-6"),
            h.span([h.Id(NEXT_ID), h.Class("sr-only")], [nextLine(session)]),
          ],
        ),
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

// NOTE: a row here is a list's row (`track-row` in styles.css): the line
// under it is the row's, and its surface, which is what a press lights, has
// rounded corners and stands a little outside the column, so that the line
// under the row and the one above it go when the surface is lit.
const ROW_CLASS = "track-row queue-row";
const ROW_SURFACE_CLASS = "track-row-surface -mx-2 flex min-h-[3.5625rem] items-center px-2";

const rowView = (
  row: QueueRow,
  place: number,
  count: number,
  drag: DragAndDrop.Model,
  h: HtmlBuilder<Message>,
): Html => {
  const { track, index, itemId } = row;
  const putBefore = Option.getOrUndefined(maybePutBefore(drag));
  const isMoved =
    DragAndDrop.isDragging(drag) && Option.contains(DragAndDrop.maybeDraggedItemId(drag), itemId);
  // Where it would be put down is shown as a line: over this row, or under the last.
  const mark =
    putBefore === index ? "before" : index === count - 1 && putBefore === count ? "after" : undefined;

  return h.keyed("li")(
    itemId,
    [
      ...(isMoved ? [h.DataAttribute("moved", "")] : []),
      ...(mark === undefined ? [] : [h.DataAttribute("put", mark)]),
      h.Class(ROW_CLASS),
    ],
    [
      h.div(
        [h.Class(ROW_SURFACE_CLASS)],
        [
          Button.view(
            {
              onClick: Message.ClickedQueueItem({ trackId: track.id, index }),
              toView: (attributes) =>
                h.button(
                  [
                    ...attributes.button,
                    h.AriaLabel(`Play: ${track.title} by ${track.artist.name}`),
                    h.Class(
                      "track-row-play -ml-2 flex min-h-[3.5625rem] min-w-0 flex-1 cursor-pointer touch-manipulation items-center gap-3.5 rounded-lg pl-2 select-none [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
                    ),
                  ],
                  [
                    h.span(
                      [
                        h.AriaHidden(true),
                        h.Class("w-[1.3125rem] shrink-0 text-left text-[0.8125rem] text-muted tabular-nums"),
                      ],
                      [placeLabel(place)],
                    ),
                    h.span(
                      [h.Class("min-w-0 flex-1 truncate text-left text-lg font-[550] tracking-[-0.03em]")],
                      [track.title],
                    ),
                  ],
                ),
            },
            h,
          ),
          // The handle the song is taken up by. It stands where a list's row
          // has the song's length: here what matters of a song is its place.
          h.span(
            [
              ...DragAndDrop.draggable(
                {
                  model: drag,
                  toParentMessage: (message) => Message.GotQueueDragMessage({ message }),
                  itemId,
                  containerId: QUEUE_CONTAINER_ID,
                  index,
                },
                h,
              ),
              // NOTE: after the component's own, so that these are the ones
              // that hold: it calls what is dragged an option of a listbox,
              // and this is a control at the end of a row of a list.
              h.Role("button"),
              h.AriaLabel(`Move: ${track.title}`),
              h.Class("queue-grip"),
            ],
            [gripIcon("size-6")],
          ),
        ],
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
    rowsOf(later).map((row) => rowView(row, firstPlace + row.index, later.length, drag, h)),
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
    [h.Id(PANEL_ID), h.Class("player-queue"), h.Hidden(!open)],
    open
      ? [
          h.h2([h.Class("player-face-heading")], ["Up next"]),
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
 * Across, it stands where the list stands (`queue-ghost-lane` in
 * player.css).
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
            // Beside the page, the lane is the column the queue stands in.
            ...(isBeside ? [h.DataAttribute("beside", "")] : []),
            h.Class("queue-ghost-lane"),
            h.Style({ transform: `translate3d(0, ${String(clientY)}px, 0)` }),
          ],
          [h.div([h.Class("queue-ghost")], [row.track.title])],
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
  return Button.view(
    {
      onClick: Message.ClickedIslandQueue(),
      toView: (attributes) =>
        h.button(
          [
            ...attributes.button,
            h.Id(QUEUE_CONTROL_ID),
            h.AriaLabel("Queue"),
            h.AriaDescribedBy(NEXT_IN_ISLAND_ID),
            h.AriaExpanded(isOpen),
            // NOTE: the column is in the document only while it is open, and
            // a control must not name what is not there.
            ...(isOpen ? [h.AriaControls(QUEUE_COLUMN_ID), h.DataAttribute("lit", "")] : []),
            h.Class("island-action"),
          ],
          [
            queueIcon("size-5"),
            h.span([h.Id(NEXT_IN_ISLAND_ID), h.Class("sr-only")], [nextLine(session)]),
          ],
        ),
    },
    h,
  );
};

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

/** The handle a song of the column is taken up by: six dots at the end of its row. */
const columnGripView = (row: QueueRow, drag: DragAndDrop.Model, h: HtmlBuilder<Message>): Html =>
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
      // NOTE: after the component's own, as on the sheet's rows (`rowView`).
      h.Role("button"),
      h.AriaLabel(`Move: ${row.track.title}`),
      h.Class("queue-grip queue-column-grip"),
    ],
    [gripDotsIcon("size-5")],
  );

const PLAY_IN_COLUMN_CLASS =
  "track-row-play flex min-w-0 flex-1 cursor-pointer items-center rounded-lg text-left select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";

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
      h.span([h.Class(`block truncate ${titleClass}`)], [track.title]),
      h.span([h.Class(`block truncate text-muted ${artistClass}`)], [track.artist.name]),
    ],
  );

const columnLengthView = (track: TrackSummary, h: HtmlBuilder<Message>): Html =>
  h.span(
    [h.Class("shrink-0 pl-3 text-[0.8125rem] text-muted tabular-nums")],
    [formatDuration(track.durationSeconds)],
  );

/**
 * The song that plays next, set apart at the head of the column on a card of
 * its own, with its cover. It is the first of the songs to come, and is
 * moved as any of them is.
 */
const nextCardView = (
  row: QueueRow,
  count: number,
  drag: DragAndDrop.Model,
  h: HtmlBuilder<Message>,
): Html => {
  const { track, index } = row;
  return h.div(
    [...moveMarks(row, count, drag, h), h.Class("queue-row queue-next")],
    [
      h.div(
        [h.Class("track-row-surface queue-next-surface")],
        [
          Button.view(
            {
              onClick: Message.ClickedQueueItem({ trackId: track.id, index }),
              toView: (attributes) =>
                h.button(
                  [
                    ...attributes.button,
                    h.AriaLabel(`Play: ${track.title} by ${track.artist.name}`),
                    h.Class(`${PLAY_IN_COLUMN_CLASS} gap-3.5`),
                  ],
                  [
                    h.span(
                      [h.AriaHidden(true), h.Class("queue-next-cover")],
                      Option.match(Option.fromNullishOr(track.album.cover), {
                        onNone: () => [noteIcon("size-2/5")],
                        onSome: (cover) => [h.img([h.Decoding("async"), h.Src(cover.small), h.Alt("")])],
                      }),
                    ),
                    columnWordsView(
                      track,
                      "text-[1.0625rem] leading-snug font-bold tracking-[-0.02em]",
                      "mt-0.5 text-[0.8125rem]",
                      h,
                    ),
                    columnLengthView(track, h),
                  ],
                ),
            },
            h,
          ),
          columnGripView(row, drag, h),
        ],
      ),
    ],
  );
};

/** A song of those that play later: its place in all that is played, its title and who it is by, its length, its handle. */
const laterRowView = (
  row: QueueRow,
  place: number,
  count: number,
  drag: DragAndDrop.Model,
  h: HtmlBuilder<Message>,
): Html => {
  const { track, index, itemId } = row;
  return h.keyed("li")(
    itemId,
    [...moveMarks(row, count, drag, h), h.Class("track-row queue-row")],
    [
      h.div(
        [h.Class("track-row-surface -mx-2 flex min-h-[3.25rem] items-center px-2")],
        [
          Button.view(
            {
              onClick: Message.ClickedQueueItem({ trackId: track.id, index }),
              toView: (attributes) =>
                h.button(
                  [
                    ...attributes.button,
                    h.AriaLabel(`Play: ${track.title} by ${track.artist.name}`),
                    h.Class(`${PLAY_IN_COLUMN_CLASS} -ml-2 min-h-[3.25rem] gap-3 pl-2`),
                  ],
                  [
                    h.span(
                      [
                        h.AriaHidden(true),
                        h.Class("w-5 shrink-0 text-xs text-muted tabular-nums"),
                      ],
                      [placeLabel(place)],
                    ),
                    columnWordsView(
                      track,
                      "text-[0.9375rem] leading-snug font-semibold tracking-[-0.01em]",
                      "text-xs",
                      h,
                    ),
                    columnLengthView(track, h),
                  ],
                ),
            },
            h,
          ),
          columnGripView(row, drag, h),
        ],
      ),
    ],
  );
};

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
    [h.DataAttribute("droppable-id", QUEUE_CONTAINER_ID), h.Class("queue-column-body")],
    Array.match(rowsOf(later), {
      onEmpty: () => [h.p([h.Class("text-sm text-muted")], ["No upcoming songs."])],
      onNonEmpty: (rows) => {
        const rest = Array.tailNonEmpty(rows);
        return [
          h.h3([h.Class("queue-column-heading")], ["Up next"]),
          nextCardView(Array.headNonEmpty(rows), rows.length, drag, h),
          ...(Array.isReadonlyArrayNonEmpty(rest)
            ? [
                h.div(
                  [h.Class("mt-7 flex items-baseline justify-between")],
                  [
                    h.h3([h.Class("queue-column-heading")], ["Later"]),
                    h.span([h.Class("text-xs text-muted")], [songCount(rest.length)]),
                  ],
                ),
                h.ol(
                  [h.AriaLabel("Later"), h.Class("mt-1")],
                  rest.map((row) => laterRowView(row, firstPlace + row.index, rows.length, drag, h)),
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
    [h.Id(QUEUE_COLUMN_ID), h.AriaLabelledBy(COLUMN_TITLE_ID), h.Class("queue-column")],
    [
      h.header(
        [h.Class("queue-column-head")],
        [
          h.h2([h.Id(COLUMN_TITLE_ID), h.Class("queue-column-title")], ["Queue"]),
          Button.view(
            {
              onClick: Message.ClickedCloseQueue(),
              toView: (attributes) =>
                h.button(
                  [...attributes.button, h.AriaLabel("Close the queue"), h.Class("queue-column-close")],
                  [closeIcon("size-4")],
                ),
            },
            h,
          ),
        ],
      ),
      lazyColumnBody(columnBodyView, [session.later, session.earlier.length + 2, session.queueDrag, h]),
    ],
  );
