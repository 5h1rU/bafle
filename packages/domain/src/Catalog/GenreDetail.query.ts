import * as Domain from "@alchemy.run/domain";
import * as Effect from "effect/Effect";
import { CatalogUnavailable } from "./CatalogUnavailable.rejection.ts";
import { Genre } from "./FullGenre.ts";
import { GenreId } from "./Genre.ts";
import { GenreNotFound } from "./GenreNotFound.rejection.ts";
import { MusicCatalog } from "./MusicCatalog.external.ts";

/** How many of a genre's most played tracks its page lists. */
export const GENRE_TOP_TRACKS = 10;

/** The page of one genre: the genre a listener opened, with what is popular in it. */
export class GenreDetail extends Domain.Query(
  "GenreDetail",
  {
    input: { genreId: GenreId },
    success: Genre,
    rejects: [GenreNotFound, CatalogUnavailable],
  },
  {
    description:
      "One genre in full: its picture, and the tracks, albums, artists and playlists played most in it.",
  },
) {}

/** Asks the catalog. Anyone may read it. */
export const GenreDetailLive = GenreDetail.toLayer(
  Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    return ({ genreId }) =>
      catalog.genre({ genreId, topTracks: GENRE_TOP_TRACKS }).pipe(
        // A missing genre and a catalog that cannot answer call for different
        // things from the listener, so they stay apart all the way to the app.
        Effect.mapError((refusal) =>
          refusal._tag === "GenreNotFound"
            ? new GenreNotFound({ genreId: refusal.genreId })
            : new CatalogUnavailable(),
        ),
      );
  }),
);
