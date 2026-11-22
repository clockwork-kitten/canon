import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as Canon from "../../../src/index.ts";
import {
  parseAddDecisionArgs,
  parseBuildArgs,
  parseCheckArgs,
  parseFixArgs,
  parseLlmsArgs,
  runCheck,
} from "../../../src/cli/main.ts";

const CHARACTERIZATION_ROOT = import.meta.dirname;
const FIXTURE_SOURCE = join(CHARACTERIZATION_ROOT, "fixture");
const EXPECTED_PATH = join(CHARACTERIZATION_ROOT, "expected.json");
const LEDGER_PATH = join(CHARACTERIZATION_ROOT, "ledger.json");
const FIXED_TIMESTAMP = "2026-01-02T03:04:05.000Z";
const FIXED_SUPERSEDING_TIMESTAMP = "2026-01-03T03:04:05.000Z";

type JsonObject = Record<string, unknown>;

function normalizePath(path: string, root: string): string {
  return path.replace(root, "<fixture>").replaceAll("\\", "/");
}

async function captureCharacterization(root: string): Promise<JsonObject> {
  const config = await Canon.resolveConfig({ cwd: root });
  const files = ["README.md", "docs/guide.md"];
  const readFixture = (path: string): string =>
    readFileSync(join(root, path), "utf8");

  const malformed = {
    "bad.md": "#Bad heading\n\nTrailing spaces.  \n",
  };
  const lint = await Canon.lintContent(malformed, config.markdownlint);
  const fixes = await Canon.fixContents(malformed, config.markdownlint);
  const absoluteFiles = files.map((file) => join(root, file));
  const normalizeReference = (issue: Canon.ReferenceIssue) => ({
    ...issue,
    file: normalizePath(issue.file, root),
  });

  const first = Canon.createIntake({
    actor: "fixture",
    body: "Use the first approach.",
    nonce: "fixture-first",
    title: "First approach",
    ts: FIXED_TIMESTAMP,
    type: "decision",
  });
  const second = Canon.createIntake({
    actor: "fixture",
    body: "Use the replacement.",
    nonce: "fixture-second",
    supersedes: "DEC-0001",
    title: "Replacement approach",
    ts: FIXED_SUPERSEDING_TIMESTAMP,
    type: "decision",
  });
  const drained = Canon.drain([], [second, first]);
  const projected = Canon.project(drained.events);

  const messages: string[] = [];
  vi.spyOn(console, "error").mockImplementation((message?: unknown) => {
    messages.push(String(message));
  });
  const noConfigRoot = mkdtempSync(join(tmpdir(), "canon-unlocked-"));
  writeFileSync(join(noConfigRoot, "README.md"), "# No lock\n\nLocal run.\n");
  const noLockExit = await runCheck([], noConfigRoot);
  rmSync(noConfigRoot, { force: true, recursive: true });
  vi.restoreAllMocks();

  return {
    publicApi: Object.keys(Canon).toSorted(),
    config: {
      discoveryOrder: [...Canon.CONFIG_FILENAMES],
      llms: config.llms,
      markdownlint: config.markdownlint,
      references: config.references,
      source: normalizePath(config.source, root),
    },
    documentation: {
      fixes,
      lint,
      references: {
        configured: Canon.checkReferences(absoluteFiles, {
          ignore: config.references.ignore,
          repoRoot: root,
        }).map(normalizeReference),
        withoutIgnore: Canon.checkReferences(absoluteFiles, {
          repoRoot: root,
        }).map(normalizeReference),
      },
    },
    llms: Canon.generateLlms(files, config.llms!, readFixture),
    cli: {
      addDecision: parseAddDecisionArgs([
        "Title",
        "--body",
        "Body",
        "--actor",
        "agent",
        "--supersedes",
        "DEC-0001",
      ]),
      build: parseBuildArgs(["--check"]),
      check: parseCheckArgs([
        "docs/**/*.md",
        "--config",
        "canon.config.jsonc",
        "--no-references",
        "--reference-ignore",
        "characterization-external/",
      ]),
      fix: parseFixArgs(["README.md", "--no-llms"]),
      llms: parseLlmsArgs(["--check"]),
    },
    decisions: {
      drain: drained,
      projection: projected,
      rendered: Canon.renderProjection(projected),
    },
    unlocked: {
      acceptsBundleInput: false,
      acceptsLockInput: false,
      diagnostic: null,
      exitCode: noLockExit,
      output: messages,
      status: null,
    },
  };
}

describe("Canon 0.1.0 characterization", () => {
  let fixtureRoot = "";

  afterEach(() => {
    if (fixtureRoot) {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
    vi.restoreAllMocks();
  });

  it("matches the normalized fixture golden", async () => {
    fixtureRoot = mkdtempSync(join(tmpdir(), "canon-characterization-"));
    cpSync(FIXTURE_SOURCE, fixtureRoot, { recursive: true });
    const actual = await captureCharacterization(fixtureRoot);

    if (process.env.UPDATE_CHARACTERIZATION === "1") {
      writeFileSync(EXPECTED_PATH, `${JSON.stringify(actual, undefined, 2)}\n`);
    }

    const expected = JSON.parse(readFileSync(EXPECTED_PATH, "utf8")) as unknown;
    expect(actual).toEqual(expected);
  });

  it("keeps the ledger tied to this corpus without compatibility aliases", () => {
    const ledger = JSON.parse(readFileSync(LEDGER_PATH, "utf8")) as {
      authority: string;
      compatibilityBundle: { id: string | null };
      fixture: { golden: string; revision: number };
      package: { version: string };
    };
    const packageJson = JSON.parse(
      readFileSync(join(CHARACTERIZATION_ROOT, "../../..", "package.json"), "utf8"),
    ) as { version: string };

    expect(ledger.authority).toBe("characterization-only");
    expect(ledger.compatibilityBundle.id).toBeNull();
    expect(ledger.fixture).toMatchObject({ golden: "expected.json", revision: 1 });
    expect(ledger.package.version).toBe(packageJson.version);
    expect(relative(CHARACTERIZATION_ROOT, EXPECTED_PATH)).toBe("expected.json");
    expect(JSON.stringify(ledger)).not.toMatch(
      /"commandAlias"|"ruleAlias"|"suppressionAlias"|"compatibilityWindow"/,
    );
  });
});
