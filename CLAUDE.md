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

1. Going to a page whose data is not loaded holds the current page and marks what was chosen (the navigation item, or the row's Details control) as loading; the page swaps when the data arrives. One destination is never waited for: the page of the track the player holds. It is the player expanded, drawn from what the queue already knows, so it takes the screen and its history entry at once, and what the catalog adds fills in place.
2. The URL and the history move only when the screen does. A tap is an intention and lives in the Model; a history entry is a visit and is created when the destination takes the screen. Any number of taps that never get a reply leave history as it was. The exception is forced by the browser: on a direct link, a reload, Back or Forward the URL has already moved, so only the screen is held.
3. The latest intention wins, without a trace; replies to abandoned requests are dropped. A request with no answer after 10 seconds is a failure.
4. A page already loaded swaps in at once and refreshes in the background.
5. The first paint shows placeholders in the shape of the page, never a blank area.
6. A failure is said where the listener is. A track whose page fails to open from a list says so on its row, with "Try again", and the list stays as it is. In the expanded player, a detail that fails to load says so under the controls, with "Try again", and the controls keep working. A page reached by its URL, and a section, say it on the page.
7. A failure that will not go away (a track the catalog does not have) says so without "Try again": on its row, whose page stops being openable, or on its page with the way back.
8. Search keeps its previous results while a new term loads. Typing is the one navigation that is URL first, replacing its own entry, because the field's text lives in the URL.
9. Going back to a list restores it exactly: same scroll position, same pictures already painted, nothing waiting on the network. Section pages stay mounted and hidden instead of being rebuilt, because Foldkit replaces the DOM when the view function at a position changes, and a rebuilt `<img>` repaints even when cached.
10. A picture never appears as an empty box when a rendition of it is already loaded: show that one first and let the larger one replace it.
11. On a narrow screen the navigation floats over the foot of the page: a menu, and Search apart from it at the far end. A page scrolled down draws the menu back to a circle that shows where the listener is, and the island comes down into the row between the circle and Search. The top of the page brings the menu out again, and so does a press of the circle, where the page stands. Choosing a section shows it whole; a track's page leaves it as it was, so closing the track puts everything back. Under the expanded player there is no navigation: closing it is the way out. How the navigation stands is in the Model (`navigation`). The scroll is not: the Subscription in `subscription.ts` tells only the two moments that change it. Drawn back, the circle and Search are smaller than the menu is tall and stand on its centre line, where its two ends were; the island keeps its height. Each piece has its own times, different on the way out and on the way back, read frame by frame off the app they follow: they are in `styles.css` under the `dock-` names. The navigation stands a fixed distance from the foot of the page and adds no safe-area inset to it.

## Playback rules the app keeps

The player is its own part of the app (`packages/web/src/player/`, a Foldkit Submodel) and lives only in the client: the domain does not know that anything is playing.

1. Tapping a row plays it, and the list it was in becomes the queue. A track's page opens from the row's Details control; pressing the island expands it into the page of its track.
2. The island says only what the engine has said. A tap is a wish (`Acknowledged`, `Starting`); `Sounding` and `Waiting` come only from an engine report. Paused by the listener, stopped by the system and failed are three different states and look different.
3. Every order to the engine is numbered, and a report for an earlier order is dropped: the latest wish wins here too.
4. One audio element for the page's life. Navigation never touches it. Playing moves the route in one case only: an expanded player that goes on to another track rewrites its own history entry for that track, never adding one, so Back always closes it.
5. Sound starts inside the tap: `StartPlayback` calls `play()` as its first act, because phones refuse sound that does not come from a gesture.
6. Activity is shown only after 400 ms without sound, so a fast start never flashes a spinner.
7. A source that fails is asked of the catalog once more and retried from where it was. After that the island and the row say so, with a retry, and the queue never skips by itself.
8. The player knows no provider. `playableSource` in `player/model.ts` is the only reader of the catalog's audio field, and lengths and positions come from the engine, not from the catalog.
9. Expanded is derived, never stored. There is one route, `/track/:id`: the screen is the expanded player when the route's track is the player's current track, and the plain track page with a Play control and the island below otherwise. After a reload nothing is current, so a track's URL is its plain page.
10. Opening, the close control and the browser's Back are one view transition in two directions: the island and the expanded player share the name `player`, so the capsule grows into the screen and shrinks back, and the cover's name is on whichever of them is drawn. A track change inside the expanded player is no transition.

11. The island is one dark figure, the same in a light scheme and a dark one, with one outline round three things: the cover, a disc at its left end that stands out a little above and below the body; the body, which curves to meet it; and a swell at the other end that holds the terracotta control that starts and stops the sound. Past the swell a lower tail holds Next while there is room for it; in the row with the navigation's circle and Search the tail is drawn in and the swell is the island's end. Going there is three movements, each setting off after the one before so that each can be followed: Next travels left with the end of the tail and in under the main control, which stays where it is; the island narrows; then it comes down into the row. Coming out is the same three the other way round. The figure takes the cover's colours near the cover. Its edge is its own colour: at rest there is no border to see. While the engine says there is sound, and only then, a copper comet travels the whole of that edge, two pixels wide, at a slow and steady pace: an almost white head and a tail that thins out behind it. The comet never starts or stops at once: when the sound stops it slows to a halt where it is and dims to an ember that stays there, and when the sound comes back it brightens and gathers speed from that same place. Previous and the progress bar are the expanded player's. What a control alone cannot explain (stopped by the system, failed) stands in a few words where the artist was, and is said whole to assistive technology. A title too long for the island is a marquee: it waits, travels across once with its copy following it in, and waits again. Two custom elements are the only pieces outside the architecture, both for the same reason, that what they settle is a matter of pixels known only in the document: `bafle-marquee` (`view/marqueeElement.ts`) settles whether a title fits, and `bafle-island-shape` (`view/islandShapeElement.ts`) draws the figure for the width the island has at that moment, from the outline worked out in `view/islandOutline.ts`. The Model tells the shape two things, the cover and whether there is sound, and neither element tells the Model anything.

The engine is the `AudioEngine` service (`player/audioEngine.ts`); `packages/web/src/entry.ts` names the implementation in `resources`, and tests name a fake.
