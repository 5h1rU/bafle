import { AlbumId, type AlbumSummary } from "../src/Catalog/Album.ts";
import { ArtistId, type ArtistSummary } from "../src/Catalog/Artist.ts";
import type {
  FeaturedMusic,
  SearchResults,
  TrendingMusic,
} from "../src/Catalog/MusicCatalog.external.ts";
import { PlaylistId, type PlaylistSummary } from "../src/Catalog/Playlist.ts";
import { TrackId, type TrackSummary } from "../src/Catalog/Track.ts";

const artwork = (name: string) => ({
  small: `https://img.test/${name}/small.jpg`,
  medium: `https://img.test/${name}/medium.jpg`,
  large: `https://img.test/${name}/large.jpg`,
});

export const artist: ArtistSummary = {
  id: ArtistId.make("ar-1"),
  name: "Los Ángeles Azules",
  picture: artwork("ar-1"),
};

export const album: AlbumSummary = {
  id: AlbumId.make("al-1"),
  title: "Cumbia Sinfónica",
  artist: { id: artist.id, name: artist.name },
  cover: artwork("al-1"),
  explicit: false,
};

export const track: TrackSummary = {
  id: TrackId.make("tr-1"),
  title: "Cómo Te Voy a Olvidar",
  artist: { id: artist.id, name: artist.name },
  album: { id: album.id, title: album.title, cover: album.cover },
  durationSeconds: 262,
  previewUrl: "https://audio.test/tr-1.mp3",
  explicit: false,
};

export const playlist: PlaylistSummary = {
  id: PlaylistId.make("pl-1"),
  title: "Cumbia Essentials",
  curator: "Bafle Editors",
  picture: null,
  trackCount: 50,
};

export const featured: FeaturedMusic = {
  albums: [album],
  playlists: [playlist],
  artists: [artist],
};

export const trending: TrendingMusic = { tracks: [track], albums: [album] };

export const found: SearchResults = {
  tracks: [track],
  albums: [album],
  artists: [artist],
  playlists: [playlist],
};
