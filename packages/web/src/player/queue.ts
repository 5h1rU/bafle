import type { TrackSummary } from "@bafle/domain/Catalog/Track";
import { Button } from "@foldkit/ui";
import { clsx } from "clsx";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import { createLazy, type Html, type HtmlBuilder } from "foldkit/html";
import { backIcon, forwardIcon, queueIcon, removeIcon } from "../view/icon.ts";
import { formatDuration } from "../view/time.ts";
import { Message } from "./message.ts";
import type { Session } from "./model.ts";

// THE QUEUE

// The songs to come, on the expanded player's second face (design/album.pen,
// "Isla abierta · Playing Next"). The song's face has the way in: a row
// under the controls that names the song that plays next. The queue's face
// has the way back, in the name at its head.

const PANEL_ID = "player-queue";
const NEXT_ID = "player-queue-next";

const BUTTON_CLASS =
  "inline-flex min-h-11 min-w-11 cursor-pointer touch-manipulation items-center justify-center rounded-full hover:bg-tile focus-visible:outline-2 focus-visible:outline-accent aria-disabled:cursor-default aria-disabled:opacity-30";

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
  const isOpen = session.pane === "Queue" || session.pane === "EditingQueue";
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

const editFaces = {
  Earlier: { label: "Move up", icon: () => backIcon("size-4 rotate-90") },
  Later: { label: "Move down", icon: () => forwardIcon("size-4 rotate-90") },
  Remove: { label: "Remove", icon: () => removeIcon("size-4") },
} as const;

const editControl = (
  track: TrackSummary,
  index: number,
  action: keyof typeof editFaces,
  disabled: boolean,
  h: HtmlBuilder<Message>,
): Html => {
  const { label, icon } = editFaces[action];
  return Button.view(
    {
      onClick: Message.ClickedQueueEdit({ trackId: track.id, index, action }),
      isDisabled: disabled,
      toView: (attributes) =>
        h.button(
          [
            ...attributes.button,
            h.AriaLabel(`${label}: ${track.title}`),
            h.Class(clsx(BUTTON_CLASS, "text-muted")),
          ],
          [icon()],
        ),
    },
    h,
  );
};

/** A song's place in all that is played: the current one's, and on from there. */
const placeLabel = (place: number): string => String(place).padStart(2, "0");

const rowContents = (track: TrackSummary, place: number, h: HtmlBuilder<Message>): ReadonlyArray<Html> => [
  h.span(
    [h.AriaHidden(true), h.Class("w-[1.3125rem] shrink-0 text-left text-[0.8125rem] text-muted tabular-nums")],
    [placeLabel(place)],
  ),
  h.span(
    [h.Class("min-w-0 flex-1 truncate text-left text-lg font-[550] tracking-[-0.03em]")],
    [track.title],
  ),
];

// NOTE: a row here is a list's row (`track-row` in styles.css): the line
// under it is the row's, and its surface, which is what a press lights, has
// rounded corners and stands a little outside the column, so that the line
// under the row and the one above it go when the surface is lit.
const ROW_CLASS = "track-row";
const ROW_SURFACE_CLASS = "track-row-surface -mx-2 flex min-h-[3.5625rem] items-center gap-3.5 px-2";

const rowsView = (
  later: Session["later"],
  firstPlace: number,
  editing: boolean,
  h: HtmlBuilder<Message>,
): Html => {
  // A playlist may repeat a song. Keep each row's identity across reordering.
  const occurrences = new Map<string, number>();
  return h.ol(
    [h.AriaLabel("Upcoming songs"), h.Class("mt-2")],
    later.map((track, index) => {
      const occurrence = occurrences.get(track.id) ?? 0;
      occurrences.set(track.id, occurrence + 1);
      const contents = rowContents(track, firstPlace + index, h);
      const controls = editing
        ? [
            h.div([h.Class("flex min-w-0 flex-1 items-center gap-3.5")], contents),
            editControl(track, index, "Earlier", index === 0, h),
            editControl(track, index, "Later", index === later.length - 1, h),
            editControl(track, index, "Remove", false, h),
          ]
        : [
            Button.view(
              {
                onClick: Message.ClickedQueueItem({ trackId: track.id, index }),
                toView: (attributes) =>
                  h.button(
                    [
                      ...attributes.button,
                      h.AriaLabel(`Play: ${track.title} by ${track.artist.name}`),
                      h.Class(
                        "track-row-play -mx-2 flex min-h-[3.5625rem] w-[calc(100%+1rem)] cursor-pointer touch-manipulation items-center gap-3.5 rounded-lg px-2 select-none [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
                      ),
                    ],
                    [
                      ...contents,
                      h.span(
                        [h.Class("text-sm text-muted tabular-nums")],
                        [formatDuration(track.durationSeconds)],
                      ),
                    ],
                  ),
              },
              h,
            ),
          ];
      return h.keyed("li")(`${track.id}/${occurrence}`, [h.Class(ROW_CLASS)], [
        h.div([h.Class(ROW_SURFACE_CLASS)], controls),
      ]);
    }),
  );
};

const lazyRows = createLazy();

/**
 * The songs to come, each with its place in all that is played, and the
 * control that lets the listener move them and take them out. Kept in the
 * document on the song's face too, empty and hidden: the two ways in name it
 * as what they open.
 */
export const queuePanelView = (session: Session, h: HtmlBuilder<Message>): Html => {
  const open = session.pane === "Queue" || session.pane === "EditingQueue";
  const editing = session.pane === "EditingQueue";
  return h.div(
    [h.Id(PANEL_ID), h.Class("player-queue"), h.Hidden(!open)],
    open
      ? [
          h.div(
            [h.Class("flex min-h-12 items-center justify-between gap-3")],
            [
              h.h2([h.Class("player-face-heading")], ["Up next"]),
              session.later.length > 0 || editing
                ? Button.view(
                    {
                      onClick: Message.ClickedEditQueue(),
                      toView: (attributes) =>
                        h.button(
                          [
                            ...attributes.button,
                            h.Class(
                              "inline-flex h-11 min-w-[3.75rem] cursor-pointer touch-manipulation items-center justify-center rounded-full bg-accent-wash px-4 text-[0.9375rem] font-[650] text-accent focus-visible:outline-2 focus-visible:outline-accent",
                            ),
                          ],
                          [editing ? "Done" : "Edit"],
                        ),
                    },
                    h,
                  )
                : h.empty,
            ],
          ),
          session.later.length > 0
            ? lazyRows(rowsView, [session.later, session.earlier.length + 2, editing, h])
            : h.p([h.Class("mt-3 text-sm text-muted")], ["No upcoming songs."]),
        ]
      : [],
  );
};
