import * as Domain from "@alchemy.run/domain";
import { Bafle } from "./Bafle.model.ts";

/** What the player app reaches: the pages a listener browses, and the track they open. */
export class ListenerApi extends Domain.Api(
  "ListenerApi",
  { model: Bafle, queries: ["HomeFeed", "NewMusic", "CatalogSearch", "TrackDetail"] },
  { description: "Browse and search the music catalog." },
) {}
