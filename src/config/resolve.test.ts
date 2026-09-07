import { describe, expect, it } from "vitest";

import { STUDIO_MARKDOWNLINT_BASELINE } from "./baseline.ts";
import {
  resolveMarkdownlintConfig,
  resolveReferencesConfig,
} from "./resolve.ts";
import { defineConfig } from "./types.ts";

describe("resolveMarkdownlintConfig", () => {
  it("returns the studio baseline when no overrides are given", () => {
    expect(resolveMarkdownlintConfig({})).toEqual(STUDIO_MARKDOWNLINT_BASELINE);
  });

  it("deep-merges overrides over the baseline by default", () => {
    const resolved = resolveMarkdownlintConfig({
      markdownlint: { MD013: { line_length: 120 } },
    });
    // Overridden rule takes the new value...
    expect(resolved.MD013).toEqual({ line_length: 120 });
    // ...while untouched baseline rules survive.
    expect(resolved.MD033).toBe(false);
    expect(resolved.MD024).toEqual({ siblings_only: true });
  });

  it("applies an override while sibling baseline rules survive", () => {
    const resolved = resolveMarkdownlintConfig({
      markdownlint: { MD046: { style: "consistent" } },
    });
    expect(resolved.MD046).toEqual({ style: "consistent" });
    expect(resolved.MD029).toEqual({ style: "one_or_ordered" });
    expect(resolved.MD024).toEqual({ siblings_only: true });
  });

  it("ignores the baseline entirely when extends is false", () => {
    const resolved = resolveMarkdownlintConfig({
      extends: false,
      markdownlint: { default: true, MD041: false },
    });
    expect(resolved).toEqual({ default: true, MD041: false });
    expect(resolved.MD033).toBeUndefined();
  });

  it("does not mutate the shared baseline", () => {
    resolveMarkdownlintConfig({ markdownlint: { MD013: true } });
    expect(STUDIO_MARKDOWNLINT_BASELINE.MD013).toBe(false);
  });

  it("defineConfig returns its argument unchanged", () => {
    const config = { markdownlint: { MD013: true } };
    expect(defineConfig(config)).toBe(config);
  });
});

describe("resolveReferencesConfig", () => {
  it("defaults ignore to empty when unset", () => {
    expect(resolveReferencesConfig({})).toEqual({ ignore: [] });
  });

  it("copies configured ignore substrings without aliasing the source", () => {
    const source = { references: { ignore: ["ops/"] } };
    const resolved = resolveReferencesConfig(source);
    expect(resolved).toEqual({ ignore: ["ops/"] });
    expect(resolved.ignore).not.toBe(source.references.ignore);
  });
});
