import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { LoadError } from "../catalog.ts";
import type { Message } from "../message.ts";
import { failureView, staleNoticeView } from "./feedback.ts";

// VIEW

/**
 * Content a page holds, under the place where a failed refresh is noted.
 * The place is there whether or not there is anything to note, so the
 * content below keeps its elements, and with them its scroll position and
 * its pictures, when a notice comes or goes.
 */
const heldView = (
  maybeRefreshError: Option.Option<LoadError>,
  content: Html,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [],
    [
      h.div(
        [],
        Option.match(maybeRefreshError, {
          onNone: () => [],
          onSome: (error) => [staleNoticeView(error, h)],
        }),
      ),
      content,
    ],
  );

/**
 * What a page shows for each state of its data: placeholders in its shape
 * while there is nothing yet, the failure when there is nothing to show, and
 * otherwise the content, whether it is fresh, refreshing, or left over from
 * a refresh that failed.
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
    onData: (held) => heldView(AsyncData.getError(data), toContent(held), h),
  });
