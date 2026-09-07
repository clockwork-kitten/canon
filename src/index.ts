/**
 * Public API of the clockwork-kitten canon doc-conformance tool.
 *
 * Exposes config resolution, the markdown-lint runner, the reference checker,
 * and the `llms.txt` generator — all sharing the single pinned mdast/GFM parser
 * and the single resolved config object in-process.
 */
export { STUDIO_MARKDOWNLINT_BASELINE } from "./config/baseline.ts";
export { deepMerge, isPlainObject, type PlainObject } from "./config/merge.ts";
export {
  CONFIG_FILENAMES,
  ConfigError,
  DEFAULT_LLMS_OUTPUT,
  discoverConfigPath,
  loadConfigFile,
  resolveConfig,
  type ResolvedConfig,
  type ResolvedLlmsConfig,
  type ResolvedLlmsSection,
  type ResolvedReferencesConfig,
  resolveLlmsConfig,
  resolveMarkdownlintConfig,
  resolveReferencesConfig,
} from "./config/resolve.ts";
export {
  type CanonConfig,
  defineConfig,
  type LlmsConfig,
  type LlmsSection,
  type MarkdownlintConfig,
  type ReferencesConfig,
} from "./config/types.ts";
export {
  fixContents,
  type FixResult,
  formatIssues,
  lintContent,
  lintFiles,
  type LintIssue,
} from "./lint/markdown.ts";
export {
  checkReferences,
  type CheckReferencesOptions,
  extractReferences,
  formatReferenceIssues,
  type Reference,
  type ReferenceIssue,
} from "./lint/references.ts";
export {
  type DocMeta,
  extractDocMeta,
  generateLlms,
  renderLlms,
} from "./ops/llms.ts";
