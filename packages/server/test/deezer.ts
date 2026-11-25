import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Layer from "effect/Layer";

/** What a fake Deezer answers a path with: a JSON body, and a status when it isn't 200. */
export interface Answer {
  readonly body: unknown;
  readonly status?: number;
}

/**
 * A Deezer that answers each path from a table, and remembers every URL it
 * was asked for. A path is looked up with what was asked of it first
 * (`/album/9/tracks?index=100&limit=100`), so a list can answer each of its
 * pages, and then by itself.
 */
export const fakeDeezer = (answers: Readonly<Record<string, Answer>>) => {
  const asked: Array<URL> = [];
  const layer = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request, url) =>
      Effect.sync(() => {
        asked.push(url);
        const answer = answers[`${url.pathname}${url.search}`] ??
          answers[url.pathname] ?? { body: "Not Found", status: 404 };
        return HttpClientResponse.fromWeb(
          request,
          new Response(JSON.stringify(answer.body), {
            status: answer.status ?? 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }),
    ),
  );
  return { asked, layer };
};

const pictures = (kind: "cover" | "picture", id: number) => ({
  [`${kind}_small`]: `https://cdn.test/${id}/56.jpg`,
  [`${kind}_medium`]: `https://cdn.test/${id}/250.jpg`,
  [`${kind}_big`]: `https://cdn.test/${id}/500.jpg`,
  [`${kind}_xl`]: `https://cdn.test/${id}/1000.jpg`,
});

/** Deezer's own shapes, with the fields Bafle ignores left in. */
export const deezerArtist = {
  id: 27,
  name: "Daft Punk",
  link: "https://www.deezer.com/artist/27",
  ...pictures("picture", 27),
  radio: true,
  type: "artist",
};

export const deezerAlbum = {
  id: 302127,
  title: "Discovery",
  ...pictures("cover", 302127),
  record_type: "album",
  explicit_lyrics: false,
  artist: { id: 27, name: "Daft Punk", type: "artist" },
  type: "album",
};

export const deezerTrack = {
  id: 3135556,
  title: "Harder, Better, Faster, Stronger",
  duration: 224,
  rank: 956167,
  explicit_lyrics: true,
  preview: "https://cdn.test/3135556.mp3?exp=1",
  artist: { id: 27, name: "Daft Punk", type: "artist" },
  album: { id: 302127, title: "Discovery", ...pictures("cover", 302127), type: "album" },
  type: "track",
};

export const deezerPlaylist = {
  id: 908622995,
  title: "Chill Hits",
  nb_tracks: 60,
  ...pictures("picture", 908622995),
  user: { id: 2, name: "Deezer Editors", type: "user" },
  type: "playlist",
};

/** The same track asked for by id: Deezer adds the date, the position and the credits. */
export const deezerTrackPage = {
  ...deezerTrack,
  isrc: "GBDUW0000059",
  track_position: 4,
  disk_number: 1,
  release_date: "2001-03-12",
  bpm: 123,
  contributors: [
    { ...deezerArtist, role: "Main" },
    { id: 99, name: "Romanthony", role: "Featured" },
    // Deezer lists an artist once per role.
    { ...deezerArtist, role: "Featured" },
  ],
};

/** A track as Deezer lists it under its album. */
const albumTrack = (id: number, title: string) => ({ ...deezerTrack, id, title, rank: 1 });

/** The same album asked for by id: Deezer adds the date, the count and the tracks. */
export const deezerAlbumPage = {
  ...deezerAlbum,
  upc: "724384960650",
  nb_tracks: 2,
  duration: 544,
  release_date: "2001-03-07",
  tracks: { data: [albumTrack(3135553, "One More Time"), deezerTrack] },
};

/**
 * An album longer than what Deezer sends with it: three tracks, of which the
 * album's own answer carries the first. Its tracks, asked for by themselves,
 * come without the album on each.
 */
export const longAlbumPage = {
  ...deezerAlbumPage,
  id: 77,
  nb_tracks: 3,
  release_date: "0000-00-00",
  tracks: { data: [albumTrack(1, "First")] },
};

const { album: _album, ...bareAlbumTrack } = deezerTrack;

export const longAlbumTracks = {
  data: [
    { ...bareAlbumTrack, id: 1, title: "First", track_position: 1 },
    { ...bareAlbumTrack, id: 2, title: "Second", track_position: 2 },
    { ...bareAlbumTrack, id: 3, title: "Third", track_position: 3, preview: "" },
  ],
  total: 3,
};

/** The same artist asked for by id: Deezer adds how much it has of theirs. */
export const deezerArtistPage = { ...deezerArtist, nb_album: 2, nb_fan: 4635563 };

/** An album as Deezer lists it under its artist: the artist is left off. */
const { artist: _artist, ...bareArtistAlbum } = deezerAlbum;

export const artistAlbums = {
  data: [
    { ...bareArtistAlbum, release_date: "2001-03-07" },
    // No cover and no word on its lyrics.
    { id: 6575789, title: "Random Access Memories", record_type: "album", type: "album" },
  ],
  total: 2,
};

/** What is played most of theirs: tracks as any list has them. */
export const artistTop = {
  data: [{ ...deezerTrack, id: 3135553, title: "One More Time" }, deezerTrack],
  total: 2,
};

/** The same playlist asked for by id: Deezer names its keeper `creator`, and adds the tracks. */
const { user: _user, ...keeperlessPlaylist } = deezerPlaylist;

export const deezerPlaylistPage = {
  ...keeperlessPlaylist,
  nb_tracks: 2,
  description: "Easy listening",
  creator: { id: 2, name: "Deezer Editors", type: "user" },
  tracks: {
    data: [{ ...deezerTrack, id: 3135553, title: "One More Time", time_add: 1 }, deezerTrack],
    checksum: "abc",
  },
};

/**
 * A playlist longer than what Deezer sends with it: three tracks, of which
 * the playlist's own answer carries the first. Nobody is named as its keeper.
 */
export const longPlaylistPage = {
  ...keeperlessPlaylist,
  id: 78,
  nb_tracks: 3,
  tracks: { data: [{ ...deezerTrack, id: 1, title: "First" }] },
};

export const longPlaylistTracks = {
  data: [
    { ...deezerTrack, id: 1, title: "First" },
    { ...deezerTrack, id: 2, title: "Second" },
    // Listed twice: a page lists a track once.
    { ...deezerTrack, id: 2, title: "Second" },
    { ...deezerTrack, id: 3, title: "Third", preview: "" },
  ],
  total: 4,
};

/** A playlist Deezer has no picture or curator for. */
export const barePlaylist = { id: 5, title: "Untitled", picture_medium: "", type: "playlist" };

/** A genre, as Deezer lists it and as it answers for it by id. */
export const deezerGenre = {
  id: 132,
  name: "Pop",
  picture: "https://api.deezer.com/genre/132/image",
  ...pictures("picture", 132),
  type: "genre",
};

/** All genres at once: Deezer lists it first, and it is no genre. */
export const deezerAllGenres = { ...deezerGenre, id: 0, name: "All" };

/** A genre Deezer has no picture for. */
export const bareGenre = { id: 85, name: "Alternative", type: "genre" };

/** What is played most in a genre: every kind in one answer, and podcasts, which Bafle does not read. */
export const genreChart = {
  tracks: {
    data: [
      { ...deezerTrack, id: 3135553, title: "One More Time", position: 1 },
      { ...deezerTrack, position: 2 },
      { ...deezerTrack, id: 3, title: "Third", position: 3 },
    ],
    total: 3,
  },
  albums: { data: [{ ...deezerAlbum, position: 1 }], total: 1 },
  artists: { data: [{ ...deezerArtist, position: 1 }], total: 1 },
  playlists: { data: [deezerPlaylist, barePlaylist], total: 2 },
  podcasts: { data: [{ id: 1, title: "A podcast" }], total: 1 },
};

/** A station, which Deezer calls a radio, as a list has it and as it answers for it by id. */
export const deezerRadio = {
  id: 38305,
  title: "The '80s",
  description: "The '80s",
  ...pictures("picture", 38305),
  tracklist: "https://api.deezer.com/radio/38305/tracks",
  type: "radio",
};

/** A station Deezer has no picture for. */
export const bareRadio = { id: 30771, title: "Electro Pop", type: "radio" };

/** Deezer's stations under their genres. One station is filed under two of them, and one genre has none of its own. */
export const radioGenres = {
  data: [
    { id: 132, title: "Pop", radios: [deezerRadio, bareRadio] },
    { id: 106, title: "Electro", radios: [bareRadio, { ...deezerRadio, id: 31061, title: "Electro" }] },
    { id: 113, title: "Dance", radios: [bareRadio] },
    { id: 466, title: "Folk", radios: [] },
  ],
};

/** The songs a station plays now. Deezer says neither how many there are nor that more follow. */
export const radioTracks = {
  data: [
    { ...deezerTrack, id: 3135553, title: "One More Time", readable: true },
    deezerTrack,
    // Dealt twice: a page lists a track once.
    { ...deezerTrack, id: 3135553, title: "One More Time", readable: true },
    { ...deezerTrack, id: 3, title: "Third", preview: "" },
  ],
};

/** A Deezer where every list has something in it. */
export const stocked = {
  "/editorial/0/selection": { body: { data: [deezerAlbum] } },
  "/chart/0/playlists": { body: { data: [deezerPlaylist, barePlaylist], total: 2 } },
  "/chart/0/artists": { body: { data: [deezerArtist], total: 1 } },
  "/chart/0/tracks": { body: { data: [deezerTrack], total: 1 } },
  "/chart/0/albums": { body: { data: [deezerAlbum], total: 1 } },
  "/search/track": { body: { data: [deezerTrack], total: 1 } },
  "/search/album": { body: { data: [deezerAlbum], total: 1 } },
  "/search/artist": { body: { data: [deezerArtist], total: 1 } },
  "/search/playlist": { body: { data: [], total: 0 } },
  "/track/3135556": { body: deezerTrackPage },
  "/track/404": { body: { error: { type: "DataException", message: "no data", code: 800 } } },
  "/track/429": { body: { error: { type: "Exception", message: "Quota limit exceeded", code: 4 } } },
  "/album/302127": { body: deezerAlbumPage },
  "/album/77": { body: longAlbumPage },
  "/album/77/tracks": { body: longAlbumTracks },
  "/album/404": { body: { error: { type: "DataException", message: "no data", code: 800 } } },
  "/album/429": { body: { error: { type: "Exception", message: "Quota limit exceeded", code: 4 } } },
  "/artist/27": { body: deezerArtistPage },
  "/artist/27/top": { body: artistTop },
  "/artist/27/albums": { body: artistAlbums },
  "/artist/404": { body: { error: { type: "DataException", message: "no data", code: 800 } } },
  "/artist/429": { body: { error: { type: "Exception", message: "Quota limit exceeded", code: 4 } } },
  "/playlist/908622995": { body: deezerPlaylistPage },
  "/playlist/78": { body: longPlaylistPage },
  "/playlist/78/tracks": { body: longPlaylistTracks },
  "/playlist/404": { body: { error: { type: "DataException", message: "no data", code: 800 } } },
  "/playlist/429": {
    body: { error: { type: "Exception", message: "Quota limit exceeded", code: 4 } },
  },
  "/genre": { body: { data: [deezerAllGenres, deezerGenre, bareGenre] } },
  "/genre/132": { body: deezerGenre },
  "/chart/132": { body: genreChart },
  "/genre/404": { body: { error: { type: "DataException", message: "no data", code: 800 } } },
  // Deezer answers a chart for any id at all, a genre it does not have included.
  "/chart/404": { body: genreChart },
  "/genre/429": { body: { error: { type: "Exception", message: "Quota limit exceeded", code: 4 } } },
  "/radio/genres": { body: radioGenres },
  "/radio/38305": { body: deezerRadio },
  "/radio/38305/tracks": { body: radioTracks },
  "/radio/404": { body: { error: { type: "DataException", message: "no data", code: 800 } } },
  "/radio/429": { body: { error: { type: "Exception", message: "Quota limit exceeded", code: 4 } } },
} satisfies Record<string, Answer>;
