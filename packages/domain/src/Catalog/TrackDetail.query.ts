import * as Domain from "@alchemy.run/domain";
import * as Effect from "effect/Effect";
import { CatalogUnavailable } from "./CatalogUnavailable.rejection.ts";
import { MusicCatalog } from "./MusicCatalog.external.ts";
import { Track, TrackId } from "./Track.ts";
import { TrackNotFound } from "./TrackNotFound.rejection.ts";

/** The page of one track: the song a listener opened. */
export class TrackDetail extends Domain.Query(
  "TrackDetail",
  {
    input: { trackId: TrackId },
    success: Track,
    rejects: [TrackNotFound, CatalogUnavailable],
  },
  { description: "One track in full: its artists, album, length and release date." },
) {}

/** Asks the catalog. Anyone may read it. */
export const TrackDetailLive = TrackDetail.toLayer(
  Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    return ({ trackId }) =>
      catalog.track({ trackId }).pipe(
        // A missing track and a catalog that cannot answer call for different
        // things from the listener, so they stay apart all the way to the app.
        Effect.mapError((refusal) =>
          refusal._tag === "TrackNotFound"
            ? new TrackNotFound({ trackId: refusal.trackId })
            : new CatalogUnavailable(),
        ),
      );
  }),
);
