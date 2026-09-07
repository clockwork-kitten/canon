import { type ParseError, parse as parseJsonc } from "jsonc-parser";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type {
  CanonConfig,
  MarkdownlintConfig,
  ReferencesConfig,
} from "./types.ts";

import { STUDIO_MARKDOWNLINT_BASELINE } from "./baseline.ts";
import { deepMerge, isPlainObject, type PlainObject } from "./merge.ts";

/** Raised when a config file exists but cannot be loaded or parsed. */
export class ConfigError extends Error {
  override name = "ConfigError";
}

/** Config filenames tried at a repo root, in precedence order. */
export const CONFIG_FILENAMES = [
  "canon.config.ts",
  "canon.config.mts",
  "canon.config.mjs",
  "canon.config.js",
  "canon.config.jsonc",
  "canon.config.json",
] as const;

/** The effective configuration for a run, plus where it came from. */
export type ResolvedConfig = {
  /** The `llms.txt` generator config, or `undefined` when the repo declares none. */
  llms: ResolvedLlmsConfig | undefined;
  markdownlint: MarkdownlintConfig;
  references: ResolvedReferencesConfig;
  /** Human-readable description of the config source, for logging. */
  source: string;
};

/** The `llms.txt` generator settings for a run, with defaults applied. */
export type ResolvedLlmsConfig = {
  output: string;
  project: string;
  sections: ResolvedLlmsSection[];
  summary: string;
};

/** A section of the `llms.txt` index with defaults applied. */
export type ResolvedLlmsSection = {
  prefix: string;
  shallow: boolean;
  title: string;
};

/** The reference-checker settings for a run, with defaults applied. */
export type ResolvedReferencesConfig = Required<ReferencesConfig>;

/**
 * Compute the effective markdownlint config from a loaded canon config.
 *
 * Unless `extends` is `false`, the config's `markdownlint` overrides are
 * deep-merged over the studio baseline so a repo can adjust one rule without
 * re-declaring the whole baseline. This is pure — the linter and the structural
 * operations consume exactly this object.
 */
export function resolveMarkdownlintConfig(
  config: CanonConfig,
): MarkdownlintConfig {
  const overrides = (config.markdownlint ?? {}) as PlainObject;
  if (config.extends === false) {
    return { ...overrides } as MarkdownlintConfig;
  }
  return deepMerge(
    STUDIO_MARKDOWNLINT_BASELINE as PlainObject,
    overrides,
  ) as MarkdownlintConfig;
}

/**
 * Compute the effective reference-checker settings from a loaded canon config.
 * The checker has no studio baseline, so this only fills defaults; `ignore`
 * defaults to empty (resolve every internal reference).
 */
export function resolveReferencesConfig(
  config: CanonConfig,
): ResolvedReferencesConfig {
  return { ignore: [...(config.references?.ignore ?? [])] };
}

/** Default output path for the generated doc index. */
export const DEFAULT_LLMS_OUTPUT = "llms.txt";

/**
 * Find the first existing config file at `cwd`, or `undefined` if none.
 */
export function discoverConfigPath(cwd: string): string | undefined {
  for (const name of CONFIG_FILENAMES) {
    const candidate = resolve(cwd, name);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Load and parse a single canon config file. Throws {@link ConfigError} if the
 * file cannot be imported/parsed or does not export a config object.
 */
export async function loadConfigFile(path: string): Promise<CanonConfig> {
  if (/\.jsonc?$/.test(path)) {
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch (error) {
      throw new ConfigError(`Could not read config file: ${path}`, {
        cause: error,
      });
    }
    const errors: ParseError[] = [];
    const parsed: unknown = parseJsonc(text, errors, {
      allowTrailingComma: true,
    });
    if (errors.length > 0) {
      throw new ConfigError(`Invalid JSONC in config file: ${path}`);
    }
    if (!isConfigModule(parsed)) {
      throw new ConfigError(`Config file must contain an object: ${path}`);
    }
    return parsed;
  }

  let mod: { default?: unknown };
  try {
    mod = (await import(pathToFileURL(path).href)) as { default?: unknown };
  } catch (error) {
    throw new ConfigError(`Could not import config file: ${path}`, {
      cause: error,
    });
  }
  const candidate = mod.default ?? mod;
  if (!isConfigModule(candidate)) {
    throw new ConfigError(`Config file must export a config object: ${path}`);
  }
  return candidate;
}

/**
 * Resolve the effective config for a run: an explicit `configPath` wins,
 * otherwise the first `canon.config.*` found at `cwd`, otherwise the bundled
 * studio baseline. Throws {@link ConfigError} only when a config file is present
 * but broken.
 */
export async function resolveConfig(options: {
  configPath?: string | undefined;
  cwd: string;
}): Promise<ResolvedConfig> {
  const { configPath, cwd } = options;
  const path = configPath
    ? isAbsolute(configPath)
      ? configPath
      : resolve(cwd, configPath)
    : discoverConfigPath(cwd);

  if (!path) {
    return {
      llms: undefined,
      markdownlint: { ...STUDIO_MARKDOWNLINT_BASELINE },
      references: { ignore: [] },
      source: "studio baseline (no config file found)",
    };
  }

  const config = await loadConfigFile(path);
  return {
    llms: resolveLlmsConfig(config),
    markdownlint: resolveMarkdownlintConfig(config),
    references: resolveReferencesConfig(config),
    source: path,
  };
}

/**
 * Compute the effective `llms.txt` generator settings, or `undefined` when the
 * config declares no `llms` block. Applies section defaults (`prefix` → `""`,
 * `shallow` → `false`) and the default output path.
 */
export function resolveLlmsConfig(
  config: CanonConfig,
): ResolvedLlmsConfig | undefined {
  const llms = config.llms;
  if (!llms) {
    return undefined;
  }
  return {
    output: llms.output ?? DEFAULT_LLMS_OUTPUT,
    project: llms.project,
    sections: llms.sections.map((section) => ({
      prefix: section.prefix ?? "",
      shallow: section.shallow ?? false,
      title: section.title,
    })),
    summary: llms.summary,
  };
}

function isConfigModule(value: unknown): value is CanonConfig {
  return isPlainObject(value);
}
