import { toString } from "mdast-util-to-string";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

import type {
  ResolvedLlmsConfig,
  ResolvedLlmsSection,
} from "../config/resolve.ts";

import { parseMarkdown } from "../lint/parse.ts";

/** Title and one-line description distilled from a single document. */
export type DocMeta = {
  /** The document's first paragraph, flattened to a single line (may be empty). */
  description: string;
  /** Repo-relative posix path, used as both sort key and link target. */
  path: string;
  /** The document's first level-1 heading, or its filename as a fallback. */
  title: string;
};

/**
 * Distil a document's title and one-line description from its mdast tree: the
 * title is the first level-1 heading; the description is the first paragraph
 * that follows it, flattened to plain text (links reduced to their text, inline
 * formatting dropped). Non-paragraph blocks (blockquotes, tables, lists, code)
 * between the heading and the first paragraph are skipped. Working on real nodes
 * avoids the line-prefix heuristics the shell generator needed.
 */
export function extractDocMeta(
  markdown: string,
  fallbackTitle: string,
): { description: string; title: string } {
  const tree = parseMarkdown(markdown);
  let title = "";
  let description = "";
  let isSeenTitle = false;
  for (const node of tree.children) {
    if (!isSeenTitle) {
      if (node.type === "heading" && node.depth === 1) {
        title = toString(node).trim();
        isSeenTitle = true;
      }
      continue;
    }
    if (node.type === "paragraph") {
      description = collapseWhitespace(toString(node));
      break;
    }
  }
  return { description, title: title || fallbackTitle };
}

/**
 * Build the `llms.txt` content for a repo: read each file, distil its metadata,
 * and render against the config. `files` are repo-relative posix paths; they are
 * sorted here so output does not depend on discovery order. `readFile` is
 * injectable for testing.
 */
export function generateLlms(
  files: readonly string[],
  config: ResolvedLlmsConfig,
  readFile: (path: string) => string = (path) => readFileSync(path, "utf8"),
): string {
  const docs: DocMeta[] = [...files]
    .toSorted((a, b) => a.localeCompare(b))
    .map((path) => {
      const { description, title } = extractDocMeta(
        readFile(path),
        basename(path),
      );
      return { description, path, title };
    });
  return renderLlms(docs, config);
}

/**
 * Render the `llms.txt` body from a set of documents and a resolved config,
 * following the https://llmstxt.org/ convention: an `# H1` project title, a
 * `>` summary, then one `##` section per configured group. A document joins the
 * first section it matches (so ordering is significant); documents matching no
 * section are omitted. Output is deterministic given sorted input.
 */
export function renderLlms(
  docs: readonly DocMeta[],
  config: ResolvedLlmsConfig,
): string {
  const lines: string[] = [
    `# ${config.project}`,
    "",
    `> ${config.summary}`,
    "",
  ];
  const used = new Set<string>();
  for (const section of config.sections) {
    const matched = docs.filter(
      (doc) => !used.has(doc.path) && isInSection(doc.path, section),
    );
    if (matched.length === 0) {
      continue;
    }
    lines.push(`## ${section.title}`, "");
    for (const doc of matched) {
      used.add(doc.path);
      const entry = `- [${doc.title}](${doc.path})`;
      lines.push(doc.description ? `${entry}: ${doc.description}` : entry);
    }
    lines.push("");
  }
  return `${lines.join("\n").replace(/\s+$/, "")}\n`;
}

function collapseWhitespace(text: string): string {
  return text.split(/\s+/).filter(Boolean).join(" ");
}

function isInSection(path: string, section: ResolvedLlmsSection): boolean {
  if (!path.startsWith(section.prefix)) {
    return false;
  }
  if (section.shallow && path.slice(section.prefix.length).includes("/")) {
    return false;
  }
  return true;
}
