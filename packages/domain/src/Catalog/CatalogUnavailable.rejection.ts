import * as Domain from "@alchemy.run/domain";

/**
 * The catalog could not answer: its provider is down, slow, or refusing
 * requests. Nothing is wrong with the question, so asking again later can work.
 */
export class CatalogUnavailable extends Domain.Rejection(
  "CatalogUnavailable",
  {},
  { httpApiStatus: 503 },
) {}

/**
 * Refuse a query because its catalog call failed. The catalog's only declared
 * failure is this one, so there is nothing to tell apart.
 */
export const catalogUnavailable = () => new CatalogUnavailable();
