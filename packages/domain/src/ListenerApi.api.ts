import * as Domain from "@alchemy.run/domain";
import { Bafle } from "./Bafle.model.ts";

/** What the player app reaches: the pages a listener browses, and the track, the album, the artist, the playlist, the genre or the station they open. */
export class ListenerApi extends Domain.Api(
  "ListenerApi",
  {
    model: Bafle,
    queries: [
      "HomeFeed",
      "NewMusic",
      "CatalogSearch",
      "TrackDetail",
      "AlbumDetail",
      "ArtistDetail",
      "PlaylistDetail",
      "GenreList",
      "GenreDetail",
      "StationList",
      "StationDetail",
    ],
  },
  { description: "Browse and search the music catalog." },
) {}
