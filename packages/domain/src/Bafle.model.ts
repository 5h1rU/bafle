import * as Domain from "@alchemy.run/domain";
import * as Layer from "effect/Layer";
import { AlbumDetail, AlbumDetailLive } from "./Catalog/AlbumDetail.query.ts";
import { ArtistDetail, ArtistDetailLive } from "./Catalog/ArtistDetail.query.ts";
import { CatalogSearch, CatalogSearchLive } from "./Catalog/CatalogSearch.query.ts";
import { GenreDetail, GenreDetailLive } from "./Catalog/GenreDetail.query.ts";
import { GenreList, GenreListLive } from "./Catalog/GenreList.query.ts";
import { HomeFeed, HomeFeedLive } from "./Catalog/HomeFeed.query.ts";
import { NewMusic, NewMusicLive } from "./Catalog/NewMusic.query.ts";
import { PlaylistDetail, PlaylistDetailLive } from "./Catalog/PlaylistDetail.query.ts";
import { StationDetail, StationDetailLive } from "./Catalog/StationDetail.query.ts";
import { StationList, StationListLive } from "./Catalog/StationList.query.ts";
import { TrackDetail, TrackDetailLive } from "./Catalog/TrackDetail.query.ts";

/**
 * Bafle, a music player. So far a listener only browses and searches the
 * catalog, so the model has questions to answer and nothing to record yet:
 * aggregates arrive with the first thing a listener changes (a queue, a library).
 */
export class Bafle extends Domain.Model("Bafle", {
  aggregates: [],
  queries: [
    HomeFeed,
    NewMusic,
    CatalogSearch,
    TrackDetail,
    AlbumDetail,
    ArtistDetail,
    PlaylistDetail,
    GenreList,
    GenreDetail,
    StationList,
    StationDetail,
  ],
}) {}

/** Every query's implementation. They require the MusicCatalog external system. */
export const BafleHandlers = Layer.mergeAll(
  HomeFeedLive,
  NewMusicLive,
  CatalogSearchLive,
  TrackDetailLive,
  AlbumDetailLive,
  ArtistDetailLive,
  PlaylistDetailLive,
  GenreListLive,
  GenreDetailLive,
  StationListLive,
  StationDetailLive,
);
