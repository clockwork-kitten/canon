import type { Configuration } from "markdownlint";

/**
 * A `canon` configuration, as authored in `canon.config.ts` or
 * `canon.config.jsonc` at a documentation repo's root.
 *
 * Carries markdown-lint settings, reference-checker settings, and the optional
 * `llms.txt` generator config. The linter and the structural operations read
 * the *same* resolved config object and the *same* pinned mdast/GFM parser, so a
 * precondition can't drift from its postcondition — canon's core guarantee.
 */
export type CanonConfig = {
  /**
   * Whether to layer this config on top of the bundled studio baseline.
   * Defaults to `true` (deep-merge over the baseline). Set to `false` to use
   * only the settings declared here.
   */
  extends?: boolean;
  /** `llms.txt` generator settings (per-repo; required to run `canon llms`). */
  llms?: LlmsConfig;
  /** markdownlint rule overrides, deep-merged over the studio baseline. */
  markdownlint?: MarkdownlintConfig;
  /** Internal cross-reference checker settings. */
  references?: ReferencesConfig;
};

/**
 * Configuration for `canon llms`, which generates an `llms.txt` doc index
 * (https://llmstxt.org/). All fields are per-repo, so this block only makes
 * sense in a repo's own `canon.config.*`.
 */
export type LlmsConfig = {
  /** Output path relative to the repo root. Defaults to `llms.txt`. */
  output?: string;
  /** Project title rendered as the `# ` heading. */
  project: string;
  /** Ordered sections; a document joins the first whose prefix it matches. */
  sections: LlmsSection[];
  /** One-line summary rendered as the `> ` blockquote. */
  summary: string;
};

/** One section of the generated `llms.txt`, matched by path prefix. */
export type LlmsSection = {
  /**
   * Repo-relative posix path prefix a document must start with to join this
   * section. Defaults to `""` (match any path). Documents join the first
   * section they match, so order sections most-specific-last if prefixes nest.
   */
  prefix?: string;
  /**
   * When true, only documents *directly* under `prefix` match — a document
   * with any further `/` in its path is left for a later section. Use this to
   * keep a top-level group from swallowing nested docs.
   */
  shallow?: boolean;
  /** Heading rendered for this group (the `##` line). */
  title: string;
};

/**
 * The markdownlint rule configuration a canon config can carry. Mirrors the
 * shape of a `.markdownlint.jsonc` file (see the studio baseline).
 */
export type MarkdownlintConfig = Configuration;

/** Configuration for the internal cross-reference checker. */
export type ReferencesConfig = {
  /**
   * Substrings marking a backtick root-relative path as external/cross-repo:
   * any `` `path.md` `` containing one is not resolved on disk. Use this for
   * paths that live in another repo (e.g. `ops/docs/`).
   */
  ignore?: string[];
};

/**
 * Identity helper giving repo authors type-checking and editor completion when
 * writing a `canon.config.ts`.
 */
export function defineConfig(config: CanonConfig): CanonConfig {
  return config;
}
