import { ListenerApi } from "@bafle/domain/ListenerApi.api";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import { Runtime } from "foldkit";
import {
  CLOSE_DETAIL,
  ISLAND_APPEARS,
  OPEN_DETAIL,
  POP_PAGE,
  PUSH_PAGE,
  SWITCH_SECTION,
  init,
  update,
  viewTransition,
} from "./main.ts";
import { Message } from "./message.ts";
import { Model, addressOf } from "./model.ts";
import * as HtmlAudioEngine from "./player/htmlAudioEngine.ts";
import { subscriptions } from "./subscription.ts";
import * as Timing from "./timing.ts";
import { view } from "./view.ts";
import { isSameRoute } from "./route.ts";
import { CHOOSE_TRACK } from "./view/artwork.ts";
import { crashView } from "./view/crash.ts";
import { SHOWN_BY_BROWSER_ATTRIBUTE, isShownByBrowser } from "./view/shownByBrowser.ts";

/**
 * The Api client for the life of the app, over plain HTTP on the app's own
 * origin. The app only asks queries: one request, one answer. The WebSocket
 * protocol exists for live reads (`watch`, `events`), and Bafle has none.
 */
const CatalogConnection = ListenerApi.layerClientHttp(`${location.origin}/api`).pipe(
  Layer.provide(FetchHttpClient.layer),
);

/**
 * What the app's Commands and Subscriptions are given for the life of the
 * page. The engine is named here and nowhere else: another one, a provider's
 * own player, takes its place by being named instead. So is the Tracer that
 * writes what the listener waits through to the browser's User Timing
 * (`timing.ts`).
 */
const resources = Layer.mergeAll(CatalogConnection, HtmlAudioEngine.layer, Timing.layer);

// Older browsers can snapshot a page without supporting transition types.
// Shared artwork needs types so both snapshots can opt in the same picture.
const canSelectCover = typeof ViewTransition !== "undefined" && "types" in ViewTransition.prototype &&
  CSS.supports("selector(:active-view-transition-type(choose-track))");

// NOTE: a move through the history that the browser drew itself says so on
// its `popstate`, which reaches the page before the app is told of the URL.
// It is noted here, at the edge, and said on the document for as long as the
// app takes to draw the page the browser has already shown (see
// `view/shownByBrowser.ts`).
//
// How long that is cannot be told by a clock. After a swipe from the screen's
// edge Safari keeps the page from drawing until its own picture of the move
// is done, a third of a second or so, and other drawings (the player's
// clock) can come between. So it holds until the app draws with the URL it
// takes the browser to be at moved, which is the drawing that answers this
// move. A page that has to be waited for is held then, and comes later: it
// is shown by the app when it comes, since all the browser drew was the page
// that was held. A drawing that never comes lets go by itself.
const LETS_GO_AFTER_MS = 2000;

/** Says on the document that the browser drew a move itself, until `letGo` is called or its time runs out. */
const holdWhatBrowserDrew = (): (() => void) => {
  const timers = { lettingGo: 0 };
  const letGo = (): void => {
    window.clearTimeout(timers.lettingGo);
    document.documentElement.removeAttribute(SHOWN_BY_BROWSER_ATTRIBUTE);
  };
  window.addEventListener(
    "popstate",
    (event) => {
      if (event.hasUAVisualTransition) {
        document.documentElement.setAttribute(SHOWN_BY_BROWSER_ATTRIBUTE, "");
        window.clearTimeout(timers.lettingGo);
        timers.lettingGo = window.setTimeout(letGo, LETS_GO_AFTER_MS);
      }
    },
    { capture: true },
  );
  return letGo;
};

const letGo = holdWhatBrowserDrew();

// NOTE: which pages came over their list from the side, by the name of the
// picture they would have carried. Only the document knows whether a picture
// was there to carry, so this is kept here, beside the question, and not in
// the Model: it is how a page was drawn in, which decides how it is drawn out.
const cameOver = new Set<string>();

const application = Runtime.makeApplication({
  Model,
  init,
  update,
  view,
  crash: { view: crashView },
  viewTransition: (context) => {
    // The browser has already shown this change of page itself. Nothing is
    // set moving for it, and the document says so until this drawing, which
    // holds every transition, has been painted.
    const answersBrowser =
      isShownByBrowser() &&
      !isSameRoute(addressOf(context.previousModel), addressOf(context.model));
    if (answersBrowser) {
      requestAnimationFrame(() => requestAnimationFrame(letGo));
      return false;
    }
    const decision = viewTransition(context);
    if (typeof decision !== "object") {
      return decision;
    }
    const [action, artwork] = decision.types;
    const isBetweenPages =
      action === OPEN_DETAIL || action === CLOSE_DETAIL || action === SWITCH_SECTION;
    if (!canSelectCover) {
      return isBetweenPages;
    }
    // An album's numbered rows have no thumbnail. Only request a flight
    // when the outgoing screen actually has a picture to hand over.
    const hasPicture =
      artwork !== undefined &&
      document.querySelector(`[data-flight="${CSS.escape(artwork)}"]:not([inert] *)`) !== null;
    // A page opened from a list with no picture of it to carry comes over
    // the list from the side, and goes back off it the way it came: the
    // list it goes back to has no picture for its own to land on.
    if (action === OPEN_DETAIL && artwork !== undefined) {
      if (hasPicture) {
        cameOver.delete(artwork);
      } else {
        cameOver.add(artwork);
      }
    }
    if (action === OPEN_DETAIL && !hasPicture) {
      return { types: [PUSH_PAGE] };
    }
    if (action === CLOSE_DETAIL && (!hasPicture || (artwork !== undefined && cameOver.has(artwork)))) {
      return { types: [POP_PAGE] };
    }
    if (artwork !== undefined && !hasPicture) {
      if (action !== CHOOSE_TRACK) {
        return { types: [action] };
      }
      // A track chosen where the list has no picture of it (an album's
      // numbered rows) has nothing to carry to the island, and nothing is
      // set moving for it. The first one is the exception: the island
      // itself comes then, with its cover on it.
      return decision.types.includes(ISLAND_APPEARS) ? { types: [ISLAND_APPEARS] } : false;
    }
    return decision;
  },
  subscriptions,
  resources,
  container: document.getElementById("root"),
  routing: {
    onUrlRequest: (request) => Message.ClickedLink({ request }),
    onUrlChange: (url) => Message.ChangedUrl({ url }),
  },
  devTools: { Message },
});

Runtime.run(application);

// NOTE: the app's shell is kept for when there is no network (`public/sw.js`),
// so the app added to a home screen starts without one and says in its own
// words that it could not reach the catalog. Only in a build: while the app
// is being worked on, a page kept from a moment ago is the wrong page.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
