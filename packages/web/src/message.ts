import * as Schema from "effect/Schema";
import { defineMessageUnion } from "foldkit/message";
import { UrlRequest } from "foldkit/navigation";
import { Url } from "foldkit/url";
import { Catalog } from "./catalog.ts";

// MESSAGE

export const Message = defineMessageUnion({
  ClickedLink: { request: UrlRequest },
  ChangedUrl: { url: Url },
  ClickedTryAgain: {},
  UpdatedSearchField: { value: Schema.String },
  GotCatalogMessage: { message: Catalog.Message },
  CompletedNavigateInternal: {},
  CompletedLoadExternal: {},
  CompletedReplaceSearchTerm: {},
  CompletedWaitForTypingPause: { pauseId: Schema.String },
  CompletedFocusSearchField: {},
  CompletedFocusPage: {},
});
export type Message = typeof Message.Type;
