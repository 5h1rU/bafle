import { ListenerApi } from "@bafle/domain/ListenerApi.api";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import { Runtime } from "foldkit";
import { init, update, viewTransition } from "./main.ts";
import { Message } from "./message.ts";
import { Model } from "./model.ts";
import * as HtmlAudioEngine from "./player/htmlAudioEngine.ts";
import { subscriptions } from "./subscription.ts";
import { view } from "./view.ts";
import { CHOOSE_TRACK } from "./view/artwork.ts";
import { crashView } from "./view/crash.ts";

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
 * own player, takes its place by being named instead.
 */
const resources = Layer.mergeAll(CatalogConnection, HtmlAudioEngine.layer);

// Older browsers can snapshot a page without supporting transition types.
// Shared artwork needs types so both snapshots can opt in the same picture.
const canSelectCover = typeof ViewTransition !== "undefined" && "types" in ViewTransition.prototype &&
  CSS.supports("selector(:active-view-transition-type(choose-track))");

const application = Runtime.makeApplication({
  Model,
  init,
  update,
  view,
  crash: { view: crashView },
  viewTransition: (context) => {
    const decision = viewTransition(context);
    if (typeof decision !== "object") {
      return decision;
    }
    const [action, artwork] = decision.types;
    if (!canSelectCover) {
      return action === "show-detail";
    }
    // An album's numbered rows have no thumbnail. Only request a flight
    // when the outgoing screen actually has a picture to hand over.
    if (artwork && !document.querySelector(`[data-flight="${CSS.escape(artwork)}"]:not([inert] *)`)) {
      return action === CHOOSE_TRACK ? false : { types: [action] };
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
