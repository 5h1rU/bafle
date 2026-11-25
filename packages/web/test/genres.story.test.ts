import { GenreId } from "@bafle/domain/Catalog/Genre";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import { describe, expect, test } from "vitest";
import { init, update } from "../src/main.ts";
import { Message } from "../src/message.ts";
import {
  Awaiting,
  GenreData,
  genreData,
  GenreListData,
  hasWayBackFromGenre,
  maybeAlbumIdInDocument,
  maybeArtistIdInDocument,
  maybeGenreIdInDocument,
  type Model,
  wayBack,
} from "../src/model.ts";
import * as Player from "../src/player/index.ts";
import { AppRoute, isSamePage, routeToUrl, urlToAppRoute } from "../src/route.ts";
import { PAGE_IDS } from "../src/view/layout.ts";
import {
  after,
  album,
  albumPath,
  allGenres,
  answered,
  arrived,
  artist,
  artistPath,
  awaitedId,
  changedUrl,
  chose,
  choseFromRow,
  clickedLink,
  explicitTrack,
  fullGenre,
  genre,
  genrePath,
  onGenre,
  onGenres,
  onHome,
  opened,
  openingGenreFromTile,
  playlist,
  playlistPath,
  reply,
  track,
  trackPath,
  url,
} from "./fixtures.ts";

const genresRoute = AppRoute.Genres();
const genreRoute = AppRoute.Genre({ genreId: genre.id });
const otherGenreId = GenreId.make("ge-9");

/** What a result of `init` or `update` asks the runtime to do, as name and args. */
const asked = (result: ReturnType<typeof init>) =>
  (result.commands ?? []).map((command) => [command.name, command.args]);

const names = (result: ReturnType<typeof init>): ReadonlyArray<string> =>
  (result.commands ?? []).map((command) => command.name);

const session = (model: Model): Player.Session => Option.getOrThrow(model.player.maybeSession);

/** Home still on screen; the listener chose Genres from the menu, which has never loaded. */
const leavingHomeForGenres: Model = chose(onHome, "/genres");

describe("the routes of Genres and of a genre", () => {
  test("the section's address is its own, and so is each genre's", () => {
    expect(urlToAppRoute(url("/genres"))).toEqual(genresRoute);
    expect(routeToUrl(genresRoute)).toBe("/genres");
    expect(urlToAppRoute(url(genrePath(genre.id)))).toEqual(genreRoute);
    expect(routeToUrl(genreRoute)).toBe("/genre/ge-1");
  });

  test("the section is one page, and every genre has a page of its own", () => {
    expect(isSamePage(genresRoute, AppRoute.Genres())).toBe(true);
    expect(isSamePage(genresRoute, genreRoute)).toBe(false);
    expect(isSamePage(genreRoute, AppRoute.Genre({ genreId: genre.id }))).toBe(true);
    expect(isSamePage(genreRoute, AppRoute.Genre({ genreId: otherGenreId }))).toBe(false);
  });
});

describe("Genres is a section", () => {
  test("reached by its address, it is on screen at once, loading, and its data is asked for", () => {
    const opening = init(url("/genres"));

    expect(opening.model.route).toEqual(genresRoute);
    expect(opening.model.genreList).toEqual(GenreListData.Loading());
    expect(asked(opening)).toEqual([["GenreList", { input: {}, requestId: "page:0" }]]);
  });

  test("the reply settles as every genre, or as a failure", () => {
    const loading = opened("/genres");

    expect(answered(loading, reply.genres).genreList).toEqual(
      GenreListData.Success({ data: allGenres }),
    );
    expect(answered(loading, reply.genresRefused).genreList).toEqual(
      GenreListData.Failure({ error: "CatalogUnavailable" }),
    );
    expect(answered(loading, reply.genresLost).genreList).toEqual(
      GenreListData.Failure({ error: "Unreachable" }),
    );
  });

  test("chosen from the menu, the page on screen is held and the URL stays", () => {
    const chosen = update(onHome, clickedLink("/genres"));

    expect(chosen.model.route).toEqual(AppRoute.Home());
    expect(chosen.model.awaiting).toMatchObject({ _tag: "Intention", route: genresRoute });
    expect(chosen.model.genreList).toEqual(GenreListData.Loading());
    expect(names(chosen)).toEqual(["GenreList"]);
  });

  test("when the genres arrive the section takes the screen and the URL, with the navigation whole", () => {
    const drawnBack = after(leavingHomeForGenres, Message.ScrolledDown());
    const arriving = update(drawnBack, arrived(reply.genres(awaitedId(drawnBack))));

    expect(arriving.model.route).toEqual(genresRoute);
    expect(arriving.model.awaiting).toEqual(Awaiting.Nothing());
    expect(arriving.model.navigation).toBe("Open");
    expect(wayBack(arriving.model)).toEqual(Option.some(AppRoute.Home()));
    expect(asked(arriving)).toEqual([["NavigateInternal", { url: "/genres" }]]);
  });

  test("a navigation item has no room to state a failure: the section takes the screen and says it", () => {
    const failing = update(
      leavingHomeForGenres,
      arrived(reply.genresRefused(awaitedId(leavingHomeForGenres))),
    );

    expect(failing.model.route).toEqual(genresRoute);
    expect(failing.model.genreList).toEqual(GenreListData.Failure({ error: "CatalogUnavailable" }));
    expect(names(failing)).toContain("NavigateInternal");

    const retried = update(failing.model, Message.ClickedTryAgain());
    expect(names(retried)).toEqual(["GenreList", "FocusPage"]);
  });

  test("the latest intention wins: another choice abandons it without a trace", () => {
    const elsewhere = after(leavingHomeForGenres, clickedLink("/new"));

    expect(elsewhere.genreList).toEqual(GenreListData.Idle());
    const late = update(elsewhere, arrived(reply.genres(awaitedId(leavingHomeForGenres))));
    expect(late.model.genreList).toEqual(GenreListData.Idle());
    expect(late.model.route).toEqual(AppRoute.Home());
  });

  test("once loaded it opens at once and refreshes behind its page", () => {
    const onGenresFromHome = answered(leavingHomeForGenres, reply.genres, "/genres");
    const backOnHome = after(onGenresFromHome, changedUrl("/"));
    const again = update(backOnHome, clickedLink("/genres"));

    expect(again.model.route).toEqual(genresRoute);
    expect(again.model.genreList).toEqual(GenreListData.Refreshing({ data: allGenres }));
    expect(names(again)).toEqual(["NavigateInternal", "GenreList"]);
  });

  test("chosen again while it is on screen, it goes to its top and loads where it stands", () => {
    const again = update(onGenres, clickedLink("/genres"));

    expect(again.model.route).toEqual(genresRoute);
    expect(asked(again)).toContainEqual(["ScrollPageToTop", { pageId: PAGE_IDS.Genres }]);
    expect(names(again)).toContain("GenreList");
    expect(names(again)).not.toContain("NavigateInternal");
  });
});

describe("a genre reached by its address", () => {
  test("it is on screen at once, loading, and its data is asked for", () => {
    const opening = init(url(genrePath(genre.id)));

    expect(opening.model.route).toEqual(genreRoute);
    expect(genreData(opening.model, genre.id)).toEqual(GenreData.Loading());
    expect(asked(opening)).toEqual([
      ["GenreDetail", { input: { genreId: genre.id }, requestId: "page:0" }],
    ]);
  });

  test("the reply settles under the genre's id: the genre, a failure, or that there is none", () => {
    const loading = opened(genrePath(genre.id));

    expect(genreData(answered(loading, reply.genre), genre.id)).toEqual(
      GenreData.Success({ data: Option.some(fullGenre) }),
    );
    expect(genreData(answered(loading, reply.genreRefused), genre.id)).toEqual(
      GenreData.Failure({ error: "CatalogUnavailable" }),
    );
    expect(genreData(answered(loading, reply.genreLost), genre.id)).toEqual(
      GenreData.Failure({ error: "Unreachable" }),
    );
    expect(genreData(answered(loading, reply.genreMissing), genre.id)).toEqual(
      GenreData.Success({ data: Option.none() }),
    );
  });

  test("Try again loads the page where it stands, and a genre known to be missing is not asked for again", () => {
    const failed = answered(opened(genrePath(genre.id)), reply.genreRefused);
    const retried = update(failed, Message.ClickedTryAgain());
    expect(names(retried)).toEqual(["GenreDetail", "FocusPage"]);
    expect(names(retried)).not.toContain("NavigateInternal");

    const missing = answered(opened(genrePath(genre.id)), reply.genreMissing);
    expect(names(update(missing, clickedLink(genrePath(genre.id))))).not.toContain("GenreDetail");
  });
});

describe("a genre chosen from its tile", () => {
  test("Genres is held, and the URL stays", () => {
    const chosen = update(onGenres, clickedLink(genrePath(genre.id)));

    expect(chosen.model.route).toEqual(genresRoute);
    expect(chosen.model.awaiting).toMatchObject({ _tag: "Intention", route: genreRoute });
    expect(genreData(chosen.model, genre.id)).toEqual(GenreData.Loading());
    expect(names(chosen)).toEqual(["GenreDetail"]);
  });

  test("when the genre arrives its page takes the screen, the URL and the focus, with Genres behind it", () => {
    const arriving = update(
      openingGenreFromTile,
      arrived(reply.genre(awaitedId(openingGenreFromTile))),
    );

    expect(arriving.model.route).toEqual(genreRoute);
    expect(arriving.model.awaiting).toEqual(Awaiting.Nothing());
    expect(wayBack(arriving.model)).toEqual(Option.some(genresRoute));
    expect(asked(arriving)).toEqual([
      ["FocusPage", { pageId: PAGE_IDS.Genre }],
      ["NavigateInternal", { url: "/genre/ge-1" }],
    ]);
  });

  test("a tile has no room to state a failure: the genre's page takes the screen and says it", () => {
    const failing = update(
      openingGenreFromTile,
      arrived(reply.genreRefused(awaitedId(openingGenreFromTile))),
    );

    expect(failing.model.route).toEqual(genreRoute);
    expect(genreData(failing.model, genre.id)).toEqual(
      GenreData.Failure({ error: "CatalogUnavailable" }),
    );
    expect(names(failing)).toContain("NavigateInternal");
    expect(wayBack(failing.model)).toEqual(Option.some(genresRoute));
  });

  test("so does the page of a genre the catalog does not have", () => {
    const missing = update(
      openingGenreFromTile,
      arrived(reply.genreMissing(awaitedId(openingGenreFromTile))),
    );

    expect(missing.model.route).toEqual(genreRoute);
    expect(genreData(missing.model, genre.id)).toEqual(GenreData.Success({ data: Option.none() }));
    expect(names(missing)).toContain("NavigateInternal");
  });

  test("the latest intention wins: another choice abandons the genre without a trace", () => {
    const elsewhere = after(openingGenreFromTile, clickedLink("/new"));

    expect(elsewhere.route).toEqual(genresRoute);
    expect(HashMap.has(elsewhere.genres, genre.id)).toBe(false);
    // Its reply, if it still comes, matches nothing.
    const late = update(elsewhere, arrived(reply.genre(awaitedId(openingGenreFromTile))));
    expect(late.model.genres).toBe(elsewhere.genres);
    expect(late.model.route).toEqual(genresRoute);
    expect(names(late)).not.toContain("NavigateInternal");
  });

  test("a genre already held opens at once and refreshes behind its page", () => {
    const backOnGenres = after(onGenre, changedUrl("/genres"));
    const again = update(backOnGenres, clickedLink(genrePath(genre.id)));

    expect(again.model.route).toEqual(genreRoute);
    expect(genreData(again.model, genre.id)).toEqual(
      GenreData.Refreshing({ data: Option.some(fullGenre) }),
    );
    expect(names(again)).toContain("NavigateInternal");
    expect(names(again)).toContain("GenreDetail");
  });
});

describe("back from a genre", () => {
  test("the focus goes to the tile it was chosen from, and Genres refreshes behind it", () => {
    const back = update(onGenre, changedUrl("/genres"));

    expect(back.model.route).toEqual(genresRoute);
    expect(asked(back)).toContainEqual([
      "FocusGenreTile",
      { pageId: PAGE_IDS.Genres, genreId: genre.id },
    ]);
    expect(back.model.genreList).toEqual(GenreListData.Refreshing({ data: allGenres }));
  });
});

describe("playing from the genre's page", () => {
  const tapped = Message.ClickedPlayTrack({ trackId: track.id, from: "Genre" });

  test("the tracks played most in the genre become the queue", () => {
    const playing = after(onGenre, tapped);

    expect(session(playing).current.id).toBe(track.id);
    expect(session(playing).later.map((queued) => queued.id)).toEqual([explicitTrack.id]);
  });

  test("playing is no navigation: the page, the URL and the history are as they were", () => {
    const playing = update(onGenre, tapped);

    expect(playing.model.route).toEqual(onGenre.route);
    expect(playing.model.trail).toEqual(onGenre.trail);
    expect(names(playing)).not.toContain("NavigateInternal");
  });

  test("a row of the genre queues its track as a row of any list does", () => {
    const queued = after(
      after(onGenre, tapped),
      choseFromRow("Genre", explicitTrack.id, "PlayNext"),
    );

    expect(queued.rowDone.maybeRow).toEqual(
      Option.some({ from: "Genre", trackId: explicitTrack.id, place: "Next" }),
    );
  });
});

describe("the genre's page behind a page reached from it", () => {
  /** A song of the genre opened from the genre's own row: the genre is behind its page. */
  const onSongFromGenre = answered(
    after(onGenre, choseFromRow("Genre", track.id, "OpenSong")),
    reply.track,
    trackPath(track.id),
  );

  /** The album of one of its songs, asked from that song's row. */
  const onAlbumFromRow = answered(
    after(onGenre, choseFromRow("Genre", track.id, "OpenAlbum")),
    reply.album,
    albumPath(album.id),
  );

  /** An album, an artist and a playlist chosen from the genre's shelves. */
  const onAlbumFromTile = answered(
    chose(onGenre, albumPath(album.id)),
    reply.album,
    albumPath(album.id),
  );
  const onArtistFromTile = answered(
    chose(onGenre, artistPath(artist.id)),
    reply.artist,
    artistPath(artist.id),
  );
  const onPlaylistFromTile = answered(
    chose(onGenre, playlistPath(playlist.id)),
    reply.playlist,
    playlistPath(playlist.id),
  );

  test("the genre on screen is the one in the document", () => {
    expect(maybeGenreIdInDocument(onGenre.route, onGenre.trail)).toEqual(Option.some(genre.id));
    expect(maybeGenreIdInDocument(onGenres.route, onGenres.trail)).toEqual(Option.none());
  });

  test("behind a song opened from it, the genre stays in the document, and comes back with the focus on its row", () => {
    expect(onSongFromGenre.route).toEqual(AppRoute.Track({ trackId: track.id }));
    expect(maybeGenreIdInDocument(onSongFromGenre.route, onSongFromGenre.trail)).toEqual(
      Option.some(genre.id),
    );

    const back = update(onSongFromGenre, changedUrl(genrePath(genre.id)));
    expect(back.model.route).toEqual(genreRoute);
    expect(asked(back)).toContainEqual([
      "FocusTrackRow",
      { pageId: PAGE_IDS.Genre, trackId: track.id },
    ]);
  });

  test("Go to album on one of its rows holds the genre, and the album comes back to that row", () => {
    const chosen = update(onGenre, choseFromRow("Genre", track.id, "OpenAlbum"));
    expect(chosen.model.route).toEqual(genreRoute);
    expect(HashMap.get(chosen.model.albumRows, album.id)).toEqual(
      Option.some({ from: "Genre", trackId: track.id }),
    );
    expect(names(chosen)).toEqual(["AlbumDetail"]);

    const back = update(onAlbumFromRow, changedUrl(genrePath(genre.id)));
    expect(back.model.route).toEqual(genreRoute);
    expect(asked(back)).toContainEqual([
      "FocusTrackRow",
      { pageId: PAGE_IDS.Genre, trackId: track.id },
    ]);
  });

  test("an album chosen from its shelf holds the genre, and comes back to its tile", () => {
    const chosen = update(onGenre, clickedLink(albumPath(album.id)));
    expect(chosen.model.route).toEqual(genreRoute);
    expect(chosen.model.awaiting).toMatchObject({
      _tag: "Intention",
      route: AppRoute.Album({ albumId: album.id }),
    });

    expect(maybeGenreIdInDocument(onAlbumFromTile.route, onAlbumFromTile.trail)).toEqual(
      Option.some(genre.id),
    );
    const back = update(onAlbumFromTile, changedUrl(genrePath(genre.id)));
    expect(asked(back)).toContainEqual([
      "FocusAlbumTile",
      { pageId: PAGE_IDS.Genre, albumId: album.id },
    ]);
  });

  test("an artist and a playlist chosen from its shelves come back to their tiles on the genre's page", () => {
    expect(onArtistFromTile.route).toEqual(AppRoute.Artist({ artistId: artist.id }));
    expect(wayBack(onArtistFromTile)).toEqual(Option.some(genreRoute));
    const backFromArtist = update(onArtistFromTile, changedUrl(genrePath(genre.id)));
    expect(backFromArtist.model.route).toEqual(genreRoute);
    expect(asked(backFromArtist)).toContainEqual([
      "FocusArtistTile",
      { pageId: PAGE_IDS.Genre, artistId: artist.id },
    ]);

    expect(onPlaylistFromTile.route).toEqual(AppRoute.Playlist({ playlistId: playlist.id }));
    const backFromPlaylist = update(onPlaylistFromTile, changedUrl(genrePath(genre.id)));
    expect(asked(backFromPlaylist)).toContainEqual([
      "FocusPlaylistTile",
      { pageId: PAGE_IDS.Genre, playlistId: playlist.id },
    ]);
  });

  test("three pages on, the genre, the artist and the album between are all kept", () => {
    const onAlbumFromArtist = answered(
      chose(onArtistFromTile, albumPath(album.id)),
      reply.album,
      albumPath(album.id),
    );
    const onSongFromAlbum = answered(
      after(onAlbumFromArtist, choseFromRow("Album", track.id, "OpenSong")),
      reply.track,
      trackPath(track.id),
    );

    expect(maybeGenreIdInDocument(onSongFromAlbum.route, onSongFromAlbum.trail)).toEqual(
      Option.some(genre.id),
    );
    expect(maybeArtistIdInDocument(onSongFromAlbum.route, onSongFromAlbum.trail)).toEqual(
      Option.some(artist.id),
    );
    expect(maybeAlbumIdInDocument(onSongFromAlbum.route, onSongFromAlbum.trail)).toEqual(
      Option.some(album.id),
    );
  });

  test("its way back is the page behind its own entry, on screen and kept alike", () => {
    expect(hasWayBackFromGenre(onGenre.route, onGenre.trail)).toBe(true);
    expect(hasWayBackFromGenre(onSongFromGenre.route, onSongFromGenre.trail)).toBe(true);

    // Reached by its address, nothing is behind it: not on screen, and not once a song is over it.
    const direct = answered(opened(genrePath(genre.id)), reply.genre);
    const songOverDirect = answered(
      after(direct, choseFromRow("Genre", track.id, "OpenSong")),
      reply.track,
      trackPath(track.id),
    );
    expect(hasWayBackFromGenre(direct.route, direct.trail)).toBe(false);
    expect(hasWayBackFromGenre(songOverDirect.route, songOverDirect.trail)).toBe(false);
  });

  test("a genre left for good is in the document no longer, and another takes the one place there is", () => {
    const backOnGenres = after(onGenre, changedUrl("/genres"));
    expect(maybeGenreIdInDocument(backOnGenres.route, backOnGenres.trail)).toEqual(Option.none());

    const onOther = answered(
      chose(backOnGenres, genrePath(otherGenreId)),
      (id) => reply.genre(id, { ...fullGenre, id: otherGenreId }),
      genrePath(otherGenreId),
    );
    expect(maybeGenreIdInDocument(onOther.route, onOther.trail)).toEqual(
      Option.some(otherGenreId),
    );
  });
});
