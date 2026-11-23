import * as Domain from "@alchemy.run/domain";
import { Bafle } from "./Bafle.model.ts";

/** What the player app reaches: the three pages a listener browses. */
export class ListenerApi extends Domain.Api(
  "ListenerApi",
  { model: Bafle, queries: ["HomeFeed", "NewMusic", "CatalogSearch"] },
  { description: "Browse and search the music catalog." },
) {}
