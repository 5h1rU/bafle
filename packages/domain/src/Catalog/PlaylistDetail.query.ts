import * as Domain from "@alchemy.run/domain";
import * as Effect from "effect/Effect";
import { CatalogUnavailable } from "./CatalogUnavailable.rejection.ts";
import { Playlist } from "./FullPlaylist.ts";
import { MusicCatalog } from "./MusicCatalog.external.ts";
import { PlaylistId } from "./Playlist.ts";
import { PlaylistNotFound } from "./PlaylistNotFound.rejection.ts";

/** The page of one playlist: the list a listener opened, with its tracks. */
export class PlaylistDetail extends Domain.Query(
  "PlaylistDetail",
  {
    input: { playlistId: PlaylistId },
    success: Playlist,
    rejects: [PlaylistNotFound, CatalogUnavailable],
  },
  { description: "One playlist in full: its curator, picture and tracks in order." },
) {}

/** Asks the catalog. Anyone may read it. */
export const PlaylistDetailLive = PlaylistDetail.toLayer(
  Effect.gen(function* () {
    const catalog = yield* MusicCatalog;
    return ({ playlistId }) =>
      catalog.playlist({ playlistId }).pipe(
        // A missing playlist and a catalog that cannot answer call for different
        // things from the listener, so they stay apart all the way to the app.
        Effect.mapError((refusal) =>
          refusal._tag === "PlaylistNotFound"
            ? new PlaylistNotFound({ playlistId: refusal.playlistId })
            : new CatalogUnavailable(),
        ),
      );
  }),
);
