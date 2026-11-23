import { ListenerApi } from "@bafle/domain/ListenerApi.api";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import { Runtime } from "foldkit";
import { init, update, viewTransition } from "./main.ts";
import { Message } from "./message.ts";
import { Model } from "./model.ts";
import { view } from "./view.ts";

/**
 * The Api client for the life of the app, over plain HTTP on the app's own
 * origin. The app only asks queries: one request, one answer. The WebSocket
 * protocol exists for live reads (`watch`, `events`), and Bafle has none.
 */
const CatalogConnection = ListenerApi.layerClientHttp(`${location.origin}/api`).pipe(
  Layer.provide(FetchHttpClient.layer),
);

const application = Runtime.makeApplication({
  Model,
  init,
  update,
  view,
  viewTransition,
  resources: CatalogConnection,
  container: document.getElementById("root"),
  routing: {
    onUrlRequest: (request) => Message.ClickedLink({ request }),
    onUrlChange: (url) => Message.ChangedUrl({ url }),
  },
  devTools: { Message },
});

Runtime.run(application);
