import * as Cloudflare from "@alchemy.run/cloudflare";
import * as DomainCloudflare from "@alchemy.run/domain/Cloudflare";
import BafleWorker from "@bafle/server/BafleWorker";
import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export default Alchemy.Stack(
  "Bafle",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), DomainCloudflare.providers()),
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const bafle = yield* BafleWorker;
    // The player, built with Vite. Its Worker serves the build and forwards
    // /api to Bafle, so the app and the Api share one origin.
    const app = yield* Cloudflare.Website.Foldkit("BafleApp", {
      rootDir: "packages/web",
      main: "src/worker.ts",
      env: { BAFLE: bafle },
      // Production (`--stage prod`) is served at bafle.app, a zone of the
      // same Cloudflare account: the custom domain brings its own DNS record
      // and certificate, and www only redirects to it. A hostname serves one
      // Worker, so every other stage detaches any domain (`null`) and keeps
      // its workers.dev address. `alchemy dev` ignores this.
      domain: stage === "prod" ? { name: "bafle.app", redirects: ["www.bafle.app"] } : null,
      assets: {
        runWorkerFirst: ["/api", "/api/*"],
        // The app has its own routes (/new, /search): a path with no file
        // behind it serves index.html, and the app's router takes it from there.
        notFoundHandling: "single-page-application",
      },
    });
    return { api: bafle.url.as<string>(), app: app.url.as<string>() };
  }),
);
