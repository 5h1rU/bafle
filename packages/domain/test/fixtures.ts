import { AlbumId, type AlbumSummary } from "../src/Catalog/Album.ts";
import { ArtistId, type ArtistSummary } from "../src/Catalog/Artist.ts";
import type { Album } from "../src/Catalog/FullAlbum.ts";
import type { Artist } from "../src/Catalog/FullArtist.ts";
import type { Genre } from "../src/Catalog/FullGenre.ts";
import type { Playlist } from "../src/Catalog/FullPlaylist.ts";
import type { Station } from "../src/Catalog/FullStation.ts";
import { GenreId, type GenreSummary } from "../src/Catalog/Genre.ts";
import type {
  FeaturedMusic,
  MusicGenres,
  RadioStations,
  SearchResults,
  TrendingMusic,
} from "../src/Catalog/MusicCatalog.external.ts";
import { PlaylistId, type PlaylistSummary } from "../src/Catalog/Playlist.ts";
import { StationId, type StationSummary } from "../src/Catalog/Station.ts";
import { type Track, TrackId, type TrackSummary } from "../src/Catalog/Track.ts";

const artwork = (name: string) => ({
  small: `https://img.test/${name}/small.jpg`,
  medium: `https://img.test/${name}/medium.jpg`,
  large: `https://img.test/${name}/large.jpg`,
  placeholder: null,
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

/** The same track, as its own page shows it. */
export const fullTrack: Track = {
  ...track,
  artists: [artist],
  releaseDate: "2013-09-02",
  trackNumber: 3,
};

/** The same album, as its own page shows it. */
export const fullAlbum: Album = {
  ...album,
  tracks: [track],
  releaseDate: "2013-09-02",
};

/** The same artist, as their own page shows them. */
export const fullArtist: Artist = {
  ...artist,
  topTracks: [track],
  albums: [album],
};

/** The same playlist, as its own page shows it. */
export const fullPlaylist: Playlist = {
  id: playlist.id,
  title: playlist.title,
  curator: playlist.curator,
  picture: playlist.picture,
  tracks: [track],
};

export const genre: GenreSummary = {
  id: GenreId.make("ge-1"),
  name: "Cumbia",
  picture: artwork("ge-1"),
};

export const genres: MusicGenres = { genres: [genre] };

/** The same genre, as its own page shows it. */
export const fullGenre: Genre = {
  ...genre,
  topTracks: [track],
  albums: [album],
  artists: [artist],
  playlists: [playlist],
};

export const station: StationSummary = {
  id: StationId.make("st-1"),
  title: "Cumbia Sonidera",
  picture: artwork("st-1"),
};

export const stations: RadioStations = {
  groups: [{ genre: { id: genre.id, name: genre.name }, stations: [station] }],
};

/** The same station, as its own page shows it. */
export const fullStation: Station = { ...station, tracks: [track] };
