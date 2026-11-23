import type * as Domain from "@alchemy.run/domain";
import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { ListenerApi } from "@bafle/domain/ListenerApi.api";
import * as Match from "effect/Match";
import * as Schema from "effect/Schema";

/** The Api's three queries as Commands, with the Messages their replies arrive as. */
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

/** How any of the three queries can fail, as its reply Message carries it. */
type QueryFailure = Extract<typeof Catalog.Message.Type, { readonly failure: unknown }>["failure"];

export const toLoadError = (failure: QueryFailure): LoadError =>
  Match.value(failure).pipe(
    Match.withReturnType<LoadError>(),
    Match.tagsExhaustive({
      // The rejection's own tag: a second kind of rejection in the Api stops compiling here.
      Rejected: ({ rejection }) => rejection._tag,
      Denied: () => "Unreachable",
      Unknown: () => "Unreachable",
    }),
  );
