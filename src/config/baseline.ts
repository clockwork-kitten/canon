import type { MarkdownlintConfig } from "./types.ts";

/**
 * The studio markdownlint baseline — GitHub Flavored Markdown, intentionally
 * relaxed. This is the single in-code source of truth for the studio standard;
 * the repo-root `.markdownlint.jsonc` mirrors it for the v0.1 reusable workflow,
 * and `baseline.test.ts` fails if the two drift.
 *
 * Rationale and full conventions: clockwork-kitten/ops docs/CONVENTIONS.md
 * (CK-003).
 */
export const STUDIO_MARKDOWNLINT_BASELINE: MarkdownlintConfig = {
  // Every rule on by default; the entries below relax specific rules.
  default: true,
  // Prose wraps naturally / long reference lines are fine in a docs repo.
  MD013: false,
  // Decision logs and roadmaps legitimately repeat headings across entries.
  MD024: { siblings_only: true },
  // Ordered lists: allow 1. 1. 1. or 1. 2. 3.
  MD029: { style: "one_or_ordered" },
  // We author in GFM; allow raw HTML if a doc ever needs it.
  MD033: false,
  // Allow both fenced and indented where convenient; enforce fenced default.
  MD046: { style: "fenced" },
};
