import { ListenerApi } from "@bafle/domain/ListenerApi.api";
import { expect, it } from "@effect/vitest";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";
import { Catalog, REPLY_TIMEOUT } from "../src/catalog.ts";
import {
  askAlbumDetail,
  askArtistDetail,
  askHomeFeed,
  askPlaylistDetail,
  askTrackDetail,
  FocusAlbumTile,
  FocusArtistTile,
  FocusPlaylistTile,
  FocusTrackRow,
  NavigateBack,
  NavigateInternal,
  ReplaceSearchTerm,
  TYPING_PAUSE,
  WaitForTypingPause,
} from "../src/command.ts";
import { Message } from "../src/message.ts";
import { PAGE_IDS } from "../src/view/layout.ts";
import {
  album,
  albumPath,
  artist,
  artistPath,
  playlist,
  playlistPath,
  track,
  trackPath,
} from "./fixtures.ts";

// The stories resolve Commands by their Messages and never run them. These run the ones whose
// effect is itself a requirement: how typing and the way back treat the history, how long a
// pause is, how long a query may go unanswered, and where the focus lands on a list the listener
// comes back to.

it.effect("typing rewrites the current history entry and the URL holds the term", () =>
  Effect.gen(function* () {
    const entries = history.length;

    yield* ReplaceSearchTerm({ maybeTerm: Option.some("daft punk") }).effect;
    expect(location.pathname + location.search).toBe("/search?q=daft+punk");

    yield* ReplaceSearchTerm({ maybeTerm: Option.none() }).effect;
    expect(location.pathname + location.search).toBe("/search");

    expect(history.length).toBe(entries);
  }),
);

it.effect("a typing pause is about 300 ms, and not a moment less", () =>
  Effect.gen(function* () {
    expect(Duration.toMillis(TYPING_PAUSE)).toBe(300);

    const waiting = yield* Effect.forkChild(WaitForTypingPause({ pauseId: "page:1" }).effect);
    yield* TestClock.adjust(Duration.millis(299));
    expect(waiting.pollUnsafe()).toBeUndefined();

    yield* TestClock.adjust(Duration.millis(1));
    expect(yield* Fiber.join(waiting)).toEqual(
      Message.CompletedWaitForTypingPause({ pauseId: "page:1" }),
    );
  }),
);

it.effect("a link adds a history entry; the way back adds none", () =>
  Effect.gen(function* () {
    yield* NavigateInternal({ url: "/new" }).effect;
    const entries = history.length;

    yield* NavigateInternal({ url: trackPath(track.id) }).effect;
    expect(history.length).toBe(entries + 1);

    expect(yield* NavigateBack().effect).toEqual(Message.CompletedNavigateBack());
    expect(history.length).toBe(entries + 1);
  }),
);

it.effect("back on a list, the focus goes to the row of the track", () =>
  Effect.gen(function* () {
    document.body.innerHTML = `
      <div id="${PAGE_IDS.New}" tabindex="0">
        <a href="/track/other" data-track-row="other">Another</a>
        <a href="${trackPath(track.id)}" data-track-row="${track.id}">The one</a>
      </div>`;

    yield* FocusTrackRow({ pageId: PAGE_IDS.New, trackId: track.id }).effect;
    expect(document.activeElement?.textContent).toBe("The one");
  }),
);

it.effect("a list that no longer has the row gives the focus to its page", () =>
  Effect.gen(function* () {
    document.body.innerHTML = `<div id="${PAGE_IDS.New}" tabindex="0"><a href="/track/other" data-track-row="other">Another</a></div>`;

    yield* FocusTrackRow({ pageId: PAGE_IDS.New, trackId: track.id }).effect;
    expect(document.activeElement?.id).toBe(PAGE_IDS.New);
  }),
);

it.effect("back on a shelf, the focus goes to the tile of the album", () =>
  Effect.gen(function* () {
    document.body.innerHTML = `
      <div id="${PAGE_IDS.Home}" tabindex="0">
        <a href="/album/other" data-album-tile="other">Another</a>
        <a href="${albumPath(album.id)}" data-album-tile="${album.id}">The one</a>
      </div>`;

    expect(yield* FocusAlbumTile({ pageId: PAGE_IDS.Home, albumId: album.id }).effect).toEqual(
      Message.CompletedFocusAlbumTile(),
    );
    expect(document.activeElement?.textContent).toBe("The one");
  }),
);

it.effect("a shelf that no longer has the tile gives the focus to its page", () =>
  Effect.gen(function* () {
    document.body.innerHTML = `<div id="${PAGE_IDS.Home}" tabindex="0"><a href="/album/other" data-album-tile="other">Another</a></div>`;

    yield* FocusAlbumTile({ pageId: PAGE_IDS.Home, albumId: album.id }).effect;
    expect(document.activeElement?.id).toBe(PAGE_IDS.Home);
  }),
);

it.effect("the tile of an artist or of a playlist is found by its kind, whatever id an album's tile has", () =>
  Effect.gen(function* () {
    // The catalog's ids are told apart within a kind only: here all three tiles share one.
    const shared = artist.id;
    document.body.innerHTML = `
      <div id="${PAGE_IDS.Search}" tabindex="0">
        <a href="${artistPath(artist.id)}" data-artist-tile="${shared}">The artist</a>
        <a href="/album/${shared}" data-album-tile="${shared}">The album</a>
        <a href="/playlist/${shared}" data-playlist-tile="${shared}">The playlist</a>
        <a href="${playlistPath(playlist.id)}" data-playlist-tile="${playlist.id}">The one</a>
      </div>`;

    expect(
      yield* FocusArtistTile({ pageId: PAGE_IDS.Search, artistId: artist.id }).effect,
    ).toEqual(Message.CompletedFocusArtistTile());
    expect(document.activeElement?.textContent).toBe("The artist");

    expect(
      yield* FocusPlaylistTile({ pageId: PAGE_IDS.Search, playlistId: playlist.id }).effect,
    ).toEqual(Message.CompletedFocusPlaylistTile());
    expect(document.activeElement?.textContent).toBe("The one");
  }),
);

it.effect("a shelf that no longer has the artist or the playlist gives the focus to its page", () =>
  Effect.gen(function* () {
    document.body.innerHTML = `<div id="${PAGE_IDS.Home}" tabindex="0"><a href="/album/other" data-album-tile="${artist.id}">Another</a></div>`;

    yield* FocusArtistTile({ pageId: PAGE_IDS.Home, artistId: artist.id }).effect;
    expect(document.activeElement?.id).toBe(PAGE_IDS.Home);

    document.body.innerHTML = `<div id="${PAGE_IDS.Home}" tabindex="0"><a href="/album/other" data-album-tile="${playlist.id}">Another</a></div>`;

    yield* FocusPlaylistTile({ pageId: PAGE_IDS.Home, playlistId: playlist.id }).effect;
    expect(document.activeElement?.id).toBe(PAGE_IDS.Home);
  }),
);

/** The app's client over a network that takes every request and never answers one. */
const hungServer = () => {
  const signals: Array<AbortSignal> = [];
  const layer = ListenerApi.layerClientHttp("https://bafle.test/api").pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(
      Layer.succeed(FetchHttpClient.Fetch, (_input, init) => {
        if (init?.signal) {
          signals.push(init.signal);
        }
        return new Promise<Response>(() => {});
      }),
    ),
  );
  return { layer, signals };
};

it.effect("a query nobody answers fails after ten seconds, as a reply lost on the way", () => {
  const server = hungServer();

  return Effect.gen(function* () {
    expect(Duration.toSeconds(REPLY_TIMEOUT)).toBe(10);

    const asking = yield* Effect.forkChild(askTrackDetail(track.id)("page:7").effect);
    yield* TestClock.adjust(Duration.millis(9_999));
    expect(asking.pollUnsafe()).toBeUndefined();

    yield* TestClock.adjust(Duration.millis(1));
    expect(yield* Fiber.join(asking)).toEqual(
      Message.GotCatalogMessage({
        message: Catalog.Message.FailedTrackDetail({
          requestId: "page:7",
          failure: { _tag: "Unknown" },
        }),
      }),
    );
    // Giving up stops the request: it is not left running behind the failure.
    expect(server.signals.length).toBeGreaterThan(0);
    expect(server.signals.every((signal) => signal.aborted)).toBe(true);
  }).pipe(Effect.provide(server.layer));
});

it.effect("every query has the same limit, and reports it as its own failure", () => {
  const server = hungServer();

  return Effect.gen(function* () {
    const asking = yield* Effect.forkChild(askHomeFeed("page:0").effect);
    yield* TestClock.adjust(REPLY_TIMEOUT);
    expect(yield* Fiber.join(asking)).toEqual(
      Message.GotCatalogMessage({
        message: Catalog.Message.FailedHomeFeed({ requestId: "page:0", failure: { _tag: "Unknown" } }),
      }),
    );

    const askingAlbum = yield* Effect.forkChild(askAlbumDetail(album.id)("page:1").effect);
    yield* TestClock.adjust(REPLY_TIMEOUT);
    expect(yield* Fiber.join(askingAlbum)).toEqual(
      Message.GotCatalogMessage({
        message: Catalog.Message.FailedAlbumDetail({
          requestId: "page:1",
          failure: { _tag: "Unknown" },
        }),
      }),
    );

    const askingArtist = yield* Effect.forkChild(askArtistDetail(artist.id)("page:2").effect);
    yield* TestClock.adjust(REPLY_TIMEOUT);
    expect(yield* Fiber.join(askingArtist)).toEqual(
      Message.GotCatalogMessage({
        message: Catalog.Message.FailedArtistDetail({
          requestId: "page:2",
          failure: { _tag: "Unknown" },
        }),
      }),
    );

    const askingPlaylist = yield* Effect.forkChild(
      askPlaylistDetail(playlist.id)("page:3").effect,
    );
    yield* TestClock.adjust(REPLY_TIMEOUT);
    expect(yield* Fiber.join(askingPlaylist)).toEqual(
      Message.GotCatalogMessage({
        message: Catalog.Message.FailedPlaylistDetail({
          requestId: "page:3",
          failure: { _tag: "Unknown" },
        }),
      }),
    );
  }).pipe(Effect.provide(server.layer));
});

it.effect("a row that is no longer a link can still be given the focus", () =>
  Effect.gen(function* () {
    document.body.innerHTML = `
      <div id="${PAGE_IDS.New}" tabindex="0">
        <div tabindex="-1" data-track-row="${track.id}">Gone</div>
      </div>`;

    yield* FocusTrackRow({ pageId: PAGE_IDS.New, trackId: track.id }).effect;
    expect(document.activeElement?.textContent).toBe("Gone");
  }),
);
