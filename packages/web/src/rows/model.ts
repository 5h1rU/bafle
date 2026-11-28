import { TrackId } from "@bafle/domain/Catalog/Track";
import { Menu } from "@foldkit/ui";
import * as HashMap from "effect/HashMap";
import { pipe } from "effect/Function";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { modifyFields } from "foldkit/struct";
import { PlayOrigin } from "../playOrigin.ts";
import { QueuePlace } from "../player/model.ts";

// MODEL

// Every row of a list ends in a control that opens a menu of what can be
// done with its track besides playing it, which is what a press of the row
// does. The menu is Foldkit UI's, one for each row, and each keeps its own
// Model: whether it is open, which of its items is active.

export const RowAction = Schema.Literals(["PlayNext", "AddToQueue", "OpenAlbum", "OpenSong"]);
export type RowAction = typeof RowAction.Type;

export const RowMenu = Menu.create<RowAction>();

/** A row, by what tells it from every other: the page it is on and its track. */
export const RowId = Schema.Struct({ from: PlayOrigin, trackId: TrackId });
export type RowId = typeof RowId.Type;

export const rowMenuId = ({ from, trackId }: RowId): string =>
  `row-menu-${from.toLowerCase()}-${trackId}`;

/**
 * The row whose control shows, for a moment, that what was chosen from its
 * menu is done: its track was put in the queue, and where. Each one takes
 * the next turn, so the moment that ends for an earlier one clears nothing.
 */
export const Done = Schema.Struct({
  turn: Schema.Int,
  maybeRow: Schema.Option(
    Schema.Struct({ from: PlayOrigin, trackId: TrackId, place: QueuePlace }),
  ),
});
export type Done = typeof Done.Type;

/**
 * What the rows of every list keep between them: the menus at their ends,
 * and which of them shows that something was done.
 */
export const Model = Schema.Struct({
  /**
   * The menus at the end of the rows, each under its row's id: those that
   * have been touched. Any other is a closed menu, and is not kept.
   */
  menus: Schema.HashMap(Schema.String, Menu.Model),
  done: Done,
  /**
   * Whether a menu comes and goes little by little. It does for a listener
   * who uses a pointer; one who uses the keys finds it there at once.
   */
  isAnimated: Schema.Boolean,
});
export type Model = typeof Model.Type;

export const init = (): Model => ({
  menus: HashMap.empty(),
  done: { turn: 0, maybeRow: Option.none() },
  isAnimated: true,
});

// READ

// NOTE: not `isModal`. A modal menu makes everything but its button and its
// items inert, its own backdrop included, so a press outside would close it
// only by taking the focus from it. Here the backdrop hears the press itself,
// and does what is wanted of a modal one besides: it covers the screen, so
// the list behind keeps still and a press anywhere else only closes the menu.
export const menuOf = (model: Model, rowId: RowId): Menu.Model =>
  Option.getOrElse(HashMap.get(model.menus, rowMenuId(rowId)), () =>
    Menu.init({ id: rowMenuId(rowId), isAnimated: true }),
  );

/** Where a row's track was just put in the queue, while its control still shows that it was. */
export const maybeQueuedPlace = (model: Model, rowId: RowId): Option.Option<QueuePlace> =>
  pipe(
    model.done.maybeRow,
    Option.filter((row) => row.from === rowId.from && row.trackId === rowId.trackId),
    Option.map((row) => row.place),
  );

/** The rows with every menu closed: none of them is kept. */
export const withMenusClosed = (model: Model): Model =>
  HashMap.isEmpty(model.menus) ? model : modifyFields(model, { menus: () => HashMap.empty() });
