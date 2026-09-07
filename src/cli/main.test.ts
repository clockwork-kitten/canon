import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  expandGlobs,
  parseCheckArgs,
  parseFixArgs,
  parseLlmsArgs,
  runCheck,
  runFix,
  runLlms,
} from "./main.ts";

describe("parseCheckArgs", () => {
  it("defaults to **/*.md with no config", () => {
    expect(parseCheckArgs([])).toEqual({
      configPath: undefined,
      globs: ["**/*.md"],
      referenceIgnore: [],
      references: true,
    });
  });

  it("collects positional globs", () => {
    expect(parseCheckArgs(["docs/**/*.md", "README.md"])).toEqual({
      configPath: undefined,
      globs: ["docs/**/*.md", "README.md"],
      referenceIgnore: [],
      references: true,
    });
  });

  it("parses --config, -c, and --config=", () => {
    expect(parseCheckArgs(["--config", "a.ts"]).configPath).toBe("a.ts");
    expect(parseCheckArgs(["-c", "b.ts"]).configPath).toBe("b.ts");
    expect(parseCheckArgs(["--config=c.ts"]).configPath).toBe("c.ts");
  });

  it("parses --no-references and repeatable --reference-ignore", () => {
    expect(parseCheckArgs(["--no-references"]).references).toBe(false);
    expect(
      parseCheckArgs([
        "--reference-ignore",
        "ops/",
        "--reference-ignore=docs/x.md",
      ]).referenceIgnore,
    ).toEqual(["ops/", "docs/x.md"]);
  });

  it("throws on a missing --config value or unknown flag", () => {
    expect(() => parseCheckArgs(["--config"])).toThrow(/requires a path/);
    expect(() => parseCheckArgs(["--nope"])).toThrow(/unknown option/);
    expect(() => parseCheckArgs(["--reference-ignore"])).toThrow(
      /requires a substring/,
    );
  });
});

describe("expandGlobs", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "canon-glob-"));
    writeFileSync(join(dir, "a.md"), "# A\n");
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "sub", "b.md"), "# B\n");
    mkdirSync(join(dir, "node_modules"));
    writeFileSync(join(dir, "node_modules", "c.md"), "# C\n");
  });
  afterEach(() => {
    rmSync(dir, { force: true, recursive: true });
  });

  it("finds markdown recursively and skips ignored dirs", () => {
    expect(expandGlobs(["**/*.md"], dir)).toEqual(["a.md", "sub/b.md"]);
  });

  it("de-duplicates across overlapping patterns", () => {
    expect(expandGlobs(["**/*.md", "a.md"], dir)).toEqual(["a.md", "sub/b.md"]);
  });
});

describe("runCheck", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "canon-run-"));
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    rmSync(dir, { force: true, recursive: true });
    vi.restoreAllMocks();
  });

  it("returns 0 when all files are conformant", async () => {
    writeFileSync(join(dir, "ok.md"), "# Title\n\nGood.\n");
    expect(await runCheck(["**/*.md"], dir)).toBe(0);
  });

  it("returns 1 when a file violates a rule", async () => {
    writeFileSync(join(dir, "bad.md"), "no heading\n");
    expect(await runCheck(["**/*.md"], dir)).toBe(1);
  });

  it("returns 2 on a malformed config file", async () => {
    writeFileSync(join(dir, "ok.md"), "# Title\n\nGood.\n");
    writeFileSync(join(dir, "canon.config.jsonc"), "{ broken");
    expect(await runCheck(["**/*.md"], dir)).toBe(2);
  });

  it("returns 2 on bad arguments", async () => {
    expect(await runCheck(["--config"], dir)).toBe(2);
  });

  it("applies a repo config override (extends:false loosens rules)", async () => {
    // MD041 (first-line-heading) would fire, but the repo config disables it.
    writeFileSync(join(dir, "no-h1.md"), "Just a paragraph, no heading.\n");
    writeFileSync(
      join(dir, "canon.config.jsonc"),
      '{ "extends": false, "markdownlint": { "default": true, "MD041": false, "MD047": false } }',
    );
    expect(await runCheck(["**/*.md"], dir)).toBe(0);
  });

  it("returns 1 on a broken internal link, 0 once --no-references is set", async () => {
    writeFileSync(
      join(dir, "index.md"),
      "# Index\n\nSee [gone](missing.md).\n",
    );
    expect(await runCheck(["**/*.md"], dir)).toBe(1);
    expect(await runCheck(["**/*.md", "--no-references"], dir)).toBe(0);
  });

  it("resolves a valid internal link", async () => {
    writeFileSync(
      join(dir, "index.md"),
      "# Index\n\nSee [target](target.md).\n",
    );
    writeFileSync(join(dir, "target.md"), "# Target\n\nHere.\n");
    expect(await runCheck(["**/*.md"], dir)).toBe(0);
  });

  it("honors --reference-ignore for a cross-repo backtick path", async () => {
    writeFileSync(
      join(dir, "index.md"),
      "# Index\n\nSee `other/repo.md` elsewhere.\n",
    );
    expect(await runCheck(["**/*.md"], dir)).toBe(1);
    expect(
      await runCheck(["**/*.md", "--reference-ignore", "other/"], dir),
    ).toBe(0);
  });
});

describe("parseLlmsArgs", () => {
  it("defaults to **/*.md, no config, write mode", () => {
    expect(parseLlmsArgs([])).toEqual({
      check: false,
      configPath: undefined,
      globs: ["**/*.md"],
    });
  });

  it("parses globs, --config, and --check", () => {
    expect(
      parseLlmsArgs(["docs/**/*.md", "--config", "c.ts", "--check"]),
    ).toEqual({
      check: true,
      configPath: "c.ts",
      globs: ["docs/**/*.md"],
    });
  });

  it("throws on a missing --config value or unknown flag", () => {
    expect(() => parseLlmsArgs(["--config"])).toThrow(/requires a path/);
    expect(() => parseLlmsArgs(["--nope"])).toThrow(/unknown option/);
  });
});

const LLMS_CONFIG = JSON.stringify({
  llms: {
    project: "Test",
    sections: [
      { prefix: "", shallow: true, title: "Top" },
      { prefix: "docs/", title: "Docs" },
    ],
    summary: "A test index.",
  },
});

describe("runLlms", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "canon-llms-"));
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    rmSync(dir, { force: true, recursive: true });
    vi.restoreAllMocks();
  });

  it("returns 2 when no llms config is present", async () => {
    writeFileSync(join(dir, "README.md"), "# R\n\nx.\n");
    expect(await runLlms([], dir)).toBe(2);
  });

  it("writes llms.txt, then --check passes; editing a doc makes --check fail", async () => {
    writeFileSync(join(dir, "canon.config.jsonc"), LLMS_CONFIG);
    writeFileSync(join(dir, "README.md"), "# Home\n\nRoot doc.\n");
    mkdirSync(join(dir, "docs"));
    writeFileSync(join(dir, "docs", "a.md"), "# Alpha\n\nA doc.\n");

    expect(await runLlms([], dir)).toBe(0);
    const written = readFileSync(join(dir, "llms.txt"), "utf8");
    expect(written).toContain("# Test");
    expect(written).toContain("- [Home](README.md): Root doc.");
    expect(written).toContain("- [Alpha](docs/a.md): A doc.");

    expect(await runLlms(["--check"], dir)).toBe(0);

    writeFileSync(join(dir, "docs", "a.md"), "# Alpha\n\nChanged summary.\n");
    expect(await runLlms(["--check"], dir)).toBe(1);
  });

  it("returns 2 on a malformed config", async () => {
    writeFileSync(join(dir, "canon.config.jsonc"), "{ broken");
    expect(await runLlms([], dir)).toBe(2);
  });

  it("returns 2 on bad arguments", async () => {
    expect(await runLlms(["--config"], dir)).toBe(2);
  });
});

describe("parseFixArgs", () => {
  it("defaults to **/*.md, no config, llms on", () => {
    expect(parseFixArgs([])).toEqual({
      configPath: undefined,
      globs: ["**/*.md"],
      llms: true,
    });
  });

  it("parses globs, --config, and --no-llms", () => {
    expect(
      parseFixArgs(["docs/**/*.md", "--config", "c.ts", "--no-llms"]),
    ).toEqual({
      configPath: "c.ts",
      globs: ["docs/**/*.md"],
      llms: false,
    });
  });

  it("throws on a missing --config value or unknown flag", () => {
    expect(() => parseFixArgs(["--config"])).toThrow(/requires a path/);
    expect(() => parseFixArgs(["--nope"])).toThrow(/unknown option/);
  });
});

describe("runFix", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "canon-fix-"));
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    rmSync(dir, { force: true, recursive: true });
    vi.restoreAllMocks();
  });

  it("rewrites fixable violations in place and returns 0", async () => {
    writeFileSync(
      join(dir, "a.md"),
      "# Title\n\ntrailing here   \n\n\n\ntail\n",
    );
    expect(await runFix(["**/*.md", "--no-llms"], dir)).toBe(0);
    const fixed = readFileSync(join(dir, "a.md"), "utf8");
    expect(fixed).not.toContain("here   ");
    expect(fixed).not.toContain("\n".repeat(3));
  });

  it("leaves conformant files untouched", async () => {
    const good = "# Title\n\nGood.\n";
    writeFileSync(join(dir, "ok.md"), good);
    expect(await runFix(["**/*.md", "--no-llms"], dir)).toBe(0);
    expect(readFileSync(join(dir, "ok.md"), "utf8")).toBe(good);
  });

  it("reports unfixable residue but still returns 0 (check is the gate)", async () => {
    writeFileSync(join(dir, "bad.md"), "no heading here\n");
    expect(await runFix(["**/*.md", "--no-llms"], dir)).toBe(0);
    // The file is unchanged because MD041 has no autofix.
    expect(readFileSync(join(dir, "bad.md"), "utf8")).toBe("no heading here\n");
  });

  it("regenerates llms.txt when an llms config is present", async () => {
    writeFileSync(join(dir, "canon.config.jsonc"), LLMS_CONFIG);
    writeFileSync(join(dir, "README.md"), "# Home\n\nRoot doc.\n");
    expect(await runFix([], dir)).toBe(0);
    const index = readFileSync(join(dir, "llms.txt"), "utf8");
    expect(index).toContain("# Test");
    expect(index).toContain("- [Home](README.md): Root doc.");
  });

  it("skips llms regeneration with --no-llms", async () => {
    writeFileSync(join(dir, "canon.config.jsonc"), LLMS_CONFIG);
    writeFileSync(join(dir, "README.md"), "# Home\n\nRoot doc.\n");
    expect(await runFix(["--no-llms"], dir)).toBe(0);
    expect(existsSync(join(dir, "llms.txt"))).toBe(false);
  });

  it("returns 2 on a malformed config", async () => {
    writeFileSync(join(dir, "canon.config.jsonc"), "{ broken");
    expect(await runFix([], dir)).toBe(2);
  });

  it("returns 2 on bad arguments", async () => {
    expect(await runFix(["--config"], dir)).toBe(2);
  });
});
