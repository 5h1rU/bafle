import * as Option from "effect/Option";
import { Update } from "foldkit";
import { modifyFields } from "foldkit/struct";
import * as Marquee from "../../marquee/index.ts";
import { ChangeLightPace } from "./command.ts";
import { Message } from "./message.ts";
import { type Model, type Sound, lightAfter } from "./model.ts";

// UPDATE

type UpdateReturn = Update.Return<Model, Message>;

const titleFold = {
  read: (model: Model) => Option.some(model.title),
  write: (model: Model, nextTitle: Marquee.Model): Model =>
    nextTitle === model.title ? model : modifyFields(model, { title: () => nextTitle }),
  toParentMessage: (message: Marquee.Message): Message => Message.GotTitleMessage({ message }),
};

const artistFold = {
  read: (model: Model) => Option.some(model.artist),
  write: (model: Model, nextArtist: Marquee.Model): Model =>
    nextArtist === model.artist ? model : modifyFields(model, { artist: () => nextArtist }),
  toParentMessage: (message: Marquee.Message): Message => Message.GotArtistMessage({ message }),
};

const foldTitle = Update.foldChild({ update: Marquee.update, ...titleFold });
const foldArtist = Update.foldChild({ update: Marquee.update, ...artistFold });
const foldTitleRestart = Update.foldChildStep({ update: Marquee.restart, ...titleFold });
const foldArtistRestart = Update.foldChildStep({ update: Marquee.restart, ...artistFold });

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    GotTitleMessage: ({ message }) => foldTitle(model, message),
    GotArtistMessage: ({ message }) => foldArtist(model, message),
    CompletedDrawFigure: () => ({ model }),
    CompletedFollowPress: () => ({ model }),
    CompletedStartLight: () => ({ model }),
    CompletedChangeLightPace: () => ({ model }),
  });

/**
 * The island is told what the sound is doing, by whoever knows. Its light
 * follows: it never starts or stops at once, so what changes here is what
 * the light is to do, and the document is told to bring its pace there.
 */
// NOTE: the light's change of pace is the document's side of the Model's
// change of mind, so it is a Command given here, where the Model changes,
// and not a Subscription watching the Model for it.
export const informSound = (model: Model, sound: Sound): UpdateReturn => {
  const light = lightAfter(model.light, sound);

  return light === model.light
    ? { model }
    : {
        model: modifyFields(model, { light: () => light }),
        commands: [ChangeLightPace({ pace: light === "Travelling" ? 1 : 0 })],
      };
};

/**
 * Another track has become the one the island shows: its words are other
 * words, and each line stands still again.
 */
export const informTrackChanged = (model: Model): UpdateReturn =>
  Update.combine(model, [foldTitleRestart, foldArtistRestart]);
