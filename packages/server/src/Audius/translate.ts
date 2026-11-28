import { AlbumId, type AlbumSummary } from "@bafle/domain/Catalog/Album";
import { type ArtistCredit, ArtistId, type ArtistSummary } from "@bafle/domain/Catalog/Artist";
import type { Artwork } from "@bafle/domain/Catalog/Artwork";
import type { Album } from "@bafle/domain/Catalog/FullAlbum";
import type { Artist } from "@bafle/domain/Catalog/FullArtist";
import type { Playlist } from "@bafle/domain/Catalog/FullPlaylist";
import type { Station } from "@bafle/domain/Catalog/FullStation";
import { GenreId, type GenreSummary } from "@bafle/domain/Catalog/Genre";
import { PlaylistId, type PlaylistSummary } from "@bafle/domain/Catalog/Playlist";
import { type StationGroup, StationId, type StationSummary } from "@bafle/domain/Catalog/Station";
import { type Track, TrackId, type TrackSummary } from "@bafle/domain/Catalog/Track";
import * as Array from "effect/Array";
import type { AudiusPicture, AudiusPlaylist, AudiusTrack, AudiusUser } from "./AudiusSchemas.ts";

/** Audius's public API. It needs no key to read the catalog: one only raises how often it may be asked. */
export const AUDIUS_API = "https://api.audius.co/v1";

/**
 * Where every picture is drawn from. Audius keeps each picture on many of
 * its nodes, under the same path, and names a different one in each answer,
 * so the same cover came with another address on a track's row and on its
 * page, and the browser fetched it again for each. Audius's own node serves
 * them all, and says they never change.
 */
export const AUDIUS_PICTURES = "https://creatornode.audius.co";

const ON_A_NODE = /^https:\/\/[^/]+(\/content\/[^?#]+)$/;

/** The address of a picture on Audius's own node. An address of any other shape is left as Audius gave it. */
const onOneNode = (url: string): string => url.replace(ON_A_NODE, `${AUDIUS_PICTURES}$1`);

/**
 * Audius's 150, 480 and 1000 pixel pictures, as the sizes Bafle draws. A
 * size it left out is stood in for by the nearest one it gave; without any,
 * there is no artwork.
 */
export const toArtwork = (picture: AudiusPicture): Artwork | null => {
  const at = (size: "150x150" | "480x480" | "1000x1000") => {
    const url = picture?.[size];
    return url ? onOneNode(url) : null;
  };
  const small = at("150x150");
  const medium = at("480x480");
  const large = at("1000x1000");
  const any = medium ?? large ?? small;
  return any === null
    ? null
    : {
        small: small ?? medium ?? any,
        medium: any,
        large: large ?? any,
        placeholder: null,
      };
};

// NOTE: Audius draws its pictures as JPEG and at its three sizes only, and
// the server works a likeness out of a PNG alone (`Placeholder/png.ts`), so
// no picture of Audius's has a likeness yet: it is drawn on the ground of
// its box until it comes, as a picture whose likeness is not known is.

/** Whether the artist marked it explicit on upload. */
const isExplicit = (warning: string | null | undefined): boolean =>
  warning?.toLowerCase() === "explicit";

/** `YYYY-MM-DD`, from Audius's moment of release. */
const toReleaseDate = (date: string | null | undefined): string | null =>
  date && /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : null;

const toCredit = (user: AudiusUser): ArtistCredit => ({
  id: ArtistId.make(String(user.user_id)),
  name: user.name,
});

export const toArtist = (user: AudiusUser): ArtistSummary => ({
  ...toCredit(user),
  picture: toArtwork(user.profile_picture),
});

/**
 * What an album's id says when the album is a track on its own. Audius files
 * most tracks under no album, and every track in Bafle is on one: such a
 * track is a single, the album of that one track, whose id is the track's
 * with this in front, so that it is never taken for one of Audius's albums.
 */
const SINGLE = "single-";

/** The id of the single a track is on its own. */
export const singleOf = (track: AudiusTrack): AlbumId => AlbumId.make(`${SINGLE}${track.track_id}`);

/** The track a single is, when the album's id is a single's. */
export const trackOfSingle = (albumId: string): string | null =>
  albumId.startsWith(SINGLE) ? albumId.slice(SINGLE.length) : null;

/**
 * Where a track's audio is played from: Audius's own address for it, which
 * sends the player on to a copy that is signed as it is asked for, so it
 * never runs out. A track that is not streamed to everyone (sold, or kept for
 * followers) has the excerpt its artist made of it, or nothing to play.
 */
const audioOf = (track: AudiusTrack): string | null => {
  const streamed = track.is_streamable !== false && track.access?.stream !== false;
  const stream = `${AUDIUS_API}/tracks/${track.track_id}/stream`;
  if (streamed) return stream;
  return track.preview_cid ? `${stream}?preview=true` : null;
};

/** A track as a row shows it, on its album, or on its own as a single. */
export const toTrack = (track: AudiusTrack): TrackSummary => {
  const cover = toArtwork(track.artwork);
  const album = track.album_backlink;
  return {
    id: TrackId.make(String(track.track_id)),
    title: track.title,
    artist: toCredit(track.user),
    album: album
      ? { id: AlbumId.make(String(album.playlist_id)), title: album.playlist_name, cover }
      : { id: singleOf(track), title: track.title, cover },
    durationSeconds: Math.round(track.duration),
    previewUrl: audioOf(track),
    explicit: isExplicit(track.parental_warning_type),
  };
};

export const toFullTrack = (track: AudiusTrack): Track => ({
  ...toTrack(track),
  artists: [toArtist(track.user)],
  releaseDate: toReleaseDate(track.release_date),
  trackNumber: null,
});

export const toAlbum = (album: AudiusPlaylist): AlbumSummary => ({
  id: AlbumId.make(String(album.playlist_id)),
  title: album.playlist_name,
  artist: toCredit(album.user),
  cover: toArtwork(album.artwork),
  explicit: isExplicit(album.parental_warning_type),
});

/** A track on its own, as the album of that one track. */
export const toSingle = (track: AudiusTrack): AlbumSummary => ({
  id: singleOf(track),
  title: track.title,
  artist: toCredit(track.user),
  cover: toArtwork(track.artwork),
  explicit: isExplicit(track.parental_warning_type),
});

/**
 * An album with the tracks Audius lists for it, each once. Each track is on
 * this album, so it carries this album's id and title, and its own cover
 * where it has one.
 */
export const toFullAlbum = (album: AudiusPlaylist, tracks: ReadonlyArray<AudiusTrack>): Album => {
  const summary = toAlbum(album);
  return {
    ...summary,
    tracks: Array.dedupeWith(
      tracks.map((track) => {
        const row = toTrack(track);
        return {
          ...row,
          album: { id: summary.id, title: summary.title, cover: row.album.cover ?? summary.cover },
        };
      }),
      (a, b) => a.id === b.id,
    ),
    releaseDate: toReleaseDate(album.release_date),
  };
};

/** A single's page: the album of its one track. */
export const toFullSingle = (track: AudiusTrack): Album => ({
  ...toSingle(track),
  tracks: [toTrack(track)],
  releaseDate: toReleaseDate(track.release_date),
});

/**
 * An artist with their most played tracks, and what they have out: their
 * albums first, then their tracks on no album as singles, the latest first,
 * at most `most` of them in all.
 */
export const toFullArtist = (
  user: AudiusUser,
  topTracks: ReadonlyArray<AudiusTrack>,
  albums: ReadonlyArray<AudiusPlaylist>,
  latest: ReadonlyArray<AudiusTrack>,
  most: number,
): Artist => ({
  ...toArtist(user),
  topTracks: topTracks.map(toTrack),
  albums: Array.take(
    [...albums.map(toAlbum), ...latest.filter((track) => !track.album_backlink).map(toSingle)],
    most,
  ),
});

export const toPlaylist = (playlist: AudiusPlaylist): PlaylistSummary => ({
  id: PlaylistId.make(String(playlist.playlist_id)),
  title: playlist.playlist_name,
  curator: playlist.user.name,
  picture: toArtwork(playlist.artwork),
  trackCount: Math.round(playlist.track_count ?? 0),
});

/** A playlist with the tracks Audius lists for it, each once. */
export const toFullPlaylist = (
  playlist: AudiusPlaylist,
  tracks: ReadonlyArray<AudiusTrack>,
): Playlist => {
  const { trackCount: _, ...summary } = toPlaylist(playlist);
  return { ...summary, tracks: Array.dedupeWith(tracks.map(toTrack), (a, b) => a.id === b.id) };
};

/**
 * One of Audius's genres: the name Audius files music under, and the id
 * Bafle knows it by in an address, since a name holds slashes and spaces.
 */
export type AudiusGenre = Readonly<{ id: GenreId; name: string }>;

/** The id of a genre named `name`: its words in lower case, joined by hyphens. */
export const genreIdOf = (name: string): GenreId =>
  GenreId.make(
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, ""),
  );

/**
 * The genres Audius offers an artist on upload that are music: its
 * podcasts, audiobooks, spoken word, comedy and kids' are left out. An
 * artist may also write a genre of their own, and Audius counts those
 * beside these: they are left out too, since each is a handful of tracks
 * and the same genre written ten ways.
 */
export const AUDIUS_GENRES: ReadonlyArray<AudiusGenre> = [
  "Electronic",
  "Hip-Hop/Rap",
  "Metal",
  "Rock",
  "Alternative",
  "Experimental",
  "Pop",
  "Soundtrack",
  "Ambient",
  "Dubstep",
  "Folk",
  "House",
  "R&B/Soul",
  "Trap",
  "Classical",
  "Punk",
  "Drum & Bass",
  "Latin",
  "World",
  "Techno",
  "Trance",
  "Jazz",
  "Lo-Fi",
  "Acoustic",
  "Reggae",
  "Deep House",
  "Downtempo",
  "Tech House",
  "Country",
  "Vaporwave",
  "Progressive House",
  "Funk",
  "Devotional",
  "Future Bass",
  "Electro",
  "Disco",
  "Hardstyle",
  "Jersey Club",
  "Blues",
  "Glitch Hop",
  "Future House",
  "Jungle",
  "Moombahton",
  "Dancehall",
  "Tropical House",
  "Hyperpop",
].map((name) => ({ id: genreIdOf(name), name }));

/** The genre Bafle knows by `genreId`, if it is one of Audius's. */
export const genreOf = (genreId: string): AudiusGenre | undefined =>
  AUDIUS_GENRES.find((genre) => genre.id === genreId);

/**
 * Audius's genres in the order of how much is filed under each, most first,
 * as Audius counts them, at most `most` of them. A genre Audius did not
 * count goes after those it did, in the order it is listed here.
 */
export const genresByCount = (
  counted: ReadonlyArray<{ readonly name: string }>,
  most: number,
): ReadonlyArray<AudiusGenre> => {
  const order = counted.map((genre) => genre.name);
  const rank = (genre: AudiusGenre) => {
    const at = order.indexOf(genre.name);
    return at === -1 ? order.length + AUDIUS_GENRES.indexOf(genre) : at;
  };
  return Array.take(
    [...AUDIUS_GENRES].sort((a, b) => rank(a) - rank(b)),
    most,
  );
};

/** A genre as a tile shows it, with the cover of what is played most in it. */
export const toGenre = (genre: AudiusGenre, top: ReadonlyArray<AudiusTrack>): GenreSummary => ({
  id: genre.id,
  name: genre.name,
  picture: toArtwork(top[0]?.artwork),
});

/**
 * How far back what is played most is counted. Audius has no stations: each
 * of Bafle's is what is played most in one genre over one of these, dealt
 * afresh every time it is asked for.
 */
export const WINDOWS = [
  { id: "week", time: "week", title: "this week" },
  { id: "month", time: "month", title: "this month" },
  { id: "alltime", time: "allTime", title: "of all time" },
] as const;
export type Window = (typeof WINDOWS)[number];

/** The station of what is played most in `genre` over `window`. */
const stationIdOf = (window: Window, genre: AudiusGenre): StationId =>
  StationId.make(`${window.id}-${genre.id}`);

/** The genre and the window a station's id names, if it names one of each. */
export const stationOf = (
  stationId: string,
): Readonly<{ window: Window; genre: AudiusGenre }> | undefined => {
  const window = WINDOWS.find((each) => stationId.startsWith(`${each.id}-`));
  const genre = window && genreOf(stationId.slice(window.id.length + 1));
  return window && genre ? { window, genre } : undefined;
};

/**
 * A station as a tile shows it. Its cover is that of one of the tracks
 * played most in its genre this week (`week`, most played first): the first
 * for the first window, the second for the second, and so on while there are
 * tracks to take one from. The station's page is drawn with the same, so the
 * picture travels from the tile to the page's head.
 */
export const toStation = (
  window: Window,
  genre: AudiusGenre,
  week: ReadonlyArray<AudiusTrack>,
): StationSummary => ({
  id: stationIdOf(window, genre),
  title: `${genre.name} ${window.title}`,
  picture: toArtwork((week[WINDOWS.indexOf(window)] ?? week[0])?.artwork),
});

/** A genre's stations, one for each window. A genre with nothing played this week has no group. */
export const toStationGroup = (
  genre: AudiusGenre,
  week: ReadonlyArray<AudiusTrack>,
): StationGroup | null =>
  week.length === 0
    ? null
    : {
        genre: { id: genre.id, name: genre.name },
        stations: WINDOWS.map((window) => toStation(window, genre, week)),
      };

/** A station with the tracks it deals now, each once. */
export const toFullStation = (
  window: Window,
  genre: AudiusGenre,
  week: ReadonlyArray<AudiusTrack>,
  dealt: ReadonlyArray<AudiusTrack>,
): Station => ({
  ...toStation(window, genre, week),
  tracks: Array.dedupeWith(dealt.map(toTrack), (a, b) => a.id === b.id),
});
