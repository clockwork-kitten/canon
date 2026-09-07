import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  checkReferences,
  extractReferences,
  formatReferenceIssues,
} from "./references.ts";

describe("extractReferences", () => {
  it("collects internal .md links and strips fragments", () => {
    const refs = extractReferences("[a](docs/a.md#section) and [b](../b.md)");
    expect(refs).toEqual([
      { kind: "link", line: 1, target: "docs/a.md" },
      { kind: "link", line: 1, target: "../b.md" },
    ]);
  });

  it("ignores external, non-.md, and in-code links", () => {
    const refs = extractReferences(
      "[x](https://example.com/a.md) [y](mailto:me@x.md) [z](page.html) `[q](fake.md)`",
    );
    expect(refs).toEqual([]);
  });

  it("collects reference-definition targets", () => {
    const refs = extractReferences("See [a][def].\n\n[def]: docs/a.md\n");
    expect(refs).toContainEqual({ kind: "link", line: 3, target: "docs/a.md" });
  });

  it("treats a backtick root-relative path as a ref but bare filenames as prose", () => {
    const refs = extractReferences(
      "Use `docs/conventions.md` but not `README.md` here.",
    );
    expect(refs).toEqual([
      { kind: "ref", line: 1, target: "docs/conventions.md" },
    ]);
  });

  it("reports the correct line for a reference deeper in the document", () => {
    const refs = extractReferences("# Title\n\nintro\n\nSee [x](gone.md).\n");
    expect(refs).toEqual([{ kind: "link", line: 5, target: "gone.md" }]);
  });
});

describe("checkReferences", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "canon-ref-"));
  });
  afterEach(() => {
    rmSync(dir, { force: true, recursive: true });
  });

  it("passes when links and root-relative refs resolve", () => {
    mkdirSync(join(dir, "docs"));
    writeFileSync(join(dir, "docs", "a.md"), "# A\n");
    writeFileSync(join(dir, "index.md"), "[a](docs/a.md) and `docs/a.md`.\n");
    expect(checkReferences([join(dir, "index.md")], { repoRoot: dir })).toEqual(
      [],
    );
  });

  it("flags a broken link relative to the file", () => {
    const file = join(dir, "index.md");
    writeFileSync(file, "See [gone](docs/missing.md).\n");
    const issues = checkReferences([file], { repoRoot: dir });
    expect(issues).toEqual([
      { file, kind: "link", line: 1, target: "docs/missing.md" },
    ]);
  });

  it("flags a broken root-relative ref against the repo root", () => {
    const file = join(dir, "index.md");
    writeFileSync(file, "Use `docs/nope.md` please.\n");
    const issues = checkReferences([file], { repoRoot: dir });
    expect(issues).toEqual([
      { file, kind: "ref", line: 1, target: "docs/nope.md" },
    ]);
  });

  it("skips a ref matching an ignore substring", () => {
    const file = join(dir, "index.md");
    writeFileSync(file, "Cross-repo `ops/docs/x.md` link.\n");
    expect(
      checkReferences([file], { ignore: ["ops/"], repoRoot: dir }),
    ).toEqual([]);
    expect(checkReferences([file], { repoRoot: dir })).toHaveLength(1);
  });

  it("sorts issues by file, then line, then target", () => {
    const a = join(dir, "a.md");
    const b = join(dir, "b.md");
    writeFileSync(a, "line1 [z](z.md)\n\nline3 [y](y.md)\n");
    writeFileSync(b, "[x](x.md)\n");
    const issues = checkReferences([b, a], { repoRoot: dir });
    expect(
      issues.map((issue) => [issue.file, issue.line, issue.target]),
    ).toEqual([
      [a, 1, "z.md"],
      [a, 3, "y.md"],
      [b, 1, "x.md"],
    ]);
  });
});

describe("formatReferenceIssues", () => {
  it("labels each kind and returns empty for no issues", () => {
    expect(formatReferenceIssues([])).toBe("");
    const text = formatReferenceIssues([
      { file: "x.md", kind: "link", line: 2, target: "a.md" },
      { file: "x.md", kind: "ref", line: 5, target: "docs/b.md" },
    ]);
    expect(text).toBe(
      "x.md:2 broken link -> a.md\nx.md:5 broken root-relative ref -> docs/b.md",
    );
  });
});
