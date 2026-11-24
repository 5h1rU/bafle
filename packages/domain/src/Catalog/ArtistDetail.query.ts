import * as Domain from "@alchemy.run/domain";
import * as Effect from "effect/Effect";
import { ArtistId } from "./Artist.ts";
import { ArtistNotFound } from "./ArtistNotFound.rejection.ts";
import { CatalogUnavailable } from "./CatalogUnavailable.rejection.ts";
import { Artist } from "./FullArtist.ts";
import { MusicCatalog } from "./MusicCatalog.external.ts";

/** How many of an artist's most played tracks their page lists. */
export const TOP_TRACKS = 10;

/** The page of one artist: who a listener opened, with what is played most of theirs and their albums. */
export class ArtistDetail extends Domain.Query(
  "ArtistDetail",
  {
    input: { artistId: ArtistId },
    success: Artist,
    rejects: [ArtistNotFound, CatalogUnavailable],
  },
  { description: "One artist in full: their picture, their most played tracks and their albums." },
) {}

/** Asks the catalog. Anyone may read it. */
export const ArtistDetailLive = ArtistDetail.toLayer(
  Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    return ({ artistId }) =>
      catalog.artist({ artistId, topTracks: TOP_TRACKS }).pipe(
        // A missing artist and a catalog that cannot answer call for different
        // things from the listener, so they stay apart all the way to the app.
        Effect.mapError((refusal) =>
          refusal._tag === "ArtistNotFound"
            ? new ArtistNotFound({ artistId: refusal.artistId })
            : new CatalogUnavailable(),
        ),
      );
  }),
);
