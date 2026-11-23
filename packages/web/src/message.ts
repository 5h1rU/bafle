import { TrackId } from "@bafle/domain/Catalog/Track";
import * as Schema from "effect/Schema";
import { defineMessageUnion } from "foldkit/message";
import { UrlRequest } from "foldkit/navigation";
import { Url } from "foldkit/url";
import { Catalog } from "./catalog.ts";

// MESSAGE

export const Message = defineMessageUnion({
  ClickedLink: { request: UrlRequest },
  ChangedUrl: { url: Url },
  ClickedBack: {},
  ClickedTryAgain: {},
  ClickedTryAgainOnTrack: { trackId: TrackId },
  UpdatedSearchField: { value: Schema.String },
  GotCatalogMessage: { message: Catalog.Message },
  CompletedNavigateInternal: {},
  CompletedNavigateBack: {},
  CompletedLoadExternal: {},
  CompletedReplaceSearchTerm: {},
  CompletedWaitForTypingPause: { pauseId: Schema.String },
  CompletedFocusSearchField: {},
  CompletedFocusPage: {},
  CompletedFocusTrackRow: {},
  CompletedScrollPageToTop: {},
});
export type Message = typeof Message.Type;
