import {
  cpSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as Canon from "../../../src/index.ts";
import { runCheck } from "../../../src/cli/main.ts";

const CHARACTERIZATION_ROOT = import.meta.dirname;
const FIXTURE_SOURCE = join(CHARACTERIZATION_ROOT, "fixture");
const EXPECTED_PATH = join(CHARACTERIZATION_ROOT, "expected.json");
const LEDGER_PATH = join(CHARACTERIZATION_ROOT, "ledger.json");
const CONSUMER_CORPUS_PATH = join(CHARACTERIZATION_ROOT, "consumers.json");
const CLI_PATH = join(CHARACTERIZATION_ROOT, "../../../src/cli/main.ts");
const FIXED_TIMESTAMP = "2026-01-02T03:04:05.000Z";
const FIXED_SUPERSEDING_TIMESTAMP = "2026-01-03T03:04:05.000Z";
const EXPECTED_COMMANDS = [
  "add-decision",
  "build",
  "check",
  "drain",
  "fix",
  "llms",
] as const;

type JsonObject = Record<string, unknown>;
type CliVector = {
  args: string[];
  exitCode: number | null;
  id: string;
  stderr: string[];
  stdout: string[];
};

function normalizePath(path: string, root: string): string {
  return path
    .replaceAll(realpathSync(root), "<fixture>")
    .replaceAll(root, "<fixture>")
    .replaceAll("\\", "/");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function sortCanonical<T>(values: T[]): T[] {
  return values.toSorted((left, right) =>
    JSON.stringify(canonicalize(left)).localeCompare(
      JSON.stringify(canonicalize(right)),
    ),
  );
}

function normalizeCliOutput(output: string, root: string): string[] {
  const normalized = normalizePath(output, root).replace(
    /intake\/[^/\n]+\.json/g,
    "intake/<staged-file>.json",
  );
  return normalized.trimEnd() === "" ? [] : normalized.trimEnd().split("\n");
}

function runCli(root: string, id: string, args: string[]): CliVector {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CANON_ACTOR: "fixture" },
  });
  if (result.error) {
    throw result.error;
  }
  const captured = {
    args,
    exitCode: result.status,
    id,
    stderr: normalizeCliOutput(result.stderr, root),
    stdout: normalizeCliOutput(result.stdout, root),
  };
  return captured;
}

function withCliFixture(
  id: string,
  args: string[],
  setup?: (root: string) => void,
): CliVector {
  const root = mkdtempSync(join(tmpdir(), "canon-cli-characterization-"));
  try {
    cpSync(FIXTURE_SOURCE, root, { recursive: true });
    setup?.(root);
    return runCli(root, id, args);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

function captureCli(): CliVector[] {
  const vectors = [
    withCliFixture("dispatch.help-no-command", []),
    withCliFixture("dispatch.unknown-command", ["unknown"]),
    withCliFixture("check.success", ["check", "README.md"]),
    withCliFixture(
      "check.findings",
      ["check", "cli-bad.md", "--no-references"],
      (root) => writeFileSync(join(root, "cli-bad.md"), "not a heading\n"),
    ),
    withCliFixture("check.invocation-error", ["check", "--config"]),
    withCliFixture(
      "fix.success",
      ["fix", "cli-fix.md", "--no-llms"],
      (root) =>
        writeFileSync(join(root, "cli-fix.md"), "# Fix\n\nTrailing.   \n"),
    ),
    withCliFixture("fix.invocation-error", ["fix", "--config"]),
    withCliFixture("llms.success", ["llms"]),
    withCliFixture("llms.drift", ["llms", "--check"], (root) => {
      runCli(root, "setup.llms", ["llms"]);
      writeFileSync(
        join(root, "README.md"),
        readFileSync(join(root, "README.md"), "utf8").replace(
          "A deterministic fixture for Canon.",
          "A changed fixture summary.",
        ),
      );
    }),
    withCliFixture("llms.invocation-error", ["llms", "--config"]),
    withCliFixture("add-decision.success", [
      "add-decision",
      "CLI decision",
      "--body",
      "Frozen.",
      "--actor",
      "fixture",
    ]),
    withCliFixture("add-decision.invocation-error", ["add-decision"]),
    withCliFixture("drain.success", ["drain"], (root) => {
      runCli(root, "setup.add-decision", [
        "add-decision",
        "Drained decision",
        "--actor",
        "fixture",
      ]);
    }),
    withCliFixture("build.success", ["build"]),
    withCliFixture("build.clean", ["build", "--check"], (root) => {
      runCli(root, "setup.build", ["build"]);
    }),
    withCliFixture("build.drift", ["build", "--check"]),
    withCliFixture("build.invocation-error", ["build", "--unknown"]),
  ];
  return vectors.toSorted((left, right) => left.id.localeCompare(right.id));
}

async function captureCharacterization(root: string): Promise<JsonObject> {
  const config = await Canon.resolveConfig({ cwd: root });
  const files = ["README.md", "docs/guide.md"];
  const readFixture = (path: string): string =>
    readFileSync(join(root, path), "utf8");

  const malformed = {
    "bad.md": "#Bad heading\n\nTrailing spaces.  \n",
  };
  const lint = sortCanonical(
    await Canon.lintContent(malformed, config.markdownlint),
  );
  const fixes = sortCanonical(
    await Canon.fixContents(malformed, config.markdownlint),
  );
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

  const captured = {
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
        })
          .map(normalizeReference)
          .toSorted((left, right) =>
            JSON.stringify(canonicalize(left)).localeCompare(
              JSON.stringify(canonicalize(right)),
            ),
          ),
        withoutIgnore: Canon.checkReferences(absoluteFiles, {
          repoRoot: root,
        })
          .map(normalizeReference)
          .toSorted((left, right) =>
            JSON.stringify(canonicalize(left)).localeCompare(
              JSON.stringify(canonicalize(right)),
            ),
          ),
      },
    },
    llms: Canon.generateLlms(files, config.llms!, readFixture),
    cli: {
      commands: [...EXPECTED_COMMANDS],
      vectors: captureCli(),
    },
    decisions: {
      drain: drained,
      projection: projected,
      rendered: Canon.renderProjection(projected).toSorted((left, right) =>
        left.path.localeCompare(right.path),
      ),
    },
    unlocked: {
      acceptsBundleInput: false,
      acceptsLockInput: false,
      diagnostic: null,
      exitCode: noLockExit,
      output: messages,
      status: null,
    },
  } satisfies JsonObject;

  return canonicalize(captured) as JsonObject;
}

describe("Canon 0.1.0 characterization", () => {
  let fixtureRoot = "";

  afterEach(() => {
    if (fixtureRoot) {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
    vi.restoreAllMocks();
  });

  it(
    "matches the normalized fixture golden",
    async () => {
      fixtureRoot = mkdtempSync(join(tmpdir(), "canon-characterization-"));
      cpSync(FIXTURE_SOURCE, fixtureRoot, { recursive: true });
      const actual = await captureCharacterization(fixtureRoot);

      if (process.env.UPDATE_CHARACTERIZATION === "1") {
        writeFileSync(EXPECTED_PATH, `${JSON.stringify(actual, undefined, 2)}\n`);
      }

      const expected = JSON.parse(
        readFileSync(EXPECTED_PATH, "utf8"),
      ) as unknown;
      expect(actual).toEqual(expected);
    },
    20_000,
  );

  it("keeps the ledger tied to this corpus without compatibility aliases", () => {
    const ledger = JSON.parse(readFileSync(LEDGER_PATH, "utf8")) as {
      authority: string;
      compatibilityBundle: { id: string | null };
      consumerDiscovery: { corpus: string; queries: string[] };
      consumers: Array<{
        evidenceRecord: string;
        repository: string;
        revision: string;
      }>;
      fixture: { consumerCorpus: string; golden: string; revision: number };
      package: { name: string; sourceRevision: string; version: string };
      pullRequests: Array<{
        disposition: string;
        headRevision: string;
        number: number;
        prerequisite: boolean;
        repository: string;
      }>;
      surfaces: Array<{ id: string; proof: string[] }>;
      verdictDependencies: Record<string, string>;
    };
    const consumerCorpus = JSON.parse(
      readFileSync(CONSUMER_CORPUS_PATH, "utf8"),
    ) as {
      queries: Array<{ query: string; recordIds: string[] }>;
      records: Array<{
        disposition: string;
        evidence: Array<{ blobSha: string; matches: string[]; path: string }>;
        id: string;
        repository: string;
        resolvedRefEvidence?: {
          absenceChecks: string[];
          blobSha: string;
          path: string;
          ref: string;
          repository: string;
          revision: string;
        };
        revision: string;
      }>;
    };
    const packageJson = JSON.parse(
      readFileSync(join(CHARACTERIZATION_ROOT, "../../..", "package.json"), "utf8"),
    ) as { name: string; version: string };
    const lock = readFileSync(
      join(CHARACTERIZATION_ROOT, "../../..", "bun.lock"),
      "utf8",
    );
    const expected = JSON.parse(readFileSync(EXPECTED_PATH, "utf8")) as {
      cli: { commands: string[]; vectors: CliVector[] };
    };

    expect(ledger.authority).toBe("characterization-only");
    expect(ledger.compatibilityBundle.id).toBeNull();
    expect(ledger.fixture).toEqual({
      consumerCorpus: "consumers.json",
      golden: "expected.json",
      id: "canon-v0.1.0",
      normalization: expect.any(Array),
      revision: 2,
    });
    expect(ledger.package).toEqual({
      name: packageJson.name,
      registry: "https://npm.pkg.github.com",
      sourceRevision: "7162ec763a9e99fbe4ef047e6ffb7fcfb5a8e18c",
      version: packageJson.version,
    });
    expect(ledger.consumerDiscovery.corpus).toBe("consumers.json");
    expect(relative(CHARACTERIZATION_ROOT, CONSUMER_CORPUS_PATH)).toBe(
      ledger.fixture.consumerCorpus,
    );
    const recordsById = new Map(
      consumerCorpus.records.map((record) => [record.id, record]),
    );
    for (const record of consumerCorpus.records) {
      expect(
        record.evidence.every(
          ({ blobSha, matches, path }) =>
            /^[a-f0-9]{40}$/.test(blobSha) &&
            matches.length > 0 &&
            path.length > 0,
        ),
      ).toBe(true);
      expect(record.evidence.map(({ path }) => path)).toEqual(
        record.evidence.map(({ path }) => path).toSorted(),
      );
    }
    for (const consumer of ledger.consumers) {
      const record = recordsById.get(consumer.evidenceRecord);
      expect(record).toMatchObject({
        disposition: "current-consumer",
        repository: consumer.repository,
        revision: consumer.revision,
      });
    }
    expect(consumerCorpus.records).toEqual(
      consumerCorpus.records.toSorted((left, right) =>
        left.id.localeCompare(right.id),
      ),
    );
    expect(consumerCorpus.records).toContainEqual(
      expect.objectContaining({
        disposition: "excluded-pre-canon-workflow",
        id: "incubator",
        repository: "clockwork-kitten/incubator",
        resolvedRefEvidence: expect.objectContaining({
          absenceChecks: [
            "@clockwork-kitten/canon",
            "clockwork-kitten/canon",
            "canon-ref",
          ],
          blobSha: "395185bc587c64fdf701f29016bc52d4e1db262e",
          path: ".github/workflows/markdown-conformance.yml",
          ref: "v0.4.0",
          repository: "clockwork-kitten/standards",
          revision: "f110cd93a8821b7468f8d955e05eb99494530c1c",
        }),
      }),
    );
    expect(consumerCorpus.queries.map(({ query }) => query)).toEqual(
      ledger.consumerDiscovery.queries,
    );
    for (const { query, recordIds: recordedIds } of consumerCorpus.queries) {
      const searchNeedle = query.slice(1, -1).toLowerCase();
      const evidenceIds = consumerCorpus.records
        .filter(({ evidence }) =>
          evidence.some(({ matches }) =>
            matches.some((match) =>
              match.toLowerCase().includes(searchNeedle),
            ),
          ),
        )
        .map(({ id }) => id)
        .toSorted();
      expect(recordedIds).toEqual(evidenceIds);
    }
    expect(ledger.surfaces.map(({ id }) => id).toSorted()).toEqual([
      "cli",
      "config",
      "decision.api",
      "distribution",
      "docs.llms",
      "docs.markdown",
      "docs.references",
      "unlocked",
    ]);
    expect(
      ledger.surfaces.find(({ id }) => id === "cli")?.proof,
    ).toContain("expected.json#/cli/vectors");
    expect(ledger.verdictDependencies.fullTransitiveClosure).toBe("bun.lock");
    for (const [dependency, version] of Object.entries(
      ledger.verdictDependencies,
    )) {
      if (dependency !== "fullTransitiveClosure") {
        expect(lock).toContain(
          `"${dependency}": ["${dependency}@${version}"`,
        );
      }
    }
    expect(expected.cli.commands).toEqual([...EXPECTED_COMMANDS]);
    for (const command of EXPECTED_COMMANDS) {
      expect(
        expected.cli.vectors.some(({ args }) => args[0] === command),
      ).toBe(true);
    }
    expect(
      Object.fromEntries(
        EXPECTED_COMMANDS.map((command) => [
          command,
          [
            ...new Set(
              expected.cli.vectors
                .filter(({ args }) => args[0] === command)
                .map(({ exitCode }) => exitCode),
            ),
          ].toSorted(),
        ]),
      ),
    ).toEqual({
      "add-decision": [0, 2],
      build: [0, 1, 2],
      check: [0, 1, 2],
      drain: [0],
      fix: [0, 2],
      llms: [0, 1, 2],
    });
    expect(ledger.pullRequests).toContainEqual(
      expect.objectContaining({
        disposition: "retain",
        headRevision: "9441019afb8cfcda9f98ec7b6eb08b7c500d6389",
        number: 6,
        prerequisite: false,
        repository: "clockwork-kitten/canon",
      }),
    );
    expect(relative(CHARACTERIZATION_ROOT, EXPECTED_PATH)).toBe("expected.json");
    expect(JSON.stringify(ledger)).not.toMatch(
      /"commandAlias"|"ruleAlias"|"suppressionAlias"|"compatibilityWindow"/,
    );
  });

  it("canonicalizes object keys while retaining order-sensitive arrays", () => {
    expect(canonicalize({ z: 1, a: { d: 2, b: 1 } })).toEqual({
      a: { b: 1, d: 2 },
      z: 1,
    });
    expect(canonicalize(["second", "first"])).toEqual(["second", "first"]);
    expect(sortCanonical([{ id: "z" }, { id: "a" }])).toEqual([
      { id: "a" },
      { id: "z" },
    ]);
  });
});
