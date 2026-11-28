import { TrackId } from "@bafle/domain/Catalog/Track";
import { Popover } from "@foldkit/ui";
import * as Schema from "effect/Schema";
import { defineMessageUnion } from "foldkit/message";
import { UrlRequest } from "foldkit/navigation";
import { Url } from "foldkit/url";
import { Catalog } from "./catalog.ts";
import { PlayOrigin } from "./playOrigin.ts";
import { Message as PlayerMessage } from "./player/message.ts";
import { QueuePlace } from "./player/model.ts";
import { Message as RowsMessage } from "./rows/message.ts";
import { Screen } from "./screen.ts";
import { Message as SheetMessage } from "./sheet/message.ts";
import { TurnWay } from "./turn.ts";

// MESSAGE

export { PlayOrigin } from "./playOrigin.ts";

export const InputMethod = Schema.Literals(["Keyboard", "Pointer"]);
export type InputMethod = typeof InputMethod.Type;

export const Message = defineMessageUnion({
  ChangedInputMethod: { method: InputMethod },
  /** The document says how much room the app has: as it starts, and whenever that changes. */
  ChangedScreen: { screen: Screen },
  ClickedLink: { request: UrlRequest },
  ChangedUrl: { url: Url },
  ClickedBack: {},
  ClickedTryAgain: {},
  /** The browser says the device has a connection again. */
  RegainedConnection: {},
  /** The browser says the device has no connection: as the app starts without one, or once it is lost. */
  LostConnection: {},
  /** The control that puts away the notice over a page that could not be refreshed. */
  ClickedDismissStaleNotice: {},
  /** A track's own page asks for its track to be put in the queue. */
  ClickedQueueTrack: { trackId: TrackId, place: QueuePlace },
  UpdatedSearchField: { value: Schema.String },
  /** The control at the end of Search's field, which empties it. */
  ClickedClearSearch: {},
  /** Escape in Search's field, with something typed in it: it empties the field too. */
  PressedEscapeInSearch: {},
  ClickedPlayTrack: { trackId: TrackId, from: PlayOrigin },
  /** The rows of every list: the menus at their ends, and what they show was done. */
  GotRowsMessage: { message: RowsMessage },
  /** Home's control that says who made the app, and what it opens. */
  GotAboutMessage: { message: Popover.Message },
  ScrolledDown: {},
  ScrolledToTop: {},
  /** How far down from its top the page gone back to stands, as it takes the screen. */
  MeasuredReturnedPage: { top: Schema.Number },
  ClickedShowNavigation: {},
  /** One of the two arrows of a row that goes on sideways: it turns the row a screenful that way. */
  ClickedTurnRow: { rowId: Schema.String, way: TurnWay },
  CompletedTurnRow: {},
  GotPlayerMessage: { message: PlayerMessage },
  GotPlayerSheetMessage: { message: SheetMessage },
  GotCatalogMessage: { message: Catalog.Message },
  CompletedNavigateInternal: {},
  CompletedNavigateBack: {},
  CompletedLoadExternal: {},
  CompletedReplaceSearchTerm: {},
  CompletedReplaceTrackUrl: {},
  CompletedWaitForTypingPause: { pauseId: Schema.String },
  CompletedFocusSearchField: {},
  CompletedShowSearchFromTop: {},
  /** A finger dragged Search's page, off the field's own box, while the field had the focus. */
  DraggedSearchPage: {},
  CompletedLetGoOfSearchField: {},
  CompletedFocusPage: {},
  CompletedFocusTrackRow: {},
  CompletedFocusAlbumTile: {},
  CompletedFocusArtistTile: {},
  CompletedFocusPlaylistTile: {},
  CompletedFocusGenreTile: {},
  CompletedFocusStationTile: {},
  CompletedFocusNavigation: {},
  CompletedScrollPageToTop: {},
  CompletedPaintSystemBar: {},
  CompletedHoldDockMotion: {},
});
export type Message = typeof Message.Type;
