# Bafle

A music player whose music provider sits behind an Effect service, so the provider (Deezer today) can be swapped without touching the model or the app.

## Stack

- **Model**: `@alchemy.run/domain` (domain-driven design on Effect) in `packages/domain`. It imports only `@alchemy.run/domain` and `effect`.
- **Server**: a Cloudflare Worker in `packages/server` that hosts the model and holds the provider adapters.
- **App**: Foldkit (The Elm Architecture on Effect) in `packages/web`.
- **Infrastructure**: Alchemy, one stack in `alchemy.run.ts`, deployed to Cloudflare.

## Skills to load before working

- `alchemy-domain` for anything in `packages/domain` or `packages/server`. The copy in `.claude/skills/` comes from the installed `@alchemy.run/domain` package, so it matches the APIs the code compiles against.
- `foldkit-skills:foldkit` for anything in `packages/web`, with `packages/web/FOLDKIT.md` as the conventions for the installed Foldkit release.

Effect v4, Foldkit and Alchemy v2 are new and change often. Read the installed types in `node_modules` and the skills' references instead of writing their APIs from memory.

## Commands

```sh
pnpm install
pnpm test          # every package's tests
pnpm typecheck     # tsc -b over the whole monorepo
pnpm dev           # alchemy dev: Workers in local workerd, the app on Vite
```

`pnpm deploy` publishes to the Cloudflare account of the active Alchemy profile. Ask before running it.

## Where the provider is chosen

`packages/domain/src/Catalog/MusicCatalog.external.ts` declares what Bafle asks of a catalog, in its own words. `packages/server/src/Deezer/` is the only code that knows Deezer. `packages/server/src/BafleWorker.ts` names the adapter in use: to change provider, write another `MusicCatalog.toLayer(...)` and name it there.

## Navigation rules the app keeps

The app exists to show loading done well, so these are requirements, not style:

1. Going to a page whose data is not loaded holds the current page and marks the chosen navigation item as loading; the page swaps when the data arrives.
2. The latest navigation wins; replies to abandoned requests are dropped.
3. A page already loaded swaps in at once and refreshes in the background.
4. The first paint shows placeholders in the shape of the page, never a blank area.
5. A failure is stated in place, with a way to try again.
6. Search keeps its previous results while a new term loads.
