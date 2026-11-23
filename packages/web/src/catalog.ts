import type * as Domain from "@alchemy.run/domain";
import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import type { Track } from "@bafle/domain/Catalog/Track";
import { ListenerApi } from "@bafle/domain/ListenerApi.api";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

/** The Api's four queries as Commands, with the Messages their replies arrive as. */
export const Catalog = DomainFoldkit.make(ListenerApi);

/** What a Command that asks the catalog needs from the runtime: the Api client. */
export type CatalogClient = Domain.Api.ClientKey<"ListenerApi">;

/**
 * Why a page has nothing new to show. `CatalogUnavailable` is the Api's own
 * refusal; `Unreachable` is everything on the way to the Api. Asking again can
 * work in both cases, so the app treats them alike and only words them apart.
 */
export const LoadError = Schema.Literals(["CatalogUnavailable", "Unreachable"]);
export type LoadError = typeof LoadError.Type;

/** How a query for a list page can fail, as its reply Message carries it: the three fail alike. */
type ListFailure = (typeof Catalog.Message.FailedHomeFeed.Type)["failure"];

type TrackFailure = (typeof Catalog.Message.FailedTrackDetail.Type)["failure"];

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
