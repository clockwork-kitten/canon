#!/usr/bin/env bun
import { existsSync, globSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";

import { ConfigError, resolveConfig } from "../config/resolve.ts";
import { fixContents, formatIssues, lintFiles } from "../lint/markdown.ts";
import { checkReferences, formatReferenceIssues } from "../lint/references.ts";
import { generateLlms } from "../ops/llms.ts";

/** Directory names never descended into when expanding globs. */
export const IGNORE_DIRS = new Set([".git", ".canon", "node_modules"]);

/** Default glob when the user passes no positional patterns. */
export const DEFAULT_GLOBS = ["**/*.md"] as const;

const USAGE =
  "usage: canon check [globs...] [--config <path>] [--no-references] [--reference-ignore <substr>]";

/** Parsed arguments for `canon check`. */
export type CheckArgs = {
  configPath: string | undefined;
  globs: string[];
  /** Extra ignore substrings for the reference checker, added to config. */
  referenceIgnore: string[];
  /** Whether to run the internal cross-reference checker (default true). */
  references: boolean;
};

/** Expand globs relative to `cwd`, dropping ignored directories. Sorted, unique. */
export function expandGlobs(globs: string[], cwd: string): string[] {
  const found = new Set<string>();
  for (const pattern of globs) {
    const matches = globSync(pattern, { cwd });
    for (const relative of matches) {
      const normalized = relative.replaceAll("\\", "/");
      const segments = normalized.split("/");
      if (segments.every((segment) => !IGNORE_DIRS.has(segment))) {
        found.add(normalized);
      }
    }
  }
  return [...found].toSorted();
}

/**
 * Parse the arguments to `canon check`. Positional args are globs (defaulting
 * to `**\/*.md`); `--config`/`-c` selects a config file; `--no-references`
 * disables the reference checker; `--reference-ignore` (repeatable) adds ignore
 * substrings. Throws on unknown flags or a missing option value.
 */
export function parseCheckArgs(argv: string[]): CheckArgs {
  const globs: string[] = [];
  let configPath: string | undefined;
  let isReferences = true;
  const referenceIgnore: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;
    if (arg === "--config" || arg === "-c") {
      const next = argv[index + 1];
      if (next === undefined) {
        throw new Error(`${arg} requires a path`);
      }
      configPath = next;
      index += 1;
    } else if (arg.startsWith("--config=")) {
      configPath = arg.slice("--config=".length);
    } else if (arg === "--no-references") {
      isReferences = false;
    } else if (arg === "--reference-ignore") {
      const next = argv[index + 1];
      if (next === undefined) {
        throw new Error(`${arg} requires a substring`);
      }
      referenceIgnore.push(next);
      index += 1;
    } else if (arg.startsWith("--reference-ignore=")) {
      referenceIgnore.push(arg.slice("--reference-ignore=".length));
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown option: ${arg}`);
    } else {
      globs.push(arg);
    }
  }
  return {
    configPath,
    globs: globs.length > 0 ? globs : [...DEFAULT_GLOBS],
    referenceIgnore,
    references: isReferences,
  };
}

/** Run `canon check`; returns a process exit code. */
export async function runCheck(argv: string[], cwd: string): Promise<number> {
  let args: CheckArgs;
  try {
    args = parseCheckArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(USAGE);
    return 2;
  }

  let resolved;
  try {
    resolved = await resolveConfig({ configPath: args.configPath, cwd });
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      return 2;
    }
    throw error;
  }

  const files = expandGlobs(args.globs, cwd);
  // markdownlint reads files relative to process.cwd(); pass absolute paths so
  // a caller-supplied cwd is honored, then relativize findings for display.
  const absolute = files.map((file) => join(cwd, file));
  const found = await lintFiles(absolute, resolved.markdownlint);
  const issues = found.map((issue) => ({
    ...issue,
    file: relative(cwd, issue.file),
  }));

  console.error(`canon check · markdown lint · ${resolved.source}`);
  let exitCode = 0;
  if (issues.length > 0) {
    console.error(formatIssues(issues));
    console.error(`\n${issues.length} issue(s) across ${files.length} file(s)`);
    exitCode = 1;
  } else {
    console.error(`${files.length} file(s) conformant`);
  }

  if (args.references) {
    const ignore = [...resolved.references.ignore, ...args.referenceIgnore];
    const refIssues = checkReferences(absolute, { ignore, repoRoot: cwd }).map(
      (issue) => ({
        ...issue,
        file: relative(cwd, issue.file),
      }),
    );
    console.error(`canon check · references · ${resolved.source}`);
    if (refIssues.length > 0) {
      console.error(formatReferenceIssues(refIssues));
      console.error(
        `\n${refIssues.length} broken reference(s) across ${files.length} file(s)`,
      );
      exitCode = 1;
    } else {
      console.error(`${files.length} file(s) with resolvable references`);
    }
  }

  return exitCode;
}

const FIX_USAGE = "usage: canon fix [globs...] [--config <path>] [--no-llms]";

/** Parsed arguments for `canon fix`. */
export type FixArgs = {
  configPath: string | undefined;
  globs: string[];
  /** Whether to also regenerate the `llms.txt` index (default true). */
  llms: boolean;
};

/**
 * Parse the arguments to `canon fix`. Positional args are globs (defaulting to
 * `**\/*.md`); `--config`/`-c` selects a config file; `--no-llms` skips the
 * `llms.txt` regeneration that otherwise runs after the markdown autofix. Throws
 * on unknown flags or a missing option value.
 */
export function parseFixArgs(argv: string[]): FixArgs {
  const globs: string[] = [];
  let configPath: string | undefined;
  let isLlms = true;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;
    if (arg === "--config" || arg === "-c") {
      const next = argv[index + 1];
      if (next === undefined) {
        throw new Error(`${arg} requires a path`);
      }
      configPath = next;
      index += 1;
    } else if (arg.startsWith("--config=")) {
      configPath = arg.slice("--config=".length);
    } else if (arg === "--no-llms") {
      isLlms = false;
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown option: ${arg}`);
    } else {
      globs.push(arg);
    }
  }
  return {
    configPath,
    globs: globs.length > 0 ? globs : [...DEFAULT_GLOBS],
    llms: isLlms,
  };
}

/**
 * Run `canon fix`; returns a process exit code. Autofixes fixable markdown
 * rules in place, then (unless `--no-llms`) regenerates `llms.txt` so the tree
 * self-heals in one command. Reports any unfixable residue but does not fail on
 * it — `fix` is authoring-time and `check` stays the failing gate, so CI never
 * runs `fix`. Returns 2 only on an argument or config error.
 */
export async function runFix(argv: string[], cwd: string): Promise<number> {
  let args: FixArgs;
  try {
    args = parseFixArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(FIX_USAGE);
    return 2;
  }

  let resolved;
  try {
    resolved = await resolveConfig({ configPath: args.configPath, cwd });
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      return 2;
    }
    throw error;
  }

  const files = expandGlobs(args.globs, cwd);
  const contents: Record<string, string> = {};
  for (const file of files) {
    contents[file] = readFileSync(join(cwd, file), "utf8");
  }

  const fixes = await fixContents(contents, resolved.markdownlint);
  console.error(`canon fix · markdown · ${resolved.source}`);

  const changed = fixes.filter((fix) => fix.changed);
  for (const fix of changed) {
    writeFileSync(join(cwd, fix.file), fix.content);
  }
  if (changed.length > 0) {
    console.error(`fixed ${changed.length} file(s):`);
    for (const fix of changed) {
      console.error(`  ${fix.file}`);
    }
  } else {
    console.error(`${files.length} file(s) already conformant`);
  }

  const residue = fixes.flatMap((fix) => fix.residue);
  if (residue.length > 0) {
    console.error(
      `\n${residue.length} issue(s) fix cannot resolve — run \`canon check\` and fix by hand:`,
    );
    console.error(formatIssues(residue));
  }

  if (args.llms && resolved.llms) {
    const content = generateLlms(files, resolved.llms, (file) =>
      readFileSync(join(cwd, file), "utf8"),
    );
    const outPath = join(cwd, resolved.llms.output);
    const outLabel = relative(cwd, outPath);
    const current = existsSync(outPath) ? readFileSync(outPath, "utf8") : "";
    if (current === content) {
      console.error(`canon fix · llms · ${outLabel} already up to date`);
    } else {
      writeFileSync(outPath, content);
      console.error(
        `canon fix · llms · wrote ${outLabel} (${content.length} bytes)`,
      );
    }
  }

  return 0;
}

const LLMS_USAGE = "usage: canon llms [globs...] [--config <path>] [--check]";

/** Parsed arguments for `canon llms`. */
export type LlmsArgs = {
  /** Verify the on-disk index matches, rather than writing it. */
  check: boolean;
  configPath: string | undefined;
  globs: string[];
};

/**
 * Parse the arguments to `canon llms`. Positional args are globs (defaulting
 * to `**\/*.md`); `--config`/`-c` selects a config file; `--check` verifies the
 * committed index instead of writing it. Throws on unknown flags or a missing
 * `--config` value.
 */
export function parseLlmsArgs(argv: string[]): LlmsArgs {
  const globs: string[] = [];
  let configPath: string | undefined;
  let isCheck = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;
    if (arg === "--config" || arg === "-c") {
      const next = argv[index + 1];
      if (next === undefined) {
        throw new Error(`${arg} requires a path`);
      }
      configPath = next;
      index += 1;
    } else if (arg.startsWith("--config=")) {
      configPath = arg.slice("--config=".length);
    } else if (arg === "--check") {
      isCheck = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown option: ${arg}`);
    } else {
      globs.push(arg);
    }
  }
  return {
    check: isCheck,
    configPath,
    globs: globs.length > 0 ? globs : [...DEFAULT_GLOBS],
  };
}

/** Run `canon llms`; returns a process exit code. */
export async function runLlms(argv: string[], cwd: string): Promise<number> {
  let args: LlmsArgs;
  try {
    args = parseLlmsArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(LLMS_USAGE);
    return 2;
  }

  let resolved;
  try {
    resolved = await resolveConfig({ configPath: args.configPath, cwd });
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      return 2;
    }
    throw error;
  }

  if (!resolved.llms) {
    console.error(`canon llms · no \`llms\` config found · ${resolved.source}`);
    console.error(
      "Add an `llms` block to your canon config to generate a doc index.",
    );
    return 2;
  }

  const files = expandGlobs(args.globs, cwd);
  const content = generateLlms(files, resolved.llms, (file) =>
    readFileSync(join(cwd, file), "utf8"),
  );
  const outPath = join(cwd, resolved.llms.output);
  const outLabel = relative(cwd, outPath);

  if (args.check) {
    const current = existsSync(outPath) ? readFileSync(outPath, "utf8") : "";
    if (current !== content) {
      console.error(
        `canon llms · ${outLabel} is out of date · run \`canon llms\` to regenerate`,
      );
      return 1;
    }
    console.error(`canon llms · ${outLabel} is up to date`);
    return 0;
  }

  writeFileSync(outPath, content);
  console.error(`canon llms · wrote ${outLabel} (${content.length} bytes)`);
  return 0;
}

async function main(): Promise<number> {
  const [subcommand, ...rest] = process.argv.slice(2);
  if (subcommand === "check") {
    return runCheck(rest, process.cwd());
  }
  if (subcommand === "fix") {
    return runFix(rest, process.cwd());
  }
  if (subcommand === "llms") {
    return runLlms(rest, process.cwd());
  }
  console.error(USAGE);
  console.error(FIX_USAGE);
  console.error(LLMS_USAGE);
  return 2;
}

// Only run when executed directly (e.g. `bun src/cli/main.ts`), not when
// imported by tests. `import.meta.main` is a Bun/Node entrypoint signal.
if ((import.meta as { main?: boolean }).main) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
