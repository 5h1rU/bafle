import { ArtistId } from "@bafle/domain/Catalog/Artist";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import { describe, expect, test } from "vitest";
import { init, update } from "../src/main.ts";
import { Message } from "../src/message.ts";
import {
  ArtistData,
  Awaiting,
  type Model,
  artistData,
  maybeAlbumIdInDocument,
  maybeArtistIdInDocument,
  wayBack,
} from "../src/model.ts";
import * as Player from "../src/player/index.ts";
import { AppRoute, isSamePage, routeToUrl, urlToAppRoute } from "../src/route.ts";
import { PAGE_IDS } from "../src/view/layout.ts";
import {
  after,
  album,
  albumPath,
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
  fullArtist,
  guest,
  onArtist,
  onHome,
  onSearch,
  opened,
  openingArtistFromTile,
  reply,
  track,
  trackPath,
  url,
} from "./fixtures.ts";

const artistRoute = AppRoute.Artist({ artistId: artist.id });

/** What a result of `init` or `update` asks the runtime to do, as name and args. */
const asked = (result: ReturnType<typeof init>) =>
  (result.commands ?? []).map((command) => [command.name, command.args]);

const names = (result: ReturnType<typeof init>): ReadonlyArray<string> =>
  (result.commands ?? []).map((command) => command.name);

const session = (model: Model): Player.Session => Option.getOrThrow(model.player.maybeSession);

describe("the artist's route", () => {
  test("an artist's address is their own, and leads back to them", () => {
    expect(urlToAppRoute(url(artistPath(artist.id)))).toEqual(artistRoute);
    expect(routeToUrl(artistRoute)).toBe("/artist/ar-1");
  });

  test("every artist has a page of their own", () => {
    expect(isSamePage(artistRoute, AppRoute.Artist({ artistId: artist.id }))).toBe(true);
    expect(isSamePage(artistRoute, AppRoute.Artist({ artistId: guest.id }))).toBe(false);
    expect(isSamePage(artistRoute, AppRoute.Album({ albumId: album.id }))).toBe(false);
  });
});

describe("an artist reached by their address", () => {
  test("their page is on screen at once, loading, and its data is asked for", () => {
    const opening = init(url(artistPath(artist.id)));

    expect(opening.model.route).toEqual(artistRoute);
    expect(artistData(opening.model, artist.id)).toEqual(ArtistData.Loading());
    expect(asked(opening)).toEqual([
      ["ArtistDetail", { input: { artistId: artist.id }, requestId: "page:0" }],
    ]);
  });

  test("the reply settles under the artist's id: the artist, a failure, or that there is none", () => {
    const loading = opened(artistPath(artist.id));

    expect(artistData(answered(loading, reply.artist), artist.id)).toEqual(
      ArtistData.Success({ data: Option.some(fullArtist) }),
    );
    expect(artistData(answered(loading, reply.artistRefused), artist.id)).toEqual(
      ArtistData.Failure({ error: "CatalogUnavailable" }),
    );
    expect(artistData(answered(loading, reply.artistLost), artist.id)).toEqual(
      ArtistData.Failure({ error: "Unreachable" }),
    );
    expect(artistData(answered(loading, reply.artistMissing), artist.id)).toEqual(
      ArtistData.Success({ data: Option.none() }),
    );
  });

  test("Try again loads the page where it stands, and an artist known to be missing is not asked for again", () => {
    const failed = answered(opened(artistPath(artist.id)), reply.artistRefused);
    const retried = update(failed, Message.ClickedTryAgain());
    expect(names(retried)).toEqual(["ArtistDetail", "FocusPage"]);
    expect(names(retried)).not.toContain("NavigateInternal");

    const missing = answered(opened(artistPath(artist.id)), reply.artistMissing);
    expect(names(update(missing, clickedLink(artistPath(artist.id))))).not.toContain(
      "ArtistDetail",
    );
  });
});

describe("an artist chosen from a shelf", () => {
  test("the page they were chosen on is held, and the URL stays", () => {
    const chosen = update(onHome, clickedLink(artistPath(artist.id)));

    expect(chosen.model.route).toEqual(AppRoute.Home());
    expect(chosen.model.awaiting).toMatchObject({ _tag: "Intention", route: artistRoute });
    expect(artistData(chosen.model, artist.id)).toEqual(ArtistData.Loading());
    expect(names(chosen)).toEqual(["ArtistDetail"]);
  });

  test("when the artist arrives their page takes the screen, the URL and the focus, with the shelf behind it", () => {
    const arriving = update(
      openingArtistFromTile,
      arrived(reply.artist(awaitedId(openingArtistFromTile))),
    );

    expect(arriving.model.route).toEqual(artistRoute);
    expect(arriving.model.awaiting).toEqual(Awaiting.Nothing());
    expect(wayBack(arriving.model)).toEqual(Option.some(AppRoute.Home()));
    expect(asked(arriving)).toEqual([
      ["FocusPage", { pageId: PAGE_IDS.Artist }],
      ["NavigateInternal", { url: "/artist/ar-1" }],
    ]);
  });

  test("a tile has no room to state a failure: the artist's page takes the screen and says it", () => {
    const failing = update(
      openingArtistFromTile,
      arrived(reply.artistRefused(awaitedId(openingArtistFromTile))),
    );

    expect(failing.model.route).toEqual(artistRoute);
    expect(artistData(failing.model, artist.id)).toEqual(
      ArtistData.Failure({ error: "CatalogUnavailable" }),
    );
    expect(names(failing)).toContain("NavigateInternal");
    expect(wayBack(failing.model)).toEqual(Option.some(AppRoute.Home()));
  });

  test("so does the page of an artist the catalog does not have", () => {
    const missing = update(
      openingArtistFromTile,
      arrived(reply.artistMissing(awaitedId(openingArtistFromTile))),
    );

    expect(missing.model.route).toEqual(artistRoute);
    expect(artistData(missing.model, artist.id)).toEqual(
      ArtistData.Success({ data: Option.none() }),
    );
    expect(names(missing)).toContain("NavigateInternal");
  });

  test("the latest intention wins: another choice abandons the artist without a trace", () => {
    const elsewhere = after(openingArtistFromTile, clickedLink("/new"));

    expect(elsewhere.route).toEqual(AppRoute.Home());
    expect(HashMap.has(elsewhere.artists, artist.id)).toBe(false);
    // Their reply, if it still comes, matches nothing.
    const late = update(elsewhere, arrived(reply.artist(awaitedId(openingArtistFromTile))));
    expect(late.model.artists).toBe(elsewhere.artists);
    expect(late.model.route).toEqual(AppRoute.Home());
    expect(names(late)).not.toContain("NavigateInternal");
  });

  test("another artist's tile is another question: only the one chosen last is loading", () => {
    const other = after(openingArtistFromTile, clickedLink(artistPath(guest.id)));

    expect(HashMap.has(other.artists, artist.id)).toBe(false);
    expect(artistData(other, guest.id)).toEqual(ArtistData.Loading());
  });

  test("an artist already held opens at once and refreshes behind their page", () => {
    const backOnHome = after(onArtist, changedUrl("/"));
    const again = update(backOnHome, clickedLink(artistPath(artist.id)));

    expect(again.model.route).toEqual(artistRoute);
    expect(artistData(again.model, artist.id)).toEqual(
      ArtistData.Refreshing({ data: Option.some(fullArtist) }),
    );
    expect(names(again)).toContain("NavigateInternal");
    expect(names(again)).toContain("ArtistDetail");
  });
});

describe("back from an artist", () => {
  test("the focus goes to the tile they were chosen from", () => {
    const back = update(onArtist, changedUrl("/"));

    expect(back.model.route).toEqual(AppRoute.Home());
    expect(asked(back)).toContainEqual([
      "FocusArtistTile",
      { pageId: PAGE_IDS.Home, artistId: artist.id },
    ]);
  });

  test("on Search too, where the tile takes it and not the field", () => {
    const onArtistFromSearch = answered(
      chose(onSearch, artistPath(artist.id)),
      reply.artist,
      artistPath(artist.id),
    );
    const back = update(onArtistFromSearch, changedUrl("/search?q=daft"));

    expect(back.model.route._tag).toBe("Search");
    expect(asked(back)).toContainEqual([
      "FocusArtistTile",
      { pageId: PAGE_IDS.Search, artistId: artist.id },
    ]);
    expect(names(back)).not.toContain("FocusSearchField");
  });
});

describe("playing from the artist's page", () => {
  const tapped = Message.ClickedPlayTrack({ trackId: track.id, from: "Artist" });

  test("their most played tracks become the queue: what follows is the rest of them", () => {
    const playing = after(onArtist, tapped);

    expect(session(playing).current.id).toBe(track.id);
    expect(session(playing).later.map((queued) => queued.id)).toEqual([explicitTrack.id]);
  });

  test("playing is no navigation: the page, the URL and the history are as they were", () => {
    const playing = update(onArtist, tapped);

    expect(playing.model.route).toEqual(onArtist.route);
    expect(playing.model.trail).toEqual(onArtist.trail);
    expect(names(playing)).not.toContain("NavigateInternal");
  });

  test("a row of the artist queues its track as a row of any list does", () => {
    const queued = after(
      after(onArtist, Message.ClickedPlayTrack({ trackId: explicitTrack.id, from: "Artist" })),
      choseFromRow("Artist", track.id, "AddToQueue"),
    );

    expect(session(queued).later.map((waiting) => waiting.id)).toEqual([track.id]);
    expect(queued.rows.done.maybeRow).toEqual(
      Option.some({ from: "Artist", trackId: track.id, place: "Last" }),
    );
  });
});

describe("the artist's page behind a page reached from it", () => {
  /** An album chosen from the artist's own shelf: the artist is behind its page. */
  const onAlbumFromArtist = answered(
    chose(onArtist, albumPath(album.id)),
    reply.album,
    albumPath(album.id),
  );

  /** A song opened from one of the artist's rows. */
  const onSongFromArtist = answered(
    after(onArtist, choseFromRow("Artist", track.id, "OpenSong")),
    reply.track,
    trackPath(track.id),
  );

  test("the artist on screen is the one in the document", () => {
    expect(maybeArtistIdInDocument(onArtist.route, onArtist.trail)).toEqual(
      Option.some(artist.id),
    );
    expect(maybeArtistIdInDocument(onHome.route, onHome.trail)).toEqual(Option.none());
  });

  test("an album's tile on their shelf holds their page until the album arrives, as any shelf's does", () => {
    const chosen = update(onArtist, clickedLink(albumPath(album.id)));

    expect(chosen.model.route).toEqual(artistRoute);
    expect(chosen.model.awaiting).toMatchObject({
      _tag: "Intention",
      route: AppRoute.Album({ albumId: album.id }),
    });
    expect(names(chosen)).toEqual(["AlbumDetail"]);
  });

  test("behind an album chosen from their shelf, the artist stays in the document, and comes back with the focus on the album's tile", () => {
    expect(onAlbumFromArtist.route).toEqual(AppRoute.Album({ albumId: album.id }));
    expect(maybeArtistIdInDocument(onAlbumFromArtist.route, onAlbumFromArtist.trail)).toEqual(
      Option.some(artist.id),
    );

    const back = update(onAlbumFromArtist, changedUrl(artistPath(artist.id)));
    expect(back.model.route).toEqual(artistRoute);
    expect(asked(back)).toContainEqual([
      "FocusAlbumTile",
      { pageId: PAGE_IDS.Artist, albumId: album.id },
    ]);
  });

  test("an album asked from one of their rows comes back to that row", () => {
    const onAlbumFromRow = answered(
      after(onArtist, choseFromRow("Artist", track.id, "OpenAlbum")),
      reply.album,
      albumPath(album.id),
    );
    expect(onAlbumFromRow.route).toEqual(AppRoute.Album({ albumId: album.id }));

    const back = update(onAlbumFromRow, changedUrl(artistPath(artist.id)));
    expect(asked(back)).toContainEqual([
      "FocusTrackRow",
      { pageId: PAGE_IDS.Artist, trackId: track.id },
    ]);
  });

  test("behind a song opened from one of their rows, too, and the focus comes back to the row", () => {
    expect(maybeArtistIdInDocument(onSongFromArtist.route, onSongFromArtist.trail)).toEqual(
      Option.some(artist.id),
    );

    const back = update(onSongFromArtist, changedUrl(artistPath(artist.id)));
    expect(back.model.route).toEqual(artistRoute);
    expect(asked(back)).toContainEqual([
      "FocusTrackRow",
      { pageId: PAGE_IDS.Artist, trackId: track.id },
    ]);
  });

  test("two pages on, the artist and the album between are both kept", () => {
    const onSongFromAlbum = answered(
      after(onAlbumFromArtist, choseFromRow("Album", track.id, "OpenSong")),
      reply.track,
      trackPath(track.id),
    );

    expect(maybeArtistIdInDocument(onSongFromAlbum.route, onSongFromAlbum.trail)).toEqual(
      Option.some(artist.id),
    );
    expect(maybeAlbumIdInDocument(onSongFromAlbum.route, onSongFromAlbum.trail)).toEqual(
      Option.some(album.id),
    );
  });

  test("an artist left for good is in the document no longer", () => {
    const backOnHome = after(onArtist, changedUrl("/"));
    expect(maybeArtistIdInDocument(backOnHome.route, backOnHome.trail)).toEqual(Option.none());
  });

  test("another artist chosen takes the one place there is", () => {
    const other = ArtistId.make("ar-9");
    const onOther = answered(
      chose(after(onAlbumFromArtist, clickedLink("/")), artistPath(other)),
      (id) => reply.artist(id, { ...fullArtist, id: other }),
      artistPath(other),
    );
    expect(maybeArtistIdInDocument(onOther.route, onOther.trail)).toEqual(Option.some(other));
  });
});
