import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { visit } from "unist-util-visit";

import { parseMarkdown } from "./parse.ts";

/** Link URL prefixes that name something outside the repo — never resolved on disk. */
const EXTERNAL_PREFIXES = ["http://", "https://", "mailto:", "tel:"] as const;

/**
 * A backtick span that names a root-relative Markdown path (the CK-003 studio
 * convention, e.g. `docs/conventions.md`). Anchored so a span must be *only* a
 * path to qualify; prose in backticks is left alone.
 */
const CODE_REF_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_./-]*\.md$/;

/** Options controlling how references resolve to files on disk. */
export type CheckReferencesOptions = {
  /** Substrings marking a backtick path as external/cross-repo, so it is not resolved. */
  ignore?: readonly string[];
  /** Root that backtick root-relative (`ref`) paths resolve against. */
  repoRoot: string;
};

/** A cross-reference discovered in a Markdown document, before resolution. */
export type Reference = {
  /** `link` = clickable `](path)`, resolved relative to the file; `ref` = backtick root-relative path. */
  kind: "link" | "ref";
  /** 1-based line the reference starts on. */
  line: number;
  /** The reference target as authored (fragment already stripped for links). */
  target: string;
};

/** A reference that failed to resolve to a file on disk. */
export type ReferenceIssue = Reference & {
  /** File the broken reference appears in (as passed to {@link checkReferences}). */
  file: string;
};

/**
 * Check the internal cross-references of a set of Markdown files, returning a
 * flat, sorted list of the ones that do not resolve (empty means conformant).
 * Reads each file from disk; pure resolution logic lives in {@link isBroken}.
 */
export function checkReferences(
  files: readonly string[],
  options: CheckReferencesOptions,
): ReferenceIssue[] {
  const issues: ReferenceIssue[] = [];
  for (const file of files) {
    const markdown = readFileSync(file, "utf8");
    for (const reference of extractReferences(markdown)) {
      if (isBroken(reference, file, options)) {
        issues.push({ ...reference, file });
      }
    }
  }
  return issues.toSorted(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      a.target.localeCompare(b.target),
  );
}

/**
 * Extract the internal cross-references from a Markdown string using its mdast
 * tree — real `link`/`definition`/`inlineCode` nodes, so links inside code spans
 * are simply not links and there is no regex-and-blank-out heuristic.
 *
 * Two kinds are collected:
 * - **link**: clickable `](path.md)` (inline or reference-definition) whose
 *   target is an internal `.md` file. External and non-`.md` targets are skipped.
 * - **ref**: a backtick span that is exactly a root-relative `.md` path
 *   containing a `/` (a bare `` `file.md` `` is prose, not a path).
 */
export function extractReferences(markdown: string): Reference[] {
  const tree = parseMarkdown(markdown);
  const references: Reference[] = [];
  visit(tree, (node) => {
    if (node.type === "link" || node.type === "definition") {
      const target = (node.url ?? "").split("#", 1)[0] ?? "";
      if (!target || isExternal(target) || !target.endsWith(".md")) {
        return;
      }
      references.push({
        kind: "link",
        line: node.position?.start.line ?? 0,
        target,
      });
    } else if (node.type === "inlineCode") {
      const value = node.value;
      if (!CODE_REF_PATTERN.test(value) || !value.includes("/")) {
        return;
      }
      references.push({
        kind: "ref",
        line: node.position?.start.line ?? 0,
        target: value,
      });
    }
  });
  return references;
}

/**
 * Render reference issues as a readable multi-line report. Returns an empty
 * string when there are no issues.
 */
export function formatReferenceIssues(
  issues: readonly ReferenceIssue[],
): string {
  return issues
    .map((issue) => {
      const label =
        issue.kind === "link" ? "broken link" : "broken root-relative ref";
      return `${issue.file}:${issue.line} ${label} -> ${issue.target}`;
    })
    .join("\n");
}

function isBroken(
  reference: Reference,
  file: string,
  options: CheckReferencesOptions,
): boolean {
  if (reference.kind === "link") {
    const resolved = normalize(join(dirname(file), reference.target));
    return !existsSync(resolved);
  }
  if (
    (options.ignore ?? []).some((substring) =>
      reference.target.includes(substring),
    )
  ) {
    return false;
  }
  return !existsSync(join(options.repoRoot, reference.target));
}

function isExternal(url: string): boolean {
  return EXTERNAL_PREFIXES.some((prefix) => url.startsWith(prefix));
}
