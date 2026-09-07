import { parse as parseJsonc } from "jsonc-parser";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { STUDIO_MARKDOWNLINT_BASELINE } from "./baseline.ts";

/**
 * The in-code baseline is the source of truth; the repo-root `.markdownlint.jsonc`
 * mirrors it so editors and other markdownlint consumers see the same standard.
 * This test fails if the two ever drift, so there is exactly one studio standard.
 */
describe("studio markdownlint baseline", () => {
  it("matches the repo-root .markdownlint.jsonc mirror", () => {
    const rootConfigPath = fileURLToPath(
      new URL("../../.markdownlint.jsonc", import.meta.url),
    );
    const mirror: unknown = parseJsonc(readFileSync(rootConfigPath, "utf8"));
    expect(mirror).toEqual(STUDIO_MARKDOWNLINT_BASELINE);
  });
});
