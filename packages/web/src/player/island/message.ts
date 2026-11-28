import { defineMessageUnion } from "foldkit/message";
import * as Marquee from "../../marquee/index.ts";

// MESSAGE

export const Message = defineMessageUnion({
  /** The track's title, a line of its own. */
  GotTitleMessage: { message: Marquee.Message },
  /** Who the track is by, the line under the title. */
  GotArtistMessage: { message: Marquee.Message },
  CompletedDrawFigure: {},
  CompletedFollowPress: {},
  CompletedStartLight: {},
  CompletedChangeLightPace: {},
});
export type Message = typeof Message.Type;
