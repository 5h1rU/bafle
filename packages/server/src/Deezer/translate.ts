import { AlbumId, type AlbumSummary } from "@bafle/domain/Catalog/Album";
import { ArtistId, type ArtistCredit, type ArtistSummary } from "@bafle/domain/Catalog/Artist";
import type { Artwork } from "@bafle/domain/Catalog/Artwork";
import { PlaylistId, type PlaylistSummary } from "@bafle/domain/Catalog/Playlist";
import type { Album } from "@bafle/domain/Catalog/FullAlbum";
import type { Artist } from "@bafle/domain/Catalog/FullArtist";
import type { Playlist } from "@bafle/domain/Catalog/FullPlaylist";
import { type Track, TrackId, type TrackSummary } from "@bafle/domain/Catalog/Track";
import * as Array from "effect/Array";
import type {
  DeezerAlbum,
  DeezerAlbumPage,
  DeezerAlbumTrack,
  DeezerArtist,
  DeezerArtistAlbum,
  DeezerPlaylist,
  DeezerPlaylistPage,
  DeezerTrack,
  DeezerTrackPage,
} from "./DeezerSchemas.ts";

type Image = string | null | undefined;

/**
 * Deezer's 250, 500 and 1000 pixel images, as the sizes Bafle draws. Its
 * 56 pixel image is too coarse for a thumbnail on a dense screen, so the 250
 * serves as the small one. Without all three there is no artwork.
 */
export const toArtwork = (medium: Image, big: Image, xl: Image): Artwork | null =>
  medium && big && xl ? { small: medium, medium: big, large: xl } : null;

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
