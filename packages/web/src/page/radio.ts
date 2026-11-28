import type { RadioStations } from "@bafle/domain/Catalog/MusicCatalog.external";
import type { StationGroup } from "@bafle/domain/Catalog/Station";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "../message.ts";
import type { StationListData } from "../model.ts";
import { PAGE_IDS, PAGE_SECTIONS_CLASS, type Presence } from "../view/layout.ts";
import { sectionPageView, sectionsView } from "../view/page.ts";
import { SHELVES_AT_HEAD } from "../view/firstPictures.ts";
import { untitledShelfPlaceholderView } from "../view/placeholder.ts";
import {
  type ShelfPlace,
  type StationTileState,
  maybeShelfView,
  stationTile,
} from "../view/shelf.ts";

// VIEW

const PAGE_ID = PAGE_IDS.Radio;
const TITLE = "Radio";

const PLACEHOLDER_SHELVES = 3;

/**
 * Radio before the catalog has answered: shelves of blocks, each under a
 * block for its title, since which genres have stations is the catalog's to say.
 */
const placeholderView = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class(PAGE_SECTIONS_CLASS)],
    Array.makeBy(PLACEHOLDER_SHELVES, () => untitledShelfPlaceholderView("Square", h)),
  );

/** The id of a group's title: what names its shelf. */
const groupTitleId = (group: StationGroup): string => `radio-genre-${group.genre.id}`;

/** One genre's stations: a shelf under the genre's name, each tile leading to its station's page. */
const maybeGroupView = (
  group: StationGroup,
  place: ShelfPlace,
  presence: Presence,
  stationState: StationTileState,
  h: HtmlBuilder<Message>,
): Option.Option<Html> =>
  Option.map(
    maybeShelfView(
      groupTitleId(group),
      group.genre.name,
      "Square",
      Array.map(group.stations, stationTile(stationState, presence)),
      h,
      place,
    ),
    (shelf) => h.keyed("div")(group.genre.id, [], [shelf]),
  );

const groupsView = (
  radio: RadioStations,
  presence: Presence,
  stationState: StationTileState,
  h: HtmlBuilder<Message>,
): Html =>
  sectionsView(
    // The first genres' shelves are what the page opens with.
    Array.map(radio.groups, (group, index) =>
      maybeGroupView(
        group,
        index < SHELVES_AT_HEAD ? "AtHead" : "Below",
        presence,
        stationState,
        h,
      ),
    ),
    "The catalog has no stations right now.",
    h,
  );

export const view = (
  stationList: StationListData,
  presence: Presence,
  stationState: StationTileState,
  h: HtmlBuilder<Message>,
): Html =>
  sectionPageView(
    { pageId: PAGE_ID, title: TITLE, presence, data: stationList },
    () => placeholderView(h),
    (radio) => groupsView(radio, presence, stationState, h),
    h,
  );
