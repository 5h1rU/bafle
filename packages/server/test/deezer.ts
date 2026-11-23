import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Layer from "effect/Layer";

/** What a fake Deezer answers a path with: a JSON body, and a status when it isn't 200. */
export interface Answer {
  readonly body: unknown;
  readonly status?: number;
}

/** A Deezer that answers each path from a table, and remembers every URL it was asked for. */
export const fakeDeezer = (answers: Readonly<Record<string, Answer>>) => {
  const asked: Array<URL> = [];
  const layer = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request, url) =>
      Effect.sync(() => {
        asked.push(url);
        const answer = answers[url.pathname] ?? { body: "Not Found", status: 404 };
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

/** A playlist Deezer has no picture or curator for. */
export const barePlaylist = { id: 5, title: "Untitled", picture_medium: "", type: "playlist" };

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
} satisfies Record<string, Answer>;
