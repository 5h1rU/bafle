import { AsyncData } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { LoadError } from "../catalog.ts";
import type { Message } from "../message.ts";
import { failureView } from "./feedback.ts";

// VIEW

/**
 * What a page shows for each state of its data: placeholders in its shape
 * while there is nothing yet, the failure when there is nothing to show, and
 * otherwise the content.
 */
export const pageDataView = <A>(
  data: AsyncData.AsyncData<A, LoadError>,
  what: string,
  toPlaceholder: () => Html,
  toContent: (held: A) => Html,
  h: HtmlBuilder<Message>,
): Html =>
  AsyncData.matchData(data, {
    onEmpty: toPlaceholder,
    onFailure: (error) => failureView(what, error, h),
    // NOTE: what is held is shown as it is, whether fresh, refreshing, or
    // left over from a refresh that failed. That a refresh failed is said
    // over the page, by the shell (`staleBannerView`), and not in it.
    onData: toContent,
  });
