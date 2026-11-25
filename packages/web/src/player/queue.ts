import type { TrackSummary } from "@bafle/domain/Catalog/Track";
import { Button, DragAndDrop } from "@foldkit/ui";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import { createLazy, type Html, type HtmlBuilder } from "foldkit/html";
import { gripIcon, queueIcon } from "../view/icon.ts";
import { Message } from "./message.ts";
import { type Model, QUEUE_CONTAINER_ID, type Session } from "./model.ts";

// THE QUEUE

// The songs to come, on a face of the expanded player. The way to it and
// back is a control under the player's controls. Every row ends in a handle:
// a song is taken up by it and carried to another place in the queue, or
// moved there with the keys. That is the whole of what can be done to the
// queue's order, with nothing to switch on first.

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
export const queueGhostView = <M>(model: Model, h: HtmlBuilder<M>): Html =>
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
            h.Class("queue-ghost-lane"),
            h.Style({ transform: `translate3d(0, ${String(clientY)}px, 0)` }),
          ],
          [h.div([h.Class("queue-ghost")], [row.track.title])],
        ),
    },
  );
