import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ConfigError,
  discoverConfigPath,
  loadConfigFile,
  resolveConfig,
} from "./resolve.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "canon-cfg-"));
});

afterEach(() => {
  rmSync(dir, { force: true, recursive: true });
});

describe("discoverConfigPath", () => {
  it("returns undefined when no config file exists", () => {
    expect(discoverConfigPath(dir)).toBeUndefined();
  });

  it("prefers canon.config.ts over canon.config.jsonc", () => {
    writeFileSync(join(dir, "canon.config.jsonc"), "{}");
    writeFileSync(join(dir, "canon.config.ts"), "export default {}");
    expect(discoverConfigPath(dir)).toBe(join(dir, "canon.config.ts"));
  });
});

describe("loadConfigFile", () => {
  it("parses JSONC with comments and trailing commas", async () => {
    const path = join(dir, "canon.config.jsonc");
    writeFileSync(
      path,
      '{\n  // a comment\n  "markdownlint": { "MD013": true },\n}',
    );
    expect(await loadConfigFile(path)).toEqual({
      markdownlint: { MD013: true },
    });
  });

  it("imports a TypeScript config's default export", async () => {
    const path = join(dir, "canon.config.ts");
    writeFileSync(path, "export default { markdownlint: { MD041: false } };");
    expect(await loadConfigFile(path)).toEqual({
      markdownlint: { MD041: false },
    });
  });

  it("throws ConfigError on malformed JSONC", async () => {
    const path = join(dir, "canon.config.jsonc");
    writeFileSync(path, "{ not valid");
    await expect(loadConfigFile(path)).rejects.toBeInstanceOf(ConfigError);
  });

  it("throws ConfigError when the config is not an object", async () => {
    const path = join(dir, "canon.config.json");
    writeFileSync(path, "[1, 2, 3]");
    await expect(loadConfigFile(path)).rejects.toBeInstanceOf(ConfigError);
  });
});

describe("resolveConfig", () => {
  it("falls back to the studio baseline when no config file exists", async () => {
    const resolved = await resolveConfig({ cwd: dir });
    expect(resolved.markdownlint.MD013).toBe(false);
    expect(resolved.source).toContain("baseline");
  });

  it("merges a discovered config over the baseline", async () => {
    writeFileSync(
      join(dir, "canon.config.jsonc"),
      '{ "markdownlint": { "MD013": true } }',
    );
    const resolved = await resolveConfig({ cwd: dir });
    expect(resolved.markdownlint.MD013).toBe(true);
    expect(resolved.markdownlint.MD033).toBe(false);
    expect(resolved.source).toBe(join(dir, "canon.config.jsonc"));
  });

  it("honors an explicit relative configPath", async () => {
    writeFileSync(
      join(dir, "custom.jsonc"),
      '{ "extends": false, "markdownlint": { "default": true } }',
    );
    const resolved = await resolveConfig({
      configPath: "custom.jsonc",
      cwd: dir,
    });
    expect(resolved.markdownlint).toEqual({ default: true });
  });
});
