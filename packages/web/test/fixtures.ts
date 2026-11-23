import { AlbumId, type AlbumSummary } from "@bafle/domain/Catalog/Album";
import { ArtistId, type ArtistSummary } from "@bafle/domain/Catalog/Artist";
import { CatalogUnavailable } from "@bafle/domain/Catalog/CatalogUnavailable.rejection";
import type {
  FeaturedMusic,
  SearchResults,
  TrendingMusic,
} from "@bafle/domain/Catalog/MusicCatalog.external";
import { PlaylistId, type PlaylistSummary } from "@bafle/domain/Catalog/Playlist";
import { TrackId, type TrackSummary } from "@bafle/domain/Catalog/Track";
import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import * as Option from "effect/Option";
import { fromString, type Url } from "foldkit/url";
import { Catalog } from "../src/catalog.ts";
import { init, update } from "../src/main.ts";
import { Message } from "../src/message.ts";
import type { Model } from "../src/model.ts";

// CATALOG

const artwork = (name: string) => ({
  small: `https://img.test/${name}/small.jpg`,
  medium: `https://img.test/${name}/medium.jpg`,
  large: `https://img.test/${name}/large.jpg`,
});

export const artist: ArtistSummary = {
  id: ArtistId.make("ar-1"),
  name: "Daft Punk",
  picture: artwork("ar-1"),
};

export const album: AlbumSummary = {
  id: AlbumId.make("al-1"),
  title: "Discovery",
  artist: { id: artist.id, name: artist.name },
  cover: artwork("al-1"),
  explicit: false,
};

export const track: TrackSummary = {
  id: TrackId.make("tr-1"),
  title: "Harder, Better, Faster, Stronger",
  artist: { id: artist.id, name: artist.name },
  album: { id: album.id, title: album.title, cover: album.cover },
  durationSeconds: 224,
  previewUrl: null,
  explicit: false,
};

export const explicitTrack: TrackSummary = {
  id: TrackId.make("tr-2"),
  title: "Technologic",
  artist: { id: artist.id, name: artist.name },
  album: { id: AlbumId.make("al-2"), title: "Human After All", cover: null },
  durationSeconds: 245,
  previewUrl: null,
  explicit: true,
};

export const playlist: PlaylistSummary = {
  id: PlaylistId.make("pl-1"),
  title: "French Touch",
  curator: "Bafle Editors",
  picture: null,
  trackCount: 50,
};

export const featured: FeaturedMusic = {
  albums: [album],
  playlists: [playlist],
  artists: [artist],
};

/** What Home shows after a refresh brought something new. */
export const featuredLater: FeaturedMusic = {
  albums: [{ ...album, id: AlbumId.make("al-3"), title: "Random Access Memories" }],
  playlists: [playlist],
  artists: [artist],
};

export const trending: TrendingMusic = { tracks: [track, explicitTrack], albums: [album] };

/** A search that found every kind but playlists. */
export const found: SearchResults = {
  tracks: [track],
  albums: [album],
  artists: [artist],
  playlists: [],
};

export const foundMore: SearchResults = {
  tracks: [explicitTrack],
  albums: [],
  artists: [artist],
  playlists: [playlist],
};

export const nothingFound: SearchResults = { tracks: [], albums: [], artists: [], playlists: [] };

// MESSAGES

export const url = (path: string): Url => Option.getOrThrow(fromString(`https://bafle.test${path}`));

/** The browser's address changed: a link was followed, or Back or Forward was pressed. */
export const changedUrl = (path: string): Message => Message.ChangedUrl({ url: url(path) });

export const clickedLink = (path: string): Message =>
  Message.ClickedLink({ request: { _tag: "Internal", url: url(path) } });

type QueryFailure = (typeof Catalog.Message.FailedHomeFeed.Type)["failure"];

/** The catalog's provider is down: the Api's own, typed refusal. */
const refused: QueryFailure = { _tag: "Rejected", rejection: new CatalogUnavailable() };

/** The reply never made it back: all the client can say is that it does not know. */
const lost: QueryFailure = { _tag: "Unknown" };

/** The catalog's replies as the Api client reports them, before the app wraps them. */
export const reply = {
  home: (requestId: string, result: FeaturedMusic = featured) =>
    Catalog.Message.SucceededHomeFeed({ requestId, result }),
  homeRefused: (requestId: string) =>
    Catalog.Message.FailedHomeFeed({ requestId, failure: refused }),
  homeLost: (requestId: string) => Catalog.Message.FailedHomeFeed({ requestId, failure: lost }),
  newMusic: (requestId: string, result: TrendingMusic = trending) =>
    Catalog.Message.SucceededNewMusic({ requestId, result }),
  newMusicRefused: (requestId: string) =>
    Catalog.Message.FailedNewMusic({ requestId, failure: refused }),
  search: (requestId: string, result: SearchResults = found) =>
    Catalog.Message.SucceededCatalogSearch({ requestId, result }),
  searchRefused: (requestId: string) =>
    Catalog.Message.FailedCatalogSearch({ requestId, failure: refused }),
};

/** A reply as `update` receives it. A late reply is sent this way: its Command is long gone. */
export const arrived = (message: typeof Catalog.Message.Type): Message =>
  Message.GotCatalogMessage({ message });

// MODELS

/** The id the next request or typing pause started from this Model will carry. */
export const nextId = (model: Model): string => DomainFoldkit.next(model.requestIds).commandId;

/** The id of the request or pause this Model is waiting for. */
export const awaitedId = (model: Model): string => {
  if (model.awaiting._tag === "Reply") {
    return model.awaiting.requestId;
  }
  if (model.awaiting._tag === "TypingPause") {
    return model.awaiting.pauseId;
  }
  throw new Error("This Model awaits nothing");
};

/** The Model after these Messages, Commands unrun: for setting a test's starting point. */
export const after = (model: Model, ...messages: ReadonlyArray<Message>): Model =>
  messages.reduce((current, message) => update(current, message).model, model);

/** The app as a fresh page load leaves it, before any reply. */
export const opened = (path: string): Model => init(url(path)).model;

/** Home on screen with its feed, nothing awaited. */
export const onHome: Model = (() => {
  const firstPaint = opened("/");
  return after(firstPaint, arrived(reply.home(awaitedId(firstPaint))));
})();

/** Home still on screen; the listener chose New, which has never loaded. */
export const leavingHomeForNew: Model = after(onHome, changedUrl("/new"));

/** New on screen with its charts, reached from Home: both pages hold data. */
export const onNew: Model = after(
  leavingHomeForNew,
  arrived(reply.newMusic(awaitedId(leavingHomeForNew))),
);

/** Search on screen with the results for "daft", reached by a direct link. */
export const onSearch: Model = (() => {
  const firstPaint = opened("/search?q=daft");
  return after(firstPaint, arrived(reply.search(awaitedId(firstPaint))));
})();
