import { AlbumId, type AlbumSummary } from "@bafle/domain/Catalog/Album";
import { ArtistId, type ArtistCredit, type ArtistSummary } from "@bafle/domain/Catalog/Artist";
import type { Artwork } from "@bafle/domain/Catalog/Artwork";
import { PlaylistId, type PlaylistSummary } from "@bafle/domain/Catalog/Playlist";
import { TrackId, type TrackSummary } from "@bafle/domain/Catalog/Track";
import type { DeezerAlbum, DeezerArtist, DeezerPlaylist, DeezerTrack } from "./DeezerSchemas.ts";

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

export const toPlaylist = (playlist: DeezerPlaylist): PlaylistSummary => ({
  id: PlaylistId.make(String(playlist.id)),
  title: playlist.title,
  curator: playlist.user?.name ?? "Deezer",
  picture: toArtwork(playlist.picture_medium, playlist.picture_big, playlist.picture_xl),
  trackCount: Math.round(playlist.nb_tracks ?? 0),
});
