import * as Domain from "@alchemy.run/domain";
import { GenreId } from "./Genre.ts";

/**
 * The catalog has no genre with this id: it was withdrawn, or the id was
 * never one of its own. Asking again will not help.
 */
export class GenreNotFound extends Domain.Rejection(
  "GenreNotFound",
  { genreId: GenreId },
  { httpApiStatus: 404 },
) {}
