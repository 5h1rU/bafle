import type { RadioStations } from "@bafle/domain/Catalog/MusicCatalog.external";
import type { StationGroup } from "@bafle/domain/Catalog/Station";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "../message.ts";
import type { StationListData } from "../model.ts";
import {
  PAGE_SECTIONS_CLASS,
  type Presence,
  QUIET_LINE_CLASS,
  pageAttributes,
  PAGE_IDS,
  pageTitleView,
} from "../view/layout.ts";
import { pageDataView } from "../view/pageData.ts";
import { untitledShelfPlaceholderView } from "../view/placeholder.ts";
import {
  type IsStationOpening,
  maybeShelfView,
  type ShelfPlace,
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
  isStationOpening: IsStationOpening,
  h: HtmlBuilder<Message>,
): Option.Option<Html> =>
  Option.map(
    maybeShelfView(
      groupTitleId(group),
      group.genre.name,
      "Square",
      Array.map(group.stations, stationTile(isStationOpening, presence)),
      h,
      place,
    ),
    (shelf) => h.keyed("div")(group.genre.id, [], [shelf]),
  );

const groupsView = (
  radio: RadioStations,
  presence: Presence,
  isStationOpening: IsStationOpening,
  h: HtmlBuilder<Message>,
): Html =>
  Array.match(
    Array.getSomes(
      // The first genre's shelf is what the page opens with.
      Array.map(radio.groups, (group, index) =>
        maybeGroupView(group, index === 0 ? "AtHead" : "Below", presence, isStationOpening, h),
      ),
    ),
    {
      onEmpty: () => h.p([h.Class(QUIET_LINE_CLASS)], ["The catalog has no stations right now."]),
      onNonEmpty: (shelves) => h.div([h.Class(PAGE_SECTIONS_CLASS)], shelves),
    },
  );

export const view = (
  stationList: StationListData,
  presence: Presence,
  isStationOpening: IsStationOpening,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(pageAttributes(PAGE_ID, presence, h), [
    pageTitleView(PAGE_ID, TITLE, h),
    h.div(
      [h.AriaBusy(AsyncData.isPending(stationList))],
      [
        pageDataView(
          stationList,
          TITLE,
          () => placeholderView(h),
          (radio) => groupsView(radio, presence, isStationOpening, h),
          h,
        ),
      ],
    ),
  ]);
