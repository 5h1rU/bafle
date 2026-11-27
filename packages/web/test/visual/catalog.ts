import { AlbumId, type AlbumSummary } from "@bafle/domain/Catalog/Album";
import { ArtistId, type ArtistSummary } from "@bafle/domain/Catalog/Artist";
import type { Artwork } from "@bafle/domain/Catalog/Artwork";
import type { Album } from "@bafle/domain/Catalog/FullAlbum";
import type { Artist } from "@bafle/domain/Catalog/FullArtist";
import type { Genre } from "@bafle/domain/Catalog/FullGenre";
import type { Playlist } from "@bafle/domain/Catalog/FullPlaylist";
import type { Station } from "@bafle/domain/Catalog/FullStation";
import { GenreId, type GenreSummary } from "@bafle/domain/Catalog/Genre";
import type {
  FeaturedMusic,
  MusicGenres,
  RadioStations,
  SearchResults,
  TrendingMusic,
} from "@bafle/domain/Catalog/MusicCatalog.external";
import { PlaylistId, type PlaylistSummary } from "@bafle/domain/Catalog/Playlist";
import { StationId, type StationSummary } from "@bafle/domain/Catalog/Station";
import { type Track, TrackId, type TrackSummary } from "@bafle/domain/Catalog/Track";
import * as Array from "effect/Array";

// A CATALOG TO LOOK AT

// The tests that compare pictures of the app need a catalog with enough in it
// to fill a screen: a chart long enough for a third column, shelves that go on
// past the edge, titles too long for their place. The catalog the other tests
// share is as small as each of them can do with, and its pictures have
// addresses nothing answers at.

/**
 * A picture that is in the page the moment it is drawn, the same on every
 * run: two colours, turned by its place in the catalog, drawn by the browser
 * from the address itself. Nothing is asked of the network.
 */
const picture = (seed: number): Artwork => {
  const hue = (seed * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="hsl(${hue} 55% 42%)"/><circle cx="${2 + (seed % 5)}" cy="${6 - (seed % 4)}" r="3" fill="hsl(${(hue + 60) % 360} 70% 68%)"/></svg>`;
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;

  return { small: url, medium: url, large: url, placeholder: null };
};

const ARTIST_NAMES = [
  "Daft Punk",
  "Bonobo",
  "Khruangbin",
  "Little Simz",
  "Rosalía",
  "Floating Points",
  "The Mountain Goats of the Northern Hemisphere",
  "Jungle",
  "Caribou",
];

export const artists: ReadonlyArray<ArtistSummary> = ARTIST_NAMES.map((name, index) => ({
  id: ArtistId.make(`ar-${index + 1}`),
  name,
  // One the catalog has no picture of: its tile shows the mark that stands for one.
  picture: index === 3 ? null : picture(index + 1),
}));

const artistAt = (index: number): ArtistSummary => artists[index % artists.length]!;

const ALBUM_TITLES = [
  "Discovery",
  "Migration",
  "Mordechai",
  "Sometimes I Might Be Introvert",
  "Motomami",
  "Crush",
  "An Album Whose Title Goes On For Rather Longer Than Its Tile Is Wide",
  "Volcano",
  "Suddenly",
  "Homework",
];

export const albums: ReadonlyArray<AlbumSummary> = ALBUM_TITLES.map((title, index) => {
  const by = artistAt(index);

  return {
    id: AlbumId.make(`al-${index + 1}`),
    title,
    artist: { id: by.id, name: by.name },
    cover: index === 5 ? null : picture(index + 20),
    explicit: index === 4,
  };
});

const albumAt = (index: number): AlbumSummary => albums[index % albums.length]!;

const TRACK_TITLES = [
  "Harder, Better, Faster, Stronger",
  "Kerala",
  "Time (You and I)",
  "Introvert",
  "Saoko",
  "Last Bloom",
  "A Song Whose Title Is Far Too Long To Be Read On One Line Of Any Row",
  "Back On 74",
  "Home",
  "Around the World",
  "One More Time",
  "Cirrus",
  "So We Won't Forget",
];

export const tracks: ReadonlyArray<TrackSummary> = TRACK_TITLES.map((title, index) => {
  const on = albumAt(index);

  return {
    id: TrackId.make(`tr-${index + 1}`),
    title,
    artist: on.artist,
    album: { id: on.id, title: on.title, cover: on.cover },
    durationSeconds: 180 + index * 17,
    // One with nothing to play: its row says so where its length would be.
    previewUrl: index === 2 ? null : `https://audio.test/tr-${index + 1}.mp3`,
    explicit: index === 4 || index === 7,
  };
});

export const firstTrack: TrackSummary = tracks[0]!;
export const secondTrack: TrackSummary = tracks[1]!;

const PLAYLIST_TITLES = [
  "French Touch",
  "Late Night Drive",
  "Sunday Morning",
  "Deep Focus",
  "A Playlist With A Long Name",
  "Running",
  "Dinner With Friends",
  "Rainy Day",
];

export const playlists: ReadonlyArray<PlaylistSummary> = PLAYLIST_TITLES.map((title, index) => ({
  id: PlaylistId.make(`pl-${index + 1}`),
  title,
  curator: "Bafle Editors",
  picture: index === 1 ? null : picture(index + 40),
  trackCount: 50,
}));

const GENRE_NAMES = [
  "Electro",
  "Dance",
  "Hip Hop",
  "Jazz",
  "Rock",
  "Pop",
  "Soul & Funk",
  "Classical",
  "Reggae",
  "Latin",
  "Folk",
  "Metal",
  "Blues",
  "Alternative",
];

export const genres: ReadonlyArray<GenreSummary> = GENRE_NAMES.map((name, index) => ({
  id: GenreId.make(`ge-${index + 1}`),
  name,
  picture: index === 2 ? null : picture(index + 60),
}));

const STATION_TITLES = [
  "French House",
  "Club Classics",
  "Nu Disco",
  "Ambient",
  "Techno Bunker",
  "Chill Beats",
  "Synthwave",
  "Garage",
];

export const stations: ReadonlyArray<StationSummary> = STATION_TITLES.map((title, index) => ({
  id: StationId.make(`st-${index + 1}`),
  title,
  picture: index === 0 ? null : picture(index + 80),
}));

export const featured: FeaturedMusic = {
  albums,
  playlists,
  artists,
};

export const trending: TrendingMusic = { tracks, albums };

export const allGenres: MusicGenres = { genres };

export const allStations: RadioStations = {
  groups: Array.map(Array.take(genres, 4), (genre, index) => ({
    genre: { id: genre.id, name: genre.name },
    stations: index === 1 ? Array.take(stations, 2) : stations,
  })),
};

export const found: SearchResults = {
  tracks: Array.take(tracks, 9),
  albums: Array.take(albums, 6),
  artists: Array.take(artists, 6),
  playlists: Array.take(playlists, 5),
};

/** A search that found songs and albums, and no artist to put on a card. */
export const foundNoArtist: SearchResults = {
  tracks: Array.take(tracks, 7),
  albums: Array.take(albums, 3),
  artists: [],
  playlists: [],
};

export const fullTrack: Track = {
  ...firstTrack,
  artists: [artistAt(0), artistAt(3)],
  releaseDate: "2001-03-12",
  trackNumber: 4,
};

export const fullAlbum: Album = {
  ...albums[0]!,
  tracks: Array.map(Array.take(tracks, 9), (track) => ({
    ...track,
    artist: albums[0]!.artist,
    album: { id: albums[0]!.id, title: albums[0]!.title, cover: albums[0]!.cover },
  })),
  releaseDate: "2001-03-07",
};

/** An album of one song: its page is still tall enough for its head to draw back. */
export const shortAlbum: Album = {
  ...albums[1]!,
  tracks: [{ ...secondTrack, album: { id: albums[1]!.id, title: albums[1]!.title, cover: albums[1]!.cover } }],
  releaseDate: null,
};

export const fullArtist: Artist = {
  ...artistAt(0),
  topTracks: Array.take(tracks, 10),
  albums,
};

export const fullPlaylist: Playlist = {
  id: playlists[0]!.id,
  title: playlists[0]!.title,
  curator: playlists[0]!.curator,
  picture: playlists[0]!.picture,
  tracks: Array.take(tracks, 8),
};

export const fullGenre: Genre = {
  ...genres[0]!,
  topTracks: tracks,
  albums,
  artists,
  playlists,
};

export const fullStation: Station = {
  ...stations[1]!,
  tracks: Array.take(tracks, 8),
};
