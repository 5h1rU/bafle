import * as Domain from "@alchemy.run/domain";
import * as Effect from "effect/Effect";
import { AlbumId } from "./Album.ts";
import { AlbumNotFound } from "./AlbumNotFound.rejection.ts";
import { CatalogUnavailable } from "./CatalogUnavailable.rejection.ts";
import { Album } from "./FullAlbum.ts";
import { MusicCatalog } from "./MusicCatalog.external.ts";

/** The page of one album: the record a listener opened, with its tracks. */
export class AlbumDetail extends Domain.Query(
  "AlbumDetail",
  {
    input: { albumId: AlbumId },
    success: Album,
    rejects: [AlbumNotFound, CatalogUnavailable],
  },
  { description: "One album in full: its artist, cover, release date and tracks in order." },
) {}

/** Asks the catalog. Anyone may read it. */
export const AlbumDetailLive = AlbumDetail.toLayer(
  Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    return ({ albumId }) =>
      catalog.album({ albumId }).pipe(
        // A missing album and a catalog that cannot answer call for different
        // things from the listener, so they stay apart all the way to the app.
        Effect.mapError((refusal) =>
          refusal._tag === "AlbumNotFound"
            ? new AlbumNotFound({ albumId: refusal.albumId })
            : new CatalogUnavailable(),
        ),
      );
  }),
);
