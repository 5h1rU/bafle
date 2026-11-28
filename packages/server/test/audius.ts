import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Layer from "effect/Layer";

/** What a fake Audius answers with: a JSON body, and a status when it isn't 200. */
export interface Answer {
  readonly body: unknown;
  readonly status?: number;
}

/**
 * How a fake Audius answers one path: by itself, or only when the question
 * carries `params` (each with the value given), so that one path can answer
 * each genre, window or kind it is asked for. An answer that is a function
 * is worked out each time the route is asked, so it can change from one
 * question to the next.
 */
export interface Route {
  readonly path: string;
  readonly params?: Readonly<Record<string, string>>;
  readonly answer: Answer | (() => Answer);
}

/**
 * An Audius that answers each question from a list of routes, the first that
 * fits, and remembers every URL it was asked for, and who asked for each
 * (the `authorization` it carried). A path is written as it follows
 * Audius's `/v1`.
 */
export const fakeAudius = (routes: ReadonlyArray<Route>) => {
  const asked: Array<URL> = [];
  const askedAs: Array<string | undefined> = [];
  const layer = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request, url) =>
      Effect.sync(() => {
        asked.push(url);
        askedAs.push(request.headers["authorization"]);
        const path = url.pathname.replace(/^\/v1/, "");
        const route = routes.find(
          (each) =>
            each.path === path &&
            Object.entries(each.params ?? {}).every(
              ([name, value]) => url.searchParams.get(name) === value,
            ),
        );
        const answer =
          route === undefined
            ? { body: { code: 404, error: "not found" }, status: 404 }
            : typeof route.answer === "function"
              ? route.answer()
              : route.answer;
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
  return { asked, askedAs, layer };
};

/** Audius names a different node in each answer: a picture's address is on any of them. */
export const audiusPicture = (cid: string, node = "https://node-7.audius.test") => ({
  "150x150": `${node}/content/${cid}/150x150.jpg`,
  "480x480": `${node}/content/${cid}/480x480.jpg`,
  "1000x1000": `${node}/content/${cid}/1000x1000.jpg`,
  mirrors: ["https://mirror.audius.test"],
});

/** Audius's own shapes, with some of the fields Bafle ignores left in. */
export const audiusUser = {
  id: "9RzXA",
  user_id: 144099,
  name: "Raar",
  handle: "pimpmyraar",
  is_verified: true,
  profile_picture: audiusPicture("raar"),
};

export const audiusTrack = {
  id: "M2l69g9",
  track_id: 1174250038,
  title: "Jack Got Jacked",
  duration: 173.4,
  genre: "Electronic",
  release_date: "2026-11-23T15:12:40.839263Z",
  play_count: 941,
  artwork: audiusPicture("jack", "https://node-3.audius.test"),
  user: audiusUser,
  album_backlink: null,
  is_streamable: true,
  access: { stream: true, download: true },
  preview_cid: null,
  parental_warning_type: null,
};

export const audiusAlbumTrack = {
  ...audiusTrack,
  id: "PbvbB8R",
  track_id: 2088271306,
  title: "Calling",
  duration: 201,
  parental_warning_type: "explicit",
  album_backlink: {
    playlist_id: 101196116,
    playlist_name: "Redefined",
    permalink: "/raar/album/x",
  },
};

export const audiusAlbum = {
  id: "VJYqM9",
  playlist_id: 101196116,
  playlist_name: "Redefined",
  is_album: true,
  artwork: audiusPicture("redefined"),
  user: audiusUser,
  track_count: 1,
  release_date: "2026-07-02T16:00:00Z",
  parental_warning_type: null,
};

export const audiusPlaylist = {
  id: "wz6bmm5",
  playlist_id: 1855049980,
  playlist_name: "Hot & New",
  is_album: false,
  artwork: audiusPicture("hot"),
  user: { ...audiusUser, user_id: 494762277, name: "Hot & New Archives" },
  track_count: 20,
};

/** A track on its own, as Audius lists it, numbered `n`. */
export const trackNumbered = (n: number, cid = `cover-${n}`) => ({
  ...audiusTrack,
  id: `t${n}`,
  track_id: n,
  title: `Track ${n}`,
  artwork: audiusPicture(cid),
});

export const data = (body: unknown): Answer => ({ body: { data: body } });
