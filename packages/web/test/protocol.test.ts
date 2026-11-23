import * as Domain from "@alchemy.run/domain";
import { Bafle, BafleHandlers } from "@bafle/domain/Bafle.model";
import { CatalogUnavailable } from "@bafle/domain/Catalog/CatalogUnavailable.rejection";
import { MusicCatalog } from "@bafle/domain/Catalog/MusicCatalog.external";
import { ListenerApi } from "@bafle/domain/ListenerApi.api";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpEffect from "effect/http/HttpEffect";
import * as Layer from "effect/Layer";
import { Catalog } from "../src/catalog.ts";
import { featured, found, trending } from "./fixtures.ts";

// The app reaches the Api over plain HTTP (see entry.ts). These run the app's own query Commands
// through that protocol against the Api as the Worker serves it, with only the network replaced.

const WorkingCatalog = MusicCatalog.toLayer(
  Effect.succeed({
    featured: () => Effect.succeed(featured),
    trending: () => Effect.succeed(trending),
    search: () => Effect.succeed(found),
  }),
);

const BrokenCatalog = MusicCatalog.toLayer(
  Effect.succeed({
    featured: () => Effect.fail(new CatalogUnavailable()),
    trending: () => Effect.fail(new CatalogUnavailable()),
    search: () => Effect.fail(new CatalogUnavailable()),
  }),
);

type Fetch = typeof globalThis.fetch;

/** The app's client, over the HTTP protocol, with `fetch` as its way to the server. */
const clientOver = (fetch: Fetch) =>
  ListenerApi.layerClientHttp("https://bafle.test/api").pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
  );

/** The client connected to Bafle hosted in memory, reading the given catalog. */
const connectedTo = (catalog: typeof WorkingCatalog) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const api = yield* ListenerApi;
      const serve = HttpEffect.toWebHandler(api.fetch);
      return clientOver((input, init) => serve(new Request(input, init)));
    }),
  ).pipe(
    Layer.provide(
      Bafle.layer(BafleHandlers).pipe(Layer.provide(Layer.mergeAll(Domain.InMemory, catalog))),
    ),
  );

it.live("the three queries are answered over plain HTTP", () =>
  Effect.gen(function* () {
    expect(yield* Catalog.HomeFeed({ input: {}, requestId: "page:0" }).effect).toEqual(
      Catalog.Message.SucceededHomeFeed({ requestId: "page:0", result: featured }),
    );
    expect(yield* Catalog.NewMusic({ input: {}, requestId: "page:1" }).effect).toEqual(
      Catalog.Message.SucceededNewMusic({ requestId: "page:1", result: trending }),
    );
    expect(
      yield* Catalog.CatalogSearch({ input: { term: "daft" }, requestId: "page:2" }).effect,
    ).toEqual(Catalog.Message.SucceededCatalogSearch({ requestId: "page:2", result: found }));
  }).pipe(Effect.provide(connectedTo(WorkingCatalog))),
);

it.live("the catalog's refusal crosses the wire as the typed rejection", () =>
  Effect.gen(function* () {
    const refused = yield* Catalog.HomeFeed({ input: {}, requestId: "page:0" }).effect;
    expect(refused).toMatchObject({
      _tag: "FailedHomeFeed",
      requestId: "page:0",
      failure: { _tag: "Rejected", rejection: { _tag: "CatalogUnavailable" } },
    });
  }).pipe(Effect.provide(connectedTo(BrokenCatalog))),
);

it.live("a server that cannot be reached is an Unknown failure, not a crash", () =>
  Effect.gen(function* () {
    const lost = yield* Catalog.NewMusic({ input: {}, requestId: "page:0" }).effect;
    expect(lost).toEqual(
      Catalog.Message.FailedNewMusic({ requestId: "page:0", failure: { _tag: "Unknown" } }),
    );
  }).pipe(Effect.provide(clientOver(() => Promise.reject(new TypeError("Failed to fetch"))))),
);

it.live("a server that answers with an error page is an Unknown failure too", () =>
  Effect.gen(function* () {
    const lost = yield* Catalog.NewMusic({ input: {}, requestId: "page:0" }).effect;
    expect(lost).toEqual(
      Catalog.Message.FailedNewMusic({ requestId: "page:0", failure: { _tag: "Unknown" } }),
    );
  }).pipe(
    Effect.provide(
      clientOver(() => Promise.resolve(new Response("Bad Gateway", { status: 502 }))),
    ),
  ),
);
