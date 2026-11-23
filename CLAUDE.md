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

1. Going to a page whose data is not loaded holds the current page and marks what was chosen (the navigation item, or the row) as loading; the page swaps when the data arrives.
2. The URL and the history move only when the screen does. A tap is an intention and lives in the Model; a history entry is a visit and is created when the destination takes the screen. Any number of taps that never get a reply leave history as it was. The exception is forced by the browser: on a direct link, a reload, Back or Forward the URL has already moved, so only the screen is held.
3. The latest intention wins, without a trace; replies to abandoned requests are dropped. A request with no answer after 10 seconds is a failure.
4. A page already loaded swaps in at once and refreshes in the background.
5. The first paint shows placeholders in the shape of the page, never a blank area.
6. A failure is said where the listener is. A track that fails to open from a list says so on its row, with "Try again", and the list stays as it is. A page reached by its URL, and a section, say it on the page.
7. A failure that will not go away (a track the catalog does not have) says so without "Try again": on its row, which stops being openable, or on its page with the way back.
8. Search keeps its previous results while a new term loads. Typing is the one navigation that is URL first, replacing its own entry, because the field's text lives in the URL.
9. Going back to a list restores it exactly: same scroll position, same pictures already painted, nothing waiting on the network. Section pages stay mounted and hidden instead of being rebuilt, because Foldkit replaces the DOM when the view function at a position changes, and a rebuilt `<img>` repaints even when cached.
10. A picture never appears as an empty box when a rendition of it is already loaded: show that one first and let the larger one replace it.
