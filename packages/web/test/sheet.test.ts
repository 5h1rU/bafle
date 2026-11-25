import { describe, expect, test } from "vitest";
import {
  contentStyles,
  endMarkStyles,
  followsSwipeStyles,
  overlayStyles,
  scrollerStyles,
  sheetStyles,
  stageStyles,
  startMarkStyles,
  stopStyles,
  stopsStyles,
  swipeOf,
  timelineName,
} from "../src/sheet/geometry.ts";
import * as Sheet from "../src/sheet/index.ts";

const { Message, OutMessage } = Sheet;

describe("how a sheet is swiped", () => {
  test("one that leaves by the foot or the right is whole a screen into the scroll, and gone at its start", () => {
    (["Bottom", "Right"] as const).forEach((edge) => {
      const swipe = swipeOf(edge);
      expect(swipe.leavesByEnd).toBe(true);
      expect(swipe.wholeAt).toBe(1);
      expect(swipe.goneAt).toBe(0);
      // The box starts where its place does: the place sees its first screen.
      expect(swipe.boxStartsAt).toBe(0);
    });
  });

  test("one that leaves by the top or the left is whole where the scroll starts, so its box is set a screen back", () => {
    (["Top", "Left"] as const).forEach((edge) => {
      const swipe = swipeOf(edge);
      expect(swipe.leavesByEnd).toBe(false);
      expect(swipe.wholeAt).toBe(0);
      expect(swipe.goneAt).toBe(1);
      expect(swipe.boxStartsAt).toBe(-1);
    });
  });

  test("the foot and the top are swiped down the page, the sides across it", () => {
    expect(swipeOf("Bottom").axis).toBe("y");
    expect(swipeOf("Top").axis).toBe("y");
    expect(swipeOf("Left").axis).toBe("x");
    expect(swipeOf("Right").axis).toBe("x");
  });
});

describe("the box a sheet is swiped in", () => {
  const bottom = swipeOf("Bottom");

  test("the piece the sheet is drawn in is the measure of a screen, and clips what is beyond it", () => {
    expect(overlayStyles("player")).toMatchObject({
      containerType: "size",
      overflow: "clip",
      // Where the timeline is made known, for the backdrop beside the sheet.
      timelineScope: "--sheet-player",
    });
  });

  test("the box is two screens along the swipe and one across, and snaps along it", () => {
    expect(scrollerStyles(bottom)).toMatchObject({
      top: "0cqh",
      height: "200cqh",
      width: "100cqw",
      overflowY: "auto",
      overflowX: "hidden",
      scrollSnapType: "y mandatory",
      overscrollBehaviorY: "contain",
    });
    expect(scrollerStyles(swipeOf("Left"))).toMatchObject({
      left: "-100cqw",
      width: "200cqw",
      height: "100cqh",
      overflowX: "auto",
      scrollSnapType: "x mandatory",
    });
  });

  test("its content is three screens: a mark at the start, the stage a screen in, a mark at the end", () => {
    // So the box can scroll by exactly one screen, and its two ends are the sheet's two places.
    expect(startMarkStyles(bottom)).toMatchObject({ top: "0cqh", height: "100cqh", scrollSnapAlign: "start" });
    expect(stageStyles("Bottom")).toMatchObject({ top: "100cqh", height: "100cqh", width: "100cqw" });
    expect(endMarkStyles(bottom)).toMatchObject({ top: "200cqh", height: "100cqh", scrollSnapAlign: "end" });
  });

  test("the sheet stands at its edge of the stage", () => {
    expect(stageStyles("Bottom")).toMatchObject({ flexDirection: "column", justifyContent: "flex-end" });
    expect(stageStyles("Top")).toMatchObject({ flexDirection: "column", justifyContent: "flex-start" });
    expect(stageStyles("Left")).toMatchObject({ flexDirection: "row", justifyContent: "flex-start" });
    expect(stageStyles("Right")).toMatchObject({ flexDirection: "row", justifyContent: "flex-end" });
  });

  test("a sheet that continues past its edge is a screen longer there, and set back by as much", () => {
    expect(sheetStyles("Bottom", true)).toEqual({
      position: "relative",
      paddingBottom: "100cqh",
      marginBottom: "-100cqh",
    });
    expect(sheetStyles("Left", true)).toMatchObject({ paddingLeft: "100cqw", marginLeft: "-100cqw" });
    expect(sheetStyles("Bottom", false)).toEqual({ position: "relative" });
  });

  test("the timeline follows what is in the sheet, and looks only at the screen that is seen", () => {
    expect(contentStyles("player", bottom)).toMatchObject({
      viewTimelineName: timelineName("player"),
      viewTimelineAxis: "y",
      // The far screen of the box is left out.
      viewTimelineInset: "0px 100cqh",
    });
    expect(contentStyles("player", swipeOf("Top")).viewTimelineInset).toBe("100cqh 0px");
  });
});

describe("a sheet's stops", () => {
  test("a stop is a mark in the sheet, as far in as the sheet is then seen, that snaps a screen from the start of the box", () => {
    expect(stopStyles("280px", swipeOf("Bottom"))).toMatchObject({
      top: "280px",
      scrollMarginTop: "100cqh",
      scrollSnapAlign: "start",
    });
    expect(stopStyles("50%", swipeOf("Top"))).toMatchObject({
      bottom: "50%",
      scrollMarginBottom: "100cqh",
      scrollSnapAlign: "end",
    });
    expect(stopStyles("20rem", swipeOf("Right"))).toMatchObject({
      left: "20rem",
      scrollMarginLeft: "100cqw",
    });
  });

  test("they are placed in the sheet as it is seen, without the length it has past its edge", () => {
    expect(stopsStyles("Bottom", true)).toMatchObject({ inset: "0", bottom: "100cqh" });
    expect(stopsStyles("Bottom", false)).not.toHaveProperty("bottom");
  });
});

describe("what follows the swipe", () => {
  test("keyframes are played by the sheet's timeline, from gone to whole, over the sheet's whole way", () => {
    expect(followsSwipeStyles("player", swipeOf("Bottom"), "sheet-backdrop")).toMatchObject({
      animationName: "sheet-backdrop",
      animationTimeline: "--sheet-player",
      animationDirection: "normal",
      animationRange: "entry 0% entry 100%",
      animationFillMode: "both",
      animationTimingFunction: "linear",
    });
  });

  test("a sheet that leaves by the start crosses the other edge, so the same keyframes run backwards", () => {
    expect(followsSwipeStyles("player", swipeOf("Top"), "sheet-backdrop")).toMatchObject({
      animationDirection: "reverse",
      animationRange: "exit calc(100% - 100%) exit calc(100% - 0%)",
    });
  });

  test("between two stops, they follow only that part of the way", () => {
    const stops = ["280px", "70%"];
    // From the last stop on: nothing until the sheet is past it.
    expect(
      followsSwipeStyles("player", swipeOf("Bottom"), "sheet-backdrop", stops, { from: 1 })
        .animationRange,
    ).toBe("entry 70% entry 100%");
    expect(
      followsSwipeStyles("player", swipeOf("Bottom"), "sheet-backdrop", stops, { from: 0, to: 1 })
        .animationRange,
    ).toBe("entry 280px entry 70%");
  });
});

describe("a sheet's Model", () => {
  const sliding = Sheet.init({ id: "cart" });
  const atRest = Sheet.init({ id: "player", entrance: "AtRest" });

  test("a sheet stands at the foot unless told otherwise, and slides in", () => {
    expect(sliding).toEqual({
      id: "cart", edge: "Bottom", entrance: "Slides", reach: "Gone", dismissedByKeyboard: false,
    });
  });

  test("one brought on screen some other way is whole from the start", () => {
    expect(atRest.reach).toBe("Whole");
  });

  test("the document's word on how much of it is on screen is kept, and is nothing to its owner", () => {
    const partly = Sheet.update(atRest, Message.ChangedReach({ reach: "Partly" }));
    expect(partly.model.reach).toBe("Partly");
    expect(partly.outMessage).toBeUndefined();
    const whole = Sheet.update(partly.model, Message.ChangedReach({ reach: "Whole" }));
    expect(whole.model.reach).toBe("Whole");
    expect(whole.outMessage).toBeUndefined();
  });

  test("a word that changes nothing leaves the Model the very one it was", () => {
    expect(Sheet.update(atRest, Message.ChangedReach({ reach: "Whole" })).model).toBe(atRest);
  });

  test("off the screen, it tells its owner that it has left", () => {
    const partly = Sheet.update(atRest, Message.ChangedReach({ reach: "Partly" })).model;
    const gone = Sheet.update(partly, Message.ChangedReach({ reach: "Gone" }));
    expect(gone.model.reach).toBe("Gone");
    expect(gone.outMessage).toEqual(OutMessage.Left());
    // Said once: the same word again is no news.
    expect(Sheet.update(gone.model, Message.ChangedReach({ reach: "Gone" })).outMessage).toBeUndefined();
  });

  test("let go of on its way off the screen, it says so while part of it is still there, for its owner to take it from where it is", () => {
    const partly = Sheet.update(atRest, Message.ChangedReach({ reach: "Partly" })).model;
    const letGo = Sheet.update(partly, Message.LetGo());
    expect(letGo.model).toBe(partly);
    expect(letGo.outMessage).toEqual(OutMessage.Leaving());
    // A sheet that is whole was not on its way, and of one that is gone `Left` has been said.
    expect(Sheet.update(atRest, Message.LetGo()).outMessage).toBeUndefined();
    const gone = Sheet.update(partly, Message.ChangedReach({ reach: "Gone" })).model;
    expect(Sheet.update(gone, Message.LetGo()).outMessage).toBeUndefined();
  });

  test("Escape and its close control ask its owner for it to go, and move nothing", () => {
    [Message.PressedEscape(), Message.ClickedClose()].forEach((message) => {
      const asked = Sheet.update(atRest, message);
      expect(asked.model.reach).toBe("Whole");
      expect(asked.model.dismissedByKeyboard).toBe(message._tag === "PressedEscape");
      expect(asked.outMessage).toEqual(OutMessage.RequestedClose());
      expect(asked.commands ?? []).toEqual([]);
    });
  });

  test("holding Escape issues a single close request", () => {
    const asked = Sheet.update(atRest, Message.PressedEscape());
    expect(Sheet.update(asked.model, Message.PressedEscape()).outMessage).toBeUndefined();
  });

  test("its owner sends it away by its edge, and hears that it left as of one swiped away", () => {
    const top = Sheet.init({ id: "banner", edge: "Top" });
    const leaving = Sheet.leave(top);
    expect(leaving.model).toBe(top);
    expect((leaving.commands ?? []).map((command) => [command.name, command.args])).toEqual([
      ["SlideAway", { id: "banner", edge: "Top" }],
    ]);
    expect(Sheet.update(top, Message.CompletedSlideAway()).model).toBe(top);
  });
});
