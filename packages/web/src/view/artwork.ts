import type { AlbumId } from "@bafle/domain/Catalog/Album";
import type { ArtistId } from "@bafle/domain/Catalog/Artist";
import type { Artwork } from "@bafle/domain/Catalog/Artwork";
import type { GenreId } from "@bafle/domain/Catalog/Genre";
import type { PlaylistId } from "@bafle/domain/Catalog/Playlist";
import type { StationId } from "@bafle/domain/Catalog/Station";
import type { TrackId } from "@bafle/domain/Catalog/Track";
import { clsx } from "clsx";
import * as Option from "effect/Option";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "../message.ts";
import { AppRoute } from "../route.ts";
import { noteIcon } from "./icon.ts";
import type { Presence } from "./layout.ts";

// VIEW

export type ArtworkShape = "Square" | "Round";

/** Which of a picture's renditions to load: a list row's thumbnail or a shelf's tile. */
export type ArtworkSize = keyof Pick<Artwork, "small" | "medium">;

/**
 * When a picture is asked of the network. Most wait until the listener is
 * near them: a page has far more pictures than a screen shows. The few a page
 * opens with are asked for at once and ahead of the rest, since a picture
 * that waits to learn it is on screen is the last thing of the page to arrive.
 */
export type PictureLoading = "AtOnce" | "WhenNear";

const pictureView = <M>(url: string, loading: PictureLoading, h: HtmlBuilder<M>): Html =>
  h.img([
    ...(loading === "AtOnce"
      ? [h.Loading("eager"), h.Fetchpriority("high")]
      : [h.Loading("lazy")]),
    h.Decoding("async"),
    h.Src(url),
    // The title sits beside every picture, so the picture itself says nothing new.
    h.Alt(""),
    h.Class("size-full object-cover"),
  ]);

export const missingPictureView = <M>(h: HtmlBuilder<M>): Html =>
  h.div(
    [h.Class("flex size-full items-center justify-center text-muted")],
    [noteIcon("size-2/5")],
  );

/**
 * A picture in a box that has its final size before the picture arrives: a
 * fixed ratio over a neutral fill, so nothing around it moves when it loads.
 * Without a picture the box holds a placeholder mark instead.
 */
export const artworkView = <M>(
  maybeArtwork: Option.Option<Artwork>,
  shape: ArtworkShape,
  size: ArtworkSize,
  h: HtmlBuilder<M>,
  loading: PictureLoading = "WhenNear",
): Html =>
  h.div(
    [
      h.Class(
        clsx("aspect-square overflow-hidden bg-tile", {
          "rounded-full": shape === "Round",
          "rounded-lg": shape === "Square",
        }),
      ),
    ],
    [
      Option.match(maybeArtwork, {
        onNone: () => missingPictureView(h),
        onSome: (artwork) => pictureView(artwork[size], loading, h),
      }),
    ],
  );

/**
 * The picture at the head of a page. The page is reached from a row, which
 * has loaded the small rendition, or from a tile, which has loaded the
 * medium one. A cached thumbnail fills the box while the final picture decodes.
 */
const headPictureView = (
  shapeClass: string,
  flightStyle: Readonly<Record<string, string>>,
  maybeArtwork: Option.Option<Artwork>,
  h: HtmlBuilder<Message>,
  size: "medium" | "large" = "medium",
): Html =>
  h.div(
    [
      h.Class(clsx("catalog-art relative aspect-square overflow-hidden bg-tile", shapeClass)),
      ...flightAttributes(flightStyle, h),
    ],
    Option.match(maybeArtwork, {
      onNone: () => [missingPictureView(h)],
      onSome: (artwork) => [
        h.img([
          h.Decoding("sync"),
          h.Src(artwork.small),
          h.Alt(""),
          h.Class("absolute inset-0 size-full object-cover"),
        ]),
        h.img([
          h.Decoding("async"),
          h.Fetchpriority("high"),
          h.Src(artwork[size]),
          h.Alt(""),
          h.Class("absolute inset-0 size-full object-cover"),
        ]),
      ],
    }),
  );

/**
 * The cover at the head of an album's page. It does not travel by itself:
 * the head it lies in does, with the title over it (`albumHeadFlightAttributes`).
 */
export const albumCoverView = (
  maybeArtwork: Option.Option<Artwork>,
  h: HtmlBuilder<Message>,
): Html => headPictureView("album-cover", {}, maybeArtwork, h, "large");

/**
 * What makes the head of an album's page the piece that travels to and from
 * the album's tile on a shelf: the cover with the title and the facts over
 * it, as one picture. Were the cover to travel alone, it would land bare and
 * the words would appear over it afterwards, a step behind; in one picture
 * they grow out of the tile together and shrink back into it together.
 */
// NOTE: the head also carries the class `catalog-art`, which is what keeps
// the name off outside a flight (styles.css).
export const albumHeadFlightAttributes = (
  albumId: AlbumId,
  presence: Presence,
  h: HtmlBuilder<Message>,
) => flightAttributes(albumCoverTransitionStyle(albumId, presence), h);

/** An artist's picture at the head of their page: round, as their tile is, which it arrives from. */
export const artistPictureView = (
  artistId: ArtistId,
  maybeArtwork: Option.Option<Artwork>,
  h: HtmlBuilder<Message>,
): Html =>
  headPictureView(
    "rounded-full",
    artistPictureTransitionStyle(artistId, "OnScreen"),
    maybeArtwork,
    h,
  );

/** A playlist's picture at the head of its page, which arrives from its tile as an album's cover does. */
export const playlistPictureView = (
  playlistId: PlaylistId,
  maybeArtwork: Option.Option<Artwork>,
  h: HtmlBuilder<Message>,
): Html =>
  headPictureView(
    "rounded-xl",
    playlistPictureTransitionStyle(playlistId, "OnScreen"),
    maybeArtwork,
    h,
  );

/** A genre's picture at the head of its page, which arrives from its tile as a playlist's does. */
export const genrePictureView = (
  genreId: GenreId,
  maybeArtwork: Option.Option<Artwork>,
  h: HtmlBuilder<Message>,
): Html =>
  headPictureView(
    "rounded-xl",
    genrePictureTransitionStyle(genreId, "OnScreen"),
    maybeArtwork,
    h,
  );

/** A station's picture at the head of its page, which arrives from its tile as a playlist's does. */
export const stationPictureView = (
  stationId: StationId,
  maybeArtwork: Option.Option<Artwork>,
  h: HtmlBuilder<Message>,
): Html =>
  headPictureView(
    "rounded-xl",
    stationPictureTransitionStyle(stationId, "OnScreen"),
    maybeArtwork,
    h,
  );

/**
 * One of the catalog's ids as part of a CSS name. The ids are opaque, so
 * every character outside the plainest set is spelled by its code.
 */
const ident = (id: string): string =>
  id.replace(/[^A-Za-z0-9-]/g, (character) => `_${character.charCodeAt(0).toString(16)}_`);

/**
 * The name a track's cover travels under in a view transition. One element
 * carries it at a time: the player's while the track is the one it holds,
 * else the one on the page on screen.
 */
export const coverTransitionName = (trackId: TrackId): string =>
  `track-cover-${ident(trackId)}`;

export const CHOOSE_TRACK = "choose-track";

/** The runtime supplies the same artwork name to the outgoing and incoming snapshots. */
export const artworkFlightRules = <M>(names: ReadonlyArray<string>, h: HtmlBuilder<M>): Html => {
  const rules = names.map((name) => {
    return `:root:active-view-transition-type(${name}) [data-flight="${name}"] { view-transition-name: ${name} !important; }`;
  });
  return h.style([], [rules.join("\n")]);
};

/**
 * The name an album's cover travels under in a view transition: from its
 * tile on a shelf to the head of its page, and back. One element carries it
 * at a time, the one on the page on screen.
 */
export const albumCoverTransitionName = (albumId: AlbumId): string =>
  `album-cover-${ident(albumId)}`;

/** What makes an album's cover one element to a view transition, on the page on screen only. */
export const albumCoverTransitionStyle = (
  albumId: AlbumId,
  presence: Presence,
): Readonly<Record<string, string>> =>
  presence === "OnScreen"
    ? { viewTransitionName: albumCoverTransitionName(albumId), viewTransitionClass: "album-cover" }
    : {};

/**
 * The name an artist's picture travels under, as an album's cover does: from
 * their tile on a shelf to the head of their page, and back.
 */
export const artistPictureTransitionName = (artistId: ArtistId): string =>
  `artist-picture-${ident(artistId)}`;

/** What makes an artist's picture one element to a view transition, on the page on screen only. */
export const artistPictureTransitionStyle = (
  artistId: ArtistId,
  presence: Presence,
): Readonly<Record<string, string>> =>
  presence === "OnScreen"
    ? {
        viewTransitionName: artistPictureTransitionName(artistId),
        viewTransitionClass: "artist-picture",
      }
    : {};

/** The name a playlist's picture travels under, as an album's cover does. */
export const playlistPictureTransitionName = (playlistId: PlaylistId): string =>
  `playlist-picture-${ident(playlistId)}`;

/** What makes a playlist's picture one element to a view transition, on the page on screen only. */
export const playlistPictureTransitionStyle = (
  playlistId: PlaylistId,
  presence: Presence,
): Readonly<Record<string, string>> =>
  presence === "OnScreen"
    ? {
        viewTransitionName: playlistPictureTransitionName(playlistId),
        viewTransitionClass: "playlist-picture",
      }
    : {};

// NOTE: a genre's picture and a station's travel exactly as a playlist's
// does, a square tile to a square head, so they travel in its class: the
// style sheet times that one flight once, and the three can never drift apart.
const SQUARE_PICTURE_FLIGHT_CLASS = "playlist-picture";

/** The name a genre's picture travels under, as a playlist's does: from its tile to the head of its page, and back. */
export const genrePictureTransitionName = (genreId: GenreId): string =>
  `genre-picture-${ident(genreId)}`;

/** What makes a genre's picture one element to a view transition, on the page on screen only. */
export const genrePictureTransitionStyle = (
  genreId: GenreId,
  presence: Presence,
): Readonly<Record<string, string>> =>
  presence === "OnScreen"
    ? {
        viewTransitionName: genrePictureTransitionName(genreId),
        viewTransitionClass: SQUARE_PICTURE_FLIGHT_CLASS,
      }
    : {};

/** The name a station's picture travels under, as a playlist's does. */
export const stationPictureTransitionName = (stationId: StationId): string =>
  `station-picture-${ident(stationId)}`;

/** What makes a station's picture one element to a view transition, on the page on screen only. */
export const stationPictureTransitionStyle = (
  stationId: StationId,
  presence: Presence,
): Readonly<Record<string, string>> =>
  presence === "OnScreen"
    ? {
        viewTransitionName: stationPictureTransitionName(stationId),
        viewTransitionClass: SQUARE_PICTURE_FLIGHT_CLASS,
      }
    : {};

/** A section has no shared artwork. Each detail page has exactly one candidate. */
export const routeArtwork = (route: AppRoute): Option.Option<string> =>
  AppRoute.matchOrElse(route, {
    Track: ({ trackId }) => Option.some(coverTransitionName(trackId)),
    Album: ({ albumId }) => Option.some(albumCoverTransitionName(albumId)),
    Artist: ({ artistId }) => Option.some(artistPictureTransitionName(artistId)),
    Playlist: ({ playlistId }) => Option.some(playlistPictureTransitionName(playlistId)),
    Genre: ({ genreId }) => Option.some(genrePictureTransitionName(genreId)),
    Station: ({ stationId }) => Option.some(stationPictureTransitionName(stationId)),
  }, () => Option.none());

export const flightAttributes = <M>(style: Readonly<Record<string, string>>, h: HtmlBuilder<M>) =>
  style.viewTransitionName
    ? [h.DataAttribute("flight", style.viewTransitionName), h.Style(style)]
    : [];

/** Where a track's cover is, for a page that draws it. */
export type CoverPlace = Readonly<{ presence: Presence; isInPlayer: boolean }>;

/**
 * What makes a track's cover one element to a view transition, so the
 * browser moves it between its row and its page, or its row and the player,
 * instead of fading one out and the other in. The name must be on one element
 * at a time: the page on screen gives it, pages kept behind it do not, and
 * neither does any page for the track the player holds, whose cover has
 * travelled there.
 */
export const coverTransitionStyle = (
  trackId: TrackId,
  { presence, isInPlayer }: CoverPlace,
): Readonly<Record<string, string>> =>
  presence === "OnScreen" && !isInPlayer
    ? {
        viewTransitionName: coverTransitionName(trackId),
        viewTransitionClass: "track-cover",
      }
    : {};

/**
 * A track's cover at the size of its page. The row the listener came from
 * has already loaded the small rendition, so that one is drawn at once, with
 * no wait for the network or for decoding; the large one is drawn over it
 * when it arrives. The box never stands empty and nothing flashes in.
 */
export const coverView = (
  trackId: TrackId,
  maybeArtwork: Option.Option<Artwork>,
  isInPlayer: boolean,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [
      h.Class("catalog-art relative aspect-square overflow-hidden rounded-2xl bg-tile"),
      ...flightAttributes(coverTransitionStyle(trackId, { presence: "OnScreen", isInPlayer }), h),
    ],
    Option.match(maybeArtwork, {
      onNone: () => [missingPictureView(h)],
      onSome: (artwork) => [
        h.img([
          h.Decoding("sync"),
          h.Src(artwork.small),
          h.Alt(""),
          h.Class("absolute inset-0 size-full object-cover"),
        ]),
        h.img([
          h.Decoding("async"),
          h.Fetchpriority("high"),
          h.Src(artwork.large),
          h.Alt(""),
          h.Class("absolute inset-0 size-full object-cover"),
        ]),
      ],
    }),
  );
