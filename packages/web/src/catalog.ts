import type * as Domain from "@alchemy.run/domain";
import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import type { Album } from "@bafle/domain/Catalog/FullAlbum";
import type { Artist } from "@bafle/domain/Catalog/FullArtist";
import type { Genre } from "@bafle/domain/Catalog/FullGenre";
import type { Playlist } from "@bafle/domain/Catalog/FullPlaylist";
import type { Station } from "@bafle/domain/Catalog/FullStation";
import type { Track } from "@bafle/domain/Catalog/Track";
import { ListenerApi } from "@bafle/domain/ListenerApi.api";
import * as Duration from "effect/Duration";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

/** The Api's queries as Commands, with the Messages their replies arrive as. */
export const Catalog = DomainFoldkit.make(ListenerApi);

/** What a Command that asks the catalog needs from the runtime: the Api client. */
export type CatalogClient = Domain.Api.ClientKey<"ListenerApi">;

/** How long a query may go unanswered before it counts as failed. */
export const REPLY_TIMEOUT = Duration.seconds(10);

/**
 * Why a page has nothing new to show. `CatalogUnavailable` is the Api's own
 * refusal; `Unreachable` is everything on the way to the Api. Asking again can
 * work in both cases, so the app treats them alike and only words them apart.
 */
export const LoadError = Schema.Literals(["CatalogUnavailable", "Unreachable"]);
export type LoadError = typeof LoadError.Type;

/** The failure of a query that nobody answered: what a lost reply is reported as. */
const UNANSWERED: Readonly<{ _tag: "Unknown" }> = { _tag: "Unknown" };

/**
 * What each query settles as when nobody answers it in time. It is the
 * catalog's own reply for it, a failure, so nothing waits for ever on a
 * server that hangs: only the catalog says what its replies are.
 */
export const unanswered = {
  HomeFeed: (requestId: string) =>
    Catalog.Message.FailedHomeFeed({ requestId, failure: UNANSWERED }),
  NewMusic: (requestId: string) =>
    Catalog.Message.FailedNewMusic({ requestId, failure: UNANSWERED }),
  GenreList: (requestId: string) =>
    Catalog.Message.FailedGenreList({ requestId, failure: UNANSWERED }),
  StationList: (requestId: string) =>
    Catalog.Message.FailedStationList({ requestId, failure: UNANSWERED }),
  CatalogSearch: (requestId: string) =>
    Catalog.Message.FailedCatalogSearch({ requestId, failure: UNANSWERED }),
  TrackDetail: (requestId: string) =>
    Catalog.Message.FailedTrackDetail({ requestId, failure: UNANSWERED }),
  AlbumDetail: (requestId: string) =>
    Catalog.Message.FailedAlbumDetail({ requestId, failure: UNANSWERED }),
  ArtistDetail: (requestId: string) =>
    Catalog.Message.FailedArtistDetail({ requestId, failure: UNANSWERED }),
  PlaylistDetail: (requestId: string) =>
    Catalog.Message.FailedPlaylistDetail({ requestId, failure: UNANSWERED }),
  GenreDetail: (requestId: string) =>
    Catalog.Message.FailedGenreDetail({ requestId, failure: UNANSWERED }),
  StationDetail: (requestId: string) =>
    Catalog.Message.FailedStationDetail({ requestId, failure: UNANSWERED }),
};

/** How a query for a list page can fail, as its reply Message carries it: they all fail alike. */
type ListFailure = (typeof Catalog.Message.FailedHomeFeed.Type)["failure"];

type TrackFailure = (typeof Catalog.Message.FailedTrackDetail.Type)["failure"];

type AlbumFailure = (typeof Catalog.Message.FailedAlbumDetail.Type)["failure"];

type ArtistFailure = (typeof Catalog.Message.FailedArtistDetail.Type)["failure"];

type PlaylistFailure = (typeof Catalog.Message.FailedPlaylistDetail.Type)["failure"];

type GenreFailure = (typeof Catalog.Message.FailedGenreDetail.Type)["failure"];

type StationFailure = (typeof Catalog.Message.FailedStationDetail.Type)["failure"];

export const toLoadError = (failure: ListFailure): LoadError =>
  Match.value(failure).pipe(
    Match.withReturnType<LoadError>(),
    Match.tagsExhaustive({
      // The rejection's own tag: a second kind of rejection in the Api stops compiling here.
      Rejected: ({ rejection }) => rejection._tag,
      Denied: () => "Unreachable",
      Unknown: () => "Unreachable",
    }),
  );

/**
 * What a failed query for a track settles as. That the catalog has no such
 * track is an answer, and a final one: it is held like any other answer, as
 * the absence of a track, and only a failure to answer is a `LoadError`.
 */
export const toTrackOutcome = (
  failure: TrackFailure,
): Result.Result<Option.Option<Track>, LoadError> =>
  Match.value(failure).pipe(
    Match.withReturnType<Result.Result<Option.Option<Track>, LoadError>>(),
    Match.tagsExhaustive({
      Rejected: ({ rejection }) =>
        rejection._tag === "TrackNotFound"
          ? Result.succeed(Option.none())
          : Result.fail(rejection._tag),
      Denied: () => Result.fail("Unreachable"),
      Unknown: () => Result.fail("Unreachable"),
    }),
  );

/** What a failed query for an album settles as: as for a track, its absence is an answer. */
export const toAlbumOutcome = (
  failure: AlbumFailure,
): Result.Result<Option.Option<Album>, LoadError> =>
  Match.value(failure).pipe(
    Match.withReturnType<Result.Result<Option.Option<Album>, LoadError>>(),
    Match.tagsExhaustive({
      Rejected: ({ rejection }) =>
        rejection._tag === "AlbumNotFound"
          ? Result.succeed(Option.none())
          : Result.fail(rejection._tag),
      Denied: () => Result.fail("Unreachable"),
      Unknown: () => Result.fail("Unreachable"),
    }),
  );

/** What a failed query for an artist settles as: as for a track, their absence is an answer. */
export const toArtistOutcome = (
  failure: ArtistFailure,
): Result.Result<Option.Option<Artist>, LoadError> =>
  Match.value(failure).pipe(
    Match.withReturnType<Result.Result<Option.Option<Artist>, LoadError>>(),
    Match.tagsExhaustive({
      Rejected: ({ rejection }) =>
        rejection._tag === "ArtistNotFound"
          ? Result.succeed(Option.none())
          : Result.fail(rejection._tag),
      Denied: () => Result.fail("Unreachable"),
      Unknown: () => Result.fail("Unreachable"),
    }),
  );

/** What a failed query for a playlist settles as: as for a track, its absence is an answer. */
export const toPlaylistOutcome = (
  failure: PlaylistFailure,
): Result.Result<Option.Option<Playlist>, LoadError> =>
  Match.value(failure).pipe(
    Match.withReturnType<Result.Result<Option.Option<Playlist>, LoadError>>(),
    Match.tagsExhaustive({
      Rejected: ({ rejection }) =>
        rejection._tag === "PlaylistNotFound"
          ? Result.succeed(Option.none())
          : Result.fail(rejection._tag),
      Denied: () => Result.fail("Unreachable"),
      Unknown: () => Result.fail("Unreachable"),
    }),
  );

/** What a failed query for a genre settles as: as for a track, its absence is an answer. */
export const toGenreOutcome = (
  failure: GenreFailure,
): Result.Result<Option.Option<Genre>, LoadError> =>
  Match.value(failure).pipe(
    Match.withReturnType<Result.Result<Option.Option<Genre>, LoadError>>(),
    Match.tagsExhaustive({
      Rejected: ({ rejection }) =>
        rejection._tag === "GenreNotFound"
          ? Result.succeed(Option.none())
          : Result.fail(rejection._tag),
      Denied: () => Result.fail("Unreachable"),
      Unknown: () => Result.fail("Unreachable"),
    }),
  );

/** What a failed query for a station settles as: as for a track, its absence is an answer. */
export const toStationOutcome = (
  failure: StationFailure,
): Result.Result<Option.Option<Station>, LoadError> =>
  Match.value(failure).pipe(
    Match.withReturnType<Result.Result<Option.Option<Station>, LoadError>>(),
    Match.tagsExhaustive({
      Rejected: ({ rejection }) =>
        rejection._tag === "StationNotFound"
          ? Result.succeed(Option.none())
          : Result.fail(rejection._tag),
      Denied: () => Result.fail("Unreachable"),
      Unknown: () => Result.fail("Unreachable"),
    }),
  );
