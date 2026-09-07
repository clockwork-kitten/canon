import { describe, expect, it } from "vitest";

import { deepMerge, isPlainObject } from "./merge.ts";

describe("isPlainObject", () => {
  it("accepts object literals", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
  });

  it("rejects arrays, null, and class instances", () => {
    expect(isPlainObject([])).toBe(false);
    // eslint-disable-next-line unicorn/no-null -- deliberately asserting null input is rejected
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject(new Date())).toBe(false);
    expect(isPlainObject("x")).toBe(false);
  });
});

describe("deepMerge", () => {
  it("adds new keys without disturbing existing ones", () => {
    expect(deepMerge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it("recurses into nested plain objects", () => {
    const base = { rules: { MD013: false, MD024: { siblings_only: true } } };
    const override = { rules: { MD013: true } };
    expect(deepMerge(base, override)).toEqual({
      rules: { MD013: true, MD024: { siblings_only: true } },
    });
  });

  it("replaces arrays wholesale rather than merging them", () => {
    expect(deepMerge({ list: [1, 2, 3] }, { list: [9] })).toEqual({
      list: [9],
    });
  });

  it("lets a scalar override replace an object and vice versa", () => {
    expect(deepMerge({ a: { nested: true } }, { a: false })).toEqual({
      a: false,
    });
    expect(deepMerge({ a: false }, { a: { nested: true } })).toEqual({
      a: { nested: true },
    });
  });

  it("does not mutate its inputs", () => {
    const base = { nested: { keep: 1 } };
    const override = { nested: { add: 2 } };
    const merged = deepMerge(base, override);
    expect(base).toEqual({ nested: { keep: 1 } });
    expect(override).toEqual({ nested: { add: 2 } });
    expect(merged).toEqual({ nested: { add: 2, keep: 1 } });
  });
});
