import * as Cloudflare from "@alchemy.run/cloudflare";
import * as DomainCloudflare from "@alchemy.run/domain/Cloudflare";
import { Bafle, BafleHandlers } from "@bafle/domain/Bafle.model";
import { ListenerApi } from "@bafle/domain/ListenerApi.api";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { HttpServerRequest } from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import * as Layer from "effect/Layer";
import { AudiusMusicCatalog } from "./Audius/AudiusMusicCatalog.ts";
import { KeptRepliesKV } from "./Kept/KeptReplies.ts";
import { PicturePlaceholdersKV } from "./Placeholder/PicturePlaceholders.ts";

/**
 * Which provider the catalog is read from. To change provider, write another
 * `MusicCatalog.toLayer(...)` and name it here: nothing else changes.
 * (`DeezerMusicCatalog` is the other one there is: Deezer stopped letting its
 * audio be played outside its own apps.)
 */
// NOTE: Audius's pictures have no likeness yet (`toArtwork` in
// `Audius/translate.ts`), so its catalog asks nothing of
// `PicturePlaceholdersKV`. It stays provided for an adapter that does.
const Catalog = AudiusMusicCatalog.pipe(
  Layer.provide(Layer.mergeAll(PicturePlaceholdersKV, KeptRepliesKV)),
  Layer.provide(Layer.mergeAll(FetchHttpClient.layer, Cloudflare.KV.ReadWriteNamespaceBinding)),
);

/** Everything the Worker serves: Bafle hosted on Cloudflare, reading its catalog. */
const BafleLive = Bafle.layer(BafleHandlers).pipe(
  Layer.provide(Layer.mergeAll(DomainCloudflare.layerDurableObjects(), Catalog)),
);

export default class BafleWorker extends Cloudflare.Worker<BafleWorker>()(
  "BafleWorker",
  { main: import.meta.url },
  Effect.gen(function* () {
    const listenerApi = yield* ListenerApi;
    return {
      // The player reaches /api through its own Worker, on its own origin.
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        const path = new URL(request.url, "http://localhost").pathname;
        if (path.startsWith("/api")) return yield* listenerApi.fetch;
        return HttpServerResponse.text("Not Found", { status: 404 });
      }),
    };
  }).pipe(Effect.provide(BafleLive)),
) {}
