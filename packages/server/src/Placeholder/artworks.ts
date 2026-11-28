import type { Artwork } from "@bafle/domain/Catalog/Artwork";

/**
 * Whether a value is one of the catalog's pictures. Every picture in a
 * reply is an `Artwork`, wherever it stands in it: a track's album's cover,
 * an artist's picture, a genre's.
 */
const isArtwork = (value: unknown): value is Artwork =>
  typeof value === "object" &&
  value !== null &&
  "small" in value &&
  "medium" in value &&
  "large" in value &&
  "placeholder" in value &&
  typeof value.small === "string";

/** Every picture in a reply, in the order the reply lists them, which is the order its page draws them. */
export const artworksIn = (value: unknown): ReadonlyArray<Artwork> => {
  if (isArtwork(value)) return [value];
  if (Array.isArray(value)) return value.flatMap(artworksIn);
  if (typeof value === "object" && value !== null) return Object.values(value).flatMap(artworksIn);
  return [];
};

/**
 * A reply with each picture given the likeness it is known by, under its
 * small rendition's address. A reply is plain data, arrays and records, so
 * it is rebuilt as it was with only its pictures changed.
 */
export const withPlaceholders = <A>(value: A, likenesses: ReadonlyMap<string, string>): A => {
  const rebuild = (part: unknown): unknown => {
    if (isArtwork(part)) {
      const likeness = likenesses.get(part.small);
      return likeness === undefined ? part : { ...part, placeholder: likeness };
    }
    if (Array.isArray(part)) return part.map(rebuild);
    if (typeof part === "object" && part !== null) {
      return Object.fromEntries(Object.entries(part).map(([key, field]) => [key, rebuild(field)]));
    }
    return part;
  };
  // NOTE: what is rebuilt has the shape of what it was built from, with only
  // a field added to each picture: that is known here and not to the compiler,
  // which sees a value walked as `unknown`.
  // oxlint-disable-next-line typescript/consistent-type-assertions
  return likenesses.size === 0 ? value : (rebuild(value) as A);
};
