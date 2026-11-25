import type { TrackSummary } from "@bafle/domain/Catalog/Track";
import { Button } from "@foldkit/ui";
import { clsx } from "clsx";
import * as Option from "effect/Option";
import { createLazy, type Html, type HtmlBuilder } from "foldkit/html";
import { artworkView } from "../view/artwork.ts";
import { backIcon, forwardIcon, playNextIcon, removeIcon } from "../view/icon.ts";
import { formatDuration } from "../view/time.ts";
import { Message } from "./message.ts";
import type { Session } from "./model.ts";

const PANEL_ID = "player-queue";
const BUTTON_CLASS =
  "inline-flex min-h-11 min-w-11 cursor-pointer touch-manipulation items-center justify-center rounded-full hover:bg-tile focus-visible:outline-2 focus-visible:outline-accent aria-disabled:cursor-default aria-disabled:opacity-30";

export const queueToggleView = (isOpen: boolean, h: HtmlBuilder<Message>): Html =>
  Button.view({
    onClick: Message.ClickedQueue(),
    toView: (attrs) => h.button([
      ...attrs.button,
      h.AriaLabel("Playing Next"),
      h.AriaExpanded(isOpen),
      h.AriaControls(PANEL_ID),
      h.Class(clsx(BUTTON_CLASS, isOpen ? "bg-accent-wash text-accent" : "bg-tile/65 text-muted")),
    ], [playNextIcon("size-5")]),
  }, h);

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
  return Button.view({
    onClick: Message.ClickedQueueEdit({ trackId: track.id, index, action }),
    isDisabled: disabled,
    toView: (attrs) => h.button([
      ...attrs.button,
      h.AriaLabel(`${label}: ${track.title}`),
      h.Class(clsx(BUTTON_CLASS, "text-muted")),
    ], [icon()]),
  }, h);
};

const rowContents = (track: TrackSummary, h: HtmlBuilder<Message>): ReadonlyArray<Html> => [
  h.div([h.Class("w-11 shrink-0")], [
    artworkView(Option.fromNullishOr(track.album.cover), "Square", "small", h),
  ]),
  h.span([h.Class("min-w-0 flex-1 text-left")], [
    h.span([h.Class("block truncate text-[0.9375rem] font-semibold")], [track.title]),
    h.span([h.Class("block truncate text-sm text-muted")], [track.artist.name]),
  ]),
];

const rowsView = (
  later: Session["later"],
  editing: boolean,
  h: HtmlBuilder<Message>,
): Html => {
  // A playlist may repeat a song. Keep each row's identity across reordering.
  const occurrences = new Map<string, number>();
  return h.ol([h.AriaLabel("Upcoming songs"), h.Class("divide-y divide-line")],
    later.map((track, index) => {
      const occurrence = occurrences.get(track.id) ?? 0;
      occurrences.set(track.id, occurrence + 1);
      const contents = rowContents(track, h);
      const controls = editing
        ? [
            h.div([h.Class("flex min-w-0 flex-1 items-center gap-3 py-1")], contents),
            editControl(track, index, "Earlier", index === 0, h),
            editControl(track, index, "Later", index === later.length - 1, h),
            editControl(track, index, "Remove", false, h),
          ]
        : [
            Button.view({
              onClick: Message.ClickedQueueItem({ trackId: track.id, index }),
              toView: (attrs) => h.button([
                ...attrs.button,
                h.AriaLabel(`Play: ${track.title} by ${track.artist.name}`),
                h.Class("flex w-full cursor-pointer touch-manipulation items-center gap-3 rounded-lg py-1.5 hover:bg-tile focus-visible:outline-2 focus-visible:outline-accent active:bg-tile"),
              ], [
                ...contents,
                h.span([h.Class("pr-1 text-xs text-muted tabular-nums")], [formatDuration(track.durationSeconds)]),
              ]),
            }, h),
          ];
      return h.keyed("li")(`${track.id}/${occurrence}`, [h.Class("flex items-center py-1")], controls);
    }),
  );
};

const lazyRows = createLazy();

export const queuePanelView = (session: Session, h: HtmlBuilder<Message>): Html => {
  const open = session.pane !== "Artwork";
  const editing = session.pane === "EditingQueue";
  return h.div([h.Id(PANEL_ID), h.Hidden(!open)], open ? [
    h.div([h.Class("flex items-center justify-between gap-3")], [
      h.h2([h.Class("text-xl font-bold tracking-tight")], ["Playing Next"]),
      session.later.length > 0 || editing
        ? Button.view({
            onClick: Message.ClickedEditQueue(),
            toView: (attrs) => h.button([
              ...attrs.button, h.Class(clsx(BUTTON_CLASS, "px-3 text-sm font-semibold text-accent")),
            ], [editing ? "Done" : "Edit"]),
          }, h)
        : h.empty,
    ]),
    session.later.length > 0
      ? lazyRows(rowsView, [session.later, editing, h])
      : h.p([h.Class("mt-3 text-sm text-muted")], ["No upcoming songs."]),
  ] : []);
};
