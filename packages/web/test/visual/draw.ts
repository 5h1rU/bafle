import { Animation, DragAndDrop, Menu, Popover, Slider } from "@foldkit/ui";
import { Runtime } from "foldkit";
import { type Command, CommandDefinitionTypeId } from "foldkit/command";
import { expect, onTestFinished } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import { update } from "../../src/main.ts";
import { Message } from "../../src/message.ts";
import { Model } from "../../src/model.ts";
import { view } from "../../src/view.ts";

import "../../src/styles.css";

// DRAWING THE APP TO LOOK AT IT

// A picture of the app is taken of the app itself: the Model a test hands
// over, drawn by the app's own view into a real browser, with the style
// sheet the app ships. Nothing here knows what a page looks like.

/** The two screens the app is laid out for: a phone's, and a desktop's, where the player does not expand. */
export const SCREENS = {
  Phone: { width: 390, height: 844 },
  Desktop: { width: 1280, height: 800 },
} as const;

export type ScreenName = keyof typeof SCREENS;

const OF_SCREEN = { Phone: "Compact", Desktop: "Desktop" } as const;

export type Scheme = "light" | "dark";

/**
 * The Commands of the components the app is built from (a menu's fading in,
 * a popover's place by its control): what they do is done in the document,
 * needs nothing the app was given, and is part of how the app looks.
 */
const COMPONENT_COMMANDS: ReadonlySet<string> = new Set(
  [Animation, DragAndDrop, Menu, Popover, Slider].flatMap((component) =>
    Object.values(component).flatMap((value) =>
      typeof value === "function" && CommandDefinitionTypeId in value ? [value.name] : [],
    ),
  ),
);

const isOfComponent = <R>(command: Command<Message, never, R>): command is Command<Message> =>
  COMPONENT_COMMANDS.has(command.name);

/**
 * What is heard of the app while its picture is taken is told to the Model,
 * and of what the Model then asks for only the components' own is done: no
 * Command of the app's runs, so no clock is started and nothing is asked of a
 * catalog that is not there. What only the document knows still reaches the
 * Model (how wide the island's title is, how much of the player's sheet is
 * on screen), since a Mount's word is a Message like any other.
 */
const hears = (model: Model, message: Message) => {
  const heard = update(model, message);

  return { model: heard.model, commands: (heard.commands ?? []).filter(isOfComponent) };
};

const frame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

/** The app's shell, once the app has drawn it: its first drawing comes a frame or more after it is started. */
const drawn = async (): Promise<HTMLElement> => {
  await expect.poll(() => document.querySelector("[data-navigation]")).not.toBeNull();
  const root = document.querySelector("[data-navigation]");
  if (!(root instanceof HTMLElement)) {
    throw new Error("The app drew nothing");
  }
  await frame();

  return root;
};

const emulate = (scheme: Scheme): Promise<unknown> =>
  cdp().send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: scheme },
      // NOTE: what moves for ever (a record turning, the bars of the track
      // that sounds) stands still for the picture, as the app draws it for
      // whoever asks for less motion.
      { name: "prefers-reduced-motion", value: "reduce" },
    ],
  });

export type Drawing = Readonly<{
  model: Model;
  screen: ScreenName;
  scheme?: Scheme;
  /** What is done to the document once the app is in it, before its picture is taken: a page scrolled, a pointer laid on a row. */
  arrange?: (root: HTMLElement) => Promise<void> | void;
}>;

/**
 * Draws the app as the Model says, on a screen of the size named, and
 * compares what is seen with the picture kept under `name`. The picture is
 * of the whole screen, with what the app draws outside its own root (a
 * menu, the song being carried).
 */
export const looksAs = async (name: string, drawing: Drawing): Promise<void> => {
  const { screen, scheme = "light", arrange } = drawing;
  const { width, height } = SCREENS[screen];
  // What the app would have been told by the window it is in.
  const model = update(drawing.model, Message.ChangedScreen({ screen: OF_SCREEN[screen] })).model;

  await page.viewport(width, height);
  await emulate(scheme);

  const container = document.createElement("div");
  container.id = "root";
  document.body.append(container);

  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      init: () => ({ model }),
      update: hears,
      view: (shown, h) => view(shown, h).body,
      container,
      devTools: false,
      slow: false,
    }),
  );
  onTestFinished(() => {
    handle.dispose();
    document.body.replaceChildren();
  });

  const root = await drawn();
  // NOTE: the pointer is one for the whole browser and stays where the test
  // before left it, over whatever is drawn there now. It is put in a corner,
  // on nothing that answers it.
  await userEvent.hover(root, { position: { x: 1, y: 1 } });
  await arrange?.(root);
  await document.fonts.ready;
  await frame();

  await expect.element(page.elementLocator(document.body)).toMatchScreenshot(name);
};

/** The page under `selector` scrolled this far down, as a listener would have left it. */
export const scrolled =
  (selector: string, top: number) =>
  (root: HTMLElement): void => {
    const page = root.querySelector(selector);
    if (page === null) {
      throw new Error(`Nothing at ${selector} to scroll`);
    }
    page.scrollTop = top;
  };

/**
 * The control called `name` pressed, as a listener would press it. What it
 * opens is opened by the app as it runs, and is in the picture once it has
 * come.
 */
export const pressed = (name: string | RegExp) => async (): Promise<void> => {
  await userEvent.click(page.getByRole("button", { name }));
};
