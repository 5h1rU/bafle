import type { AlbumId } from "@bafle/domain/Catalog/Album";
import type { Artwork } from "@bafle/domain/Catalog/Artwork";
import type { TrackId } from "@bafle/domain/Catalog/Track";
import { clsx } from "clsx";
import * as Option from "effect/Option";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "../message.ts";
import { AppRoute } from "../route.ts";
import { noteIcon } from "./icon.ts";
import type { Presence, TileKind } from "./layout.ts";
import { likenessStyle } from "./likeness.ts";

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
// NOTE: the pictures a page opens with are ready before it is drawn: the
// reply for the page was held until they were loaded and decoded
// (`firstPicturesOf`). They are drawn in the same frame as the page, decoded
// as they are drawn, which costs nothing for a picture already decoded; drawn
// apart from it, they would come a frame or more after the page, as an empty
// box that fills.
export type PictureLoading = "AtOnce" | "WhenNear";

const pictureView = <M>(url: string, loading: PictureLoading, h: HtmlBuilder<M>): Html =>
  h.img([
    ...(loading === "AtOnce"
      ? [h.Loading("eager"), h.Fetchpriority("high"), h.Decoding("sync")]
      : [h.Loading("lazy"), h.Decoding("async")]),
    h.Src(url),
    // The title sits beside every picture, so the picture itself says nothing new.
    h.Alt(""),
    h.Class("size-full object-cover"),
  ]);

export const missingPictureView = <M>(h: HtmlBuilder<M>): Html =>
  h.div([h.Class("flex size-full items-center justify-center text-muted")], [noteIcon("size-2/5")]);

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
      ...styleAttributes(likenessStyle(maybeArtwork), h),
    ],
    [
      Option.match(maybeArtwork, {
        onNone: () => missingPictureView(h),
        onSome: (artwork) => pictureView(artwork[size], loading, h),
      }),
    ],
  );

/**
 * The veil over a picture that has words over its foot (an album's head, the
 * card of the artist a search found): a piece of its own over the picture,
 * clear at the top and the night under the words.
 */
export const VEIL_CLASS = "after:pointer-events-none after:absolute after:inset-0 after:bg-veil";

/**
 * A picture at the size of a page's head, in a box that is never empty: the
 * small rendition, which the row or the tile the listener came from has
 * already loaded, is drawn at once, with no wait for the network or for
 * decoding, and the larger one is drawn over it when it arrives.
 */
const renditionsView = <M>(
  artwork: Artwork,
  size: "medium" | "large",
  h: HtmlBuilder<M>,
): ReadonlyArray<Html> => [
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
];

/**
 * The picture at the head of a page. The page is reached from a row, which
 * has loaded the small rendition, or from a tile, which has loaded the
 * medium one. A cached thumbnail fills the box while the final picture decodes.
 */
const headPictureView = (
  boxClass: string,
  flightStyle: Readonly<Record<string, string>>,
  maybeArtwork: Option.Option<Artwork>,
  h: HtmlBuilder<Message>,
  size: "medium" | "large" = "medium",
): Html =>
  h.div(
    [
      h.Class(clsx("catalog-art overflow-hidden bg-tile", boxClass)),
      ...pictureBoxAttributes(flightStyle, maybeArtwork, h),
    ],
    Option.match(maybeArtwork, {
      onNone: () => [missingPictureView(h)],
      onSome: (artwork) => renditionsView(artwork, size, h),
    }),
  );

/** A square picture beside a page's title: its box has its size before the picture arrives. */
const SQUARE_HEAD_CLASS = "relative aspect-square";

/**
 * The cover at the head of an album's page. It does not travel by itself:
 * the head it lies in does, with the title over it (`albumHeadFlightAttributes`).
 */
export const albumCoverView = (
  maybeArtwork: Option.Option<Artwork>,
  h: HtmlBuilder<Message>,
): Html => headPictureView("album-cover absolute inset-0 size-full", {}, maybeArtwork, h, "large");

/**
 * What makes the head of an album's page the piece that travels to and from
 * the album's tile on a shelf: the cover with the title and the facts over
 * it, as one picture. Were the cover to travel alone, it would land bare and
 * the words would appear over it afterwards, a step behind; in one picture
 * they grow out of the tile together and shrink back into it together.
 */
// NOTE: the head also carries the class `catalog-art`, which is what keeps
// the name off outside a flight (view/pageTransitions.css).
export const albumHeadFlightAttributes = (
  albumId: AlbumId,
  presence: Presence,
  h: HtmlBuilder<Message>,
) => flightAttributes(pictureFlightStyle("Album", albumId, presence), h);

/**
 * The picture at the head of the page of one thing, which arrives from the
 * thing's tile: in the tile's shape, round for an artist and square for the
 * rest.
 */
export const headPictureOf = (
  kind: Exclude<TileKind, "Album">,
  id: string,
  maybeArtwork: Option.Option<Artwork>,
  h: HtmlBuilder<Message>,
): Html =>
  headPictureView(
    clsx(SQUARE_HEAD_CLASS, kind === "Artist" ? "rounded-full" : "rounded-xl"),
    pictureFlightStyle(kind, id, "OnScreen"),
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
export const coverTransitionName = (trackId: TrackId): string => `track-cover-${ident(trackId)}`;

export const CHOOSE_TRACK = "choose-track";

/** The runtime supplies the same artwork name to the outgoing and incoming snapshots. */
export const artworkFlightRules = <M>(names: ReadonlyArray<string>, h: HtmlBuilder<M>): Html => {
  const rules = names.map((name) => {
    return `:root:active-view-transition-type(${name}) [data-flight="${name}"] { view-transition-name: ${name} !important; }`;
  });
  return h.style([], [rules.join("\n")]);
};

/**
 * What a kind's picture travels as between its tile and the head of its
 * page: what its name in a view transition starts with, and the class the
 * style sheet times its flight by.
 */
// NOTE: a genre's picture and a station's travel exactly as a playlist's
// does, a square tile to a square head, so they travel in its class: the
// style sheet times that one flight once, and the three can never drift apart.
const FLIGHTS: Readonly<Record<TileKind, Readonly<{ name: string; flightClass: string }>>> = {
  Album: { name: "album-cover", flightClass: "album-cover" },
  Artist: { name: "artist-picture", flightClass: "artist-picture" },
  Playlist: { name: "playlist-picture", flightClass: "playlist-picture" },
  Genre: { name: "genre-picture", flightClass: "playlist-picture" },
  Station: { name: "station-picture", flightClass: "playlist-picture" },
};

/**
 * The name a thing's picture travels under in a view transition: from its
 * tile on a shelf to the head of its page, and back. One element carries it
 * at a time, the one on the page on screen.
 */
export const pictureFlightName = (kind: TileKind, id: string): string =>
  `${FLIGHTS[kind].name}-${ident(id)}`;

/** What makes a thing's picture one element to a view transition, on the page on screen only. */
export const pictureFlightStyle = (
  kind: TileKind,
  id: string,
  presence: Presence,
): Readonly<Record<string, string>> =>
  presence === "OnScreen"
    ? {
        viewTransitionName: pictureFlightName(kind, id),
        viewTransitionClass: FLIGHTS[kind].flightClass,
      }
    : {};

/** A section has no shared artwork. Each detail page has exactly one candidate. */
export const routeArtwork = (route: AppRoute): Option.Option<string> =>
  AppRoute.matchOrElse(
    route,
    {
      Track: ({ trackId }) => Option.some(coverTransitionName(trackId)),
      Album: ({ albumId }) => Option.some(pictureFlightName("Album", albumId)),
      Artist: ({ artistId }) => Option.some(pictureFlightName("Artist", artistId)),
      Playlist: ({ playlistId }) => Option.some(pictureFlightName("Playlist", playlistId)),
      Genre: ({ genreId }) => Option.some(pictureFlightName("Genre", genreId)),
      Station: ({ stationId }) => Option.some(pictureFlightName("Station", stationId)),
    },
    () => Option.none(),
  );

export const flightAttributes = <M>(style: Readonly<Record<string, string>>, h: HtmlBuilder<M>) =>
  style.viewTransitionName
    ? [h.DataAttribute("flight", style.viewTransitionName), h.Style(style)]
    : [];

const styleAttributes = <M>(style: Readonly<Record<string, string>>, h: HtmlBuilder<M>) =>
  Object.keys(style).length === 0 ? [] : [h.Style(style)];

/**
 * The box of a picture that travels: its name in a view transition, when it
 * has one, and its likeness as its ground (`likenessStyle`), in one style.
 */
const pictureBoxAttributes = <M>(
  flightStyle: Readonly<Record<string, string>>,
  maybeArtwork: Option.Option<Artwork>,
  h: HtmlBuilder<M>,
) => {
  const flight = flightStyle.viewTransitionName
    ? [h.DataAttribute("flight", flightStyle.viewTransitionName)]
    : [];
  const travelling = flightStyle.viewTransitionName ? flightStyle : {};
  return [...flight, ...styleAttributes({ ...travelling, ...likenessStyle(maybeArtwork) }, h)];
};

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
      ...pictureBoxAttributes(
        coverTransitionStyle(trackId, { presence: "OnScreen", isInPlayer }),
        maybeArtwork,
        h,
      ),
    ],
    Option.match(maybeArtwork, {
      onNone: () => [missingPictureView(h)],
      onSome: (artwork) => renditionsView(artwork, "large", h),
    }),
  );
