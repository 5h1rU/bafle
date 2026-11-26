import { TrackId } from "@bafle/domain/Catalog/Track";
import { Menu } from "@foldkit/ui";
import * as Schema from "effect/Schema";
import { defineMessageUnion } from "foldkit/message";
import { UrlRequest } from "foldkit/navigation";
import { Url } from "foldkit/url";
import { Catalog } from "./catalog.ts";
import { Message as PlayerMessage } from "./player/message.ts";
import { QueuePlace } from "./player/model.ts";
import { Screen } from "./screen.ts";
import { Message as SheetMessage } from "./sheet/model.ts";

// MESSAGE

/** The page a track was played from: its list there is what plays after it. */
export const PlayOrigin = Schema.Literals([
  "New",
  "Search",
  "Track",
  "Album",
  "Artist",
  "Playlist",
  "Genre",
  "Station",
]);
export type PlayOrigin = typeof PlayOrigin.Type;

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
  GotRowMenuMessage: { from: PlayOrigin, trackId: TrackId, message: Menu.Message },
  ScrolledDown: {},
  ScrolledToTop: {},
  ClickedShowNavigation: {},
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
  CompletedFocusPage: {},
  CompletedFocusTrackRow: {},
  CompletedFocusAlbumTile: {},
  CompletedFocusArtistTile: {},
  CompletedFocusPlaylistTile: {},
  CompletedFocusGenreTile: {},
  CompletedFocusStationTile: {},
  CompletedFocusNavigation: {},
  CompletedScrollPageToTop: {},
  CompletedHoldDockMotion: {},
  CompletedWaitToClearRowDone: { turn: Schema.Int },
});
export type Message = typeof Message.Type;
