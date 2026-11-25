import { AlbumId, type AlbumSummary } from "@bafle/domain/Catalog/Album";
import { ArtistId, type ArtistCredit, type ArtistSummary } from "@bafle/domain/Catalog/Artist";
import type { Artwork } from "@bafle/domain/Catalog/Artwork";
import { PlaylistId, type PlaylistSummary } from "@bafle/domain/Catalog/Playlist";
import type { Album } from "@bafle/domain/Catalog/FullAlbum";
import type { Artist } from "@bafle/domain/Catalog/FullArtist";
import type { Genre } from "@bafle/domain/Catalog/FullGenre";
import type { Playlist } from "@bafle/domain/Catalog/FullPlaylist";
import type { Station } from "@bafle/domain/Catalog/FullStation";
import { GenreId, type GenreSummary } from "@bafle/domain/Catalog/Genre";
import {
  type StationGroup,
  StationId,
  type StationSummary,
} from "@bafle/domain/Catalog/Station";
import { type Track, TrackId, type TrackSummary } from "@bafle/domain/Catalog/Track";
import * as Array from "effect/Array";
import type {
  DeezerAlbum,
  DeezerAlbumPage,
  DeezerAlbumTrack,
  DeezerArtist,
  DeezerArtistAlbum,
  DeezerChart,
  DeezerGenre,
  DeezerPlaylist,
  DeezerPlaylistPage,
  DeezerRadio,
  DeezerRadioGenre,
  DeezerTrack,
  DeezerTrackPage,
} from "./DeezerSchemas.ts";

type Image = string | null | undefined;

// NOTE: Deezer's image server draws a picture in the format its address ends
// in, and the catalog only ever hands out the JPEG's address. Nothing Deezer
// publishes says so: it is what the server does (seen 2026-11-25, for covers,
// artists, playlists, genres and stations, at all three sizes). Should it
// stop, this is the line to take out.
const DEEZER_JPEG = /(\/\d+x\d+-[0-9a-f]{6}-\d+-\d+-\d+)\.jpg$/;

/**
 * The same picture as WebP, which is a third to a half lighter than the
 * JPEG at the same size. An address of any other shape is not one this
 * knows how to ask differently, and is left as Deezer gave it.
 */
const asWebp = (url: string): string => url.replace(DEEZER_JPEG, "$1.webp");

/**
 * Deezer's 250, 500 and 1000 pixel images, as the sizes Bafle draws. Its
 * 56 pixel image is too coarse for a thumbnail on a dense screen, so the 250
 * serves as the small one. Without all three there is no artwork.
 */
export const toArtwork = (medium: Image, big: Image, xl: Image): Artwork | null =>
  medium && big && xl
    ? { small: asWebp(medium), medium: asWebp(big), large: asWebp(xl) }
    : null;

const toCredit = (artist: { readonly id: number; readonly name: string }): ArtistCredit => ({
  id: ArtistId.make(String(artist.id)),
  name: artist.name,
});

export const toArtist = (artist: DeezerArtist): ArtistSummary => ({
  id: ArtistId.make(String(artist.id)),
  name: artist.name,
  picture: toArtwork(artist.picture_medium, artist.picture_big, artist.picture_xl),
});

export const toAlbum = (album: DeezerAlbum): AlbumSummary => ({
  id: AlbumId.make(String(album.id)),
  title: album.title,
  artist: toCredit(album.artist),
  cover: toArtwork(album.cover_medium, album.cover_big, album.cover_xl),
  explicit: album.explicit_lyrics ?? false,
});

export const toTrack = (track: DeezerTrack): TrackSummary => ({
  id: TrackId.make(String(track.id)),
  title: track.title,
  artist: toCredit(track.artist),
  album: {
    id: AlbumId.make(String(track.album.id)),
    title: track.album.title,
    cover: toArtwork(track.album.cover_medium, track.album.cover_big, track.album.cover_xl),
  },
  durationSeconds: Math.round(track.duration),
  previewUrl: track.preview || null,
  explicit: track.explicit_lyrics ?? false,
});

/** `YYYY-MM-DD` and nothing else. Deezer writes `0000-00-00` when it does not know. */
const toReleaseDate = (date: string | null | undefined): string | null =>
  date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !date.startsWith("0000") ? date : null;

export const toFullTrack = (track: DeezerTrackPage): Track => {
  // Without contributors, the main artist is still credited, by name alone.
  const credited = track.contributors?.length
    ? track.contributors
    : [{ id: track.artist.id, name: track.artist.name }];
  return {
    ...toTrack(track),
    artists: Array.dedupeWith(credited.map(toArtist), (a, b) => a.id === b.id),
    releaseDate: toReleaseDate(track.release_date),
    trackNumber:
      track.track_position && track.track_position > 0 ? Math.round(track.track_position) : null,
  };
};

/**
 * An album with the tracks Deezer lists for it. Each track is on this album,
 * so it carries this album's id, title and cover, whether or not Deezer
 * repeated them on it.
 */
export const toFullAlbum = (
  album: DeezerAlbumPage,
  tracks: ReadonlyArray<DeezerAlbumTrack>,
): Album => {
  const summary = toAlbum(album);
  return {
    ...summary,
    tracks: tracks.map((track) => ({
      id: TrackId.make(String(track.id)),
      title: track.title,
      artist: toCredit(track.artist),
      album: { id: summary.id, title: summary.title, cover: summary.cover },
      durationSeconds: Math.round(track.duration),
      previewUrl: track.preview || null,
      explicit: track.explicit_lyrics ?? false,
    })),
    releaseDate: toReleaseDate(album.release_date),
  };
};

/**
 * An artist with the tracks and the albums Deezer lists for them. Each album
 * is theirs, so it carries their id and name, which Deezer leaves off it.
 */
export const toFullArtist = (
  artist: DeezerArtist,
  topTracks: ReadonlyArray<DeezerTrack>,
  albums: ReadonlyArray<DeezerArtistAlbum>,
): Artist => {
  const summary = toArtist(artist);
  return {
    ...summary,
    topTracks: topTracks.map(toTrack),
    albums: albums.map((album) => ({
      id: AlbumId.make(String(album.id)),
      title: album.title,
      artist: { id: summary.id, name: summary.name },
      cover: toArtwork(album.cover_medium, album.cover_big, album.cover_xl),
      explicit: album.explicit_lyrics ?? false,
    })),
  };
};

/** Who keeps a playlist. Deezer names them `creator` on the playlist itself and `user` in a list. */
const toCurator = (playlist: DeezerPlaylistPage): string =>
  playlist.creator?.name ?? playlist.user?.name ?? "Deezer";

/** A playlist with the tracks Deezer lists for it, each once. */
export const toFullPlaylist = (
  playlist: DeezerPlaylistPage,
  tracks: ReadonlyArray<DeezerTrack>,
): Playlist => ({
  id: PlaylistId.make(String(playlist.id)),
  title: playlist.title,
  curator: toCurator(playlist),
  picture: toArtwork(playlist.picture_medium, playlist.picture_big, playlist.picture_xl),
  tracks: Array.dedupeWith(tracks.map(toTrack), (a, b) => a.id === b.id),
});

export const toPlaylist = (playlist: DeezerPlaylist): PlaylistSummary => ({
  id: PlaylistId.make(String(playlist.id)),
  title: playlist.title,
  curator: playlist.user?.name ?? "Deezer",
  picture: toArtwork(playlist.picture_medium, playlist.picture_big, playlist.picture_xl),
  trackCount: Math.round(playlist.nb_tracks ?? 0),
});

export const toGenre = (genre: DeezerGenre): GenreSummary => ({
  id: GenreId.make(String(genre.id)),
  name: genre.name,
  picture: toArtwork(genre.picture_medium, genre.picture_big, genre.picture_xl),
});

/**
 * A genre with what Deezer's chart for it lists: at most `topTracks` of its
 * tracks and `shelfSize` of each other kind, since one answer carries every
 * kind and was asked for the most that any of them needs.
 */
export const toFullGenre = (
  genre: DeezerGenre,
  chart: DeezerChart,
  topTracks: number,
  shelfSize: number,
): Genre => ({
  ...toGenre(genre),
  topTracks: Array.take(chart.tracks?.data ?? [], topTracks).map(toTrack),
  albums: Array.take(chart.albums?.data ?? [], shelfSize).map(toAlbum),
  artists: Array.take(chart.artists?.data ?? [], shelfSize).map(toArtist),
  playlists: Array.take(chart.playlists?.data ?? [], shelfSize).map(toPlaylist),
});

export const toStation = (radio: DeezerRadio): StationSummary => ({
  id: StationId.make(String(radio.id)),
  title: radio.title,
  picture: toArtwork(radio.picture_medium, radio.picture_big, radio.picture_xl),
});

/**
 * Deezer's stations by genre, as Bafle groups them. Deezer files some
 * stations under two genres: each is kept once, under the first genre that
 * lists it, and a genre left with none has no group.
 */
export const toStationGroups = (
  genres: ReadonlyArray<DeezerRadioGenre>,
): ReadonlyArray<StationGroup> => {
  const grouped = Array.reduce(
    genres,
    { groups: Array.empty<StationGroup>(), listed: Array.empty<number>() },
    ({ groups, listed }, genre) => {
      const fresh = Array.dedupeWith(
        genre.radios.filter((radio) => !listed.includes(radio.id)),
        (a, b) => a.id === b.id,
      );
      return {
        groups: Array.isReadonlyArrayNonEmpty(fresh)
          ? [
              ...groups,
              {
                genre: { id: GenreId.make(String(genre.id)), name: genre.title },
                stations: fresh.map(toStation),
              },
            ]
          : groups,
        listed: [...listed, ...fresh.map((radio) => radio.id)],
      };
    },
  );
  return grouped.groups;
};

/** A station with the tracks Deezer deals for it, each once. */
export const toFullStation = (radio: DeezerRadio, tracks: ReadonlyArray<DeezerTrack>): Station => ({
  ...toStation(radio),
  tracks: Array.dedupeWith(tracks.map(toTrack), (a, b) => a.id === b.id),
});
