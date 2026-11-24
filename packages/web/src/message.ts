import { TrackId } from "@bafle/domain/Catalog/Track";
import { Menu } from "@foldkit/ui";
import * as Schema from "effect/Schema";
import { defineMessageUnion } from "foldkit/message";
import { UrlRequest } from "foldkit/navigation";
import { Url } from "foldkit/url";
import { Catalog } from "./catalog.ts";
import { Message as PlayerMessage } from "./player/message.ts";

// MESSAGE

/** The page a track was played from: its list there is what plays after it. */
export const PlayOrigin = Schema.Literals(["New", "Search", "Track"]);
export type PlayOrigin = typeof PlayOrigin.Type;

export const Message = defineMessageUnion({
  ClickedLink: { request: UrlRequest },
  ChangedUrl: { url: Url },
  ClickedBack: {},
  ClickedTryAgain: {},
  ClickedTryAgainOnTrack: { trackId: TrackId },
  UpdatedSearchField: { value: Schema.String },
  ClickedPlayTrack: { trackId: TrackId, from: PlayOrigin },
  GotRowMenuMessage: { from: PlayOrigin, trackId: TrackId, message: Menu.Message },
  ScrolledDown: {},
  ScrolledToTop: {},
  ClickedShowNavigation: {},
  GotPlayerMessage: { message: PlayerMessage },
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
  CompletedFocusNavigation: {},
  CompletedScrollPageToTop: {},
  CompletedWaitToClearRowDone: { turn: Schema.Int },
});
export type Message = typeof Message.Type;
