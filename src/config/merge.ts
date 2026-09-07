/** A JSON-like object with string keys. */
export type PlainObject = Record<string, unknown>;

/**
 * Recursively merge `override` onto `base`, returning a new object.
 *
 * Plain-object values are merged key by key; every other value — including
 * arrays and scalars — is replaced wholesale by the override. Neither input is
 * mutated. This is the semantics repo configs rely on to add a single rule
 * without re-declaring the whole studio baseline.
 */
export function deepMerge<T extends PlainObject>(
  base: T,
  override: PlainObject,
): T {
  const result: PlainObject = { ...base };
  for (const [key, overrideValue] of Object.entries(override)) {
    const baseValue = result[key];
    result[key] =
      isPlainObject(baseValue) && isPlainObject(overrideValue)
        ? deepMerge(baseValue, overrideValue)
        : overrideValue;
  }
  return result as T;
}

/** Whether a value is a plain object (not an array, not null, not a class). */
export function isPlainObject(value: unknown): value is PlainObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
