import type { DecisionRecord } from "./project.ts";

/**
 * Renderers turn projected state into the committed, human/AI-facing artifacts:
 * one Markdown file per record, a decisions index, and a `graph.json` manifest
 * (the machine-readable records+edges view every future AI feature reads). All
 * output is a pure function of the records and therefore byte-deterministic,
 * which is what lets the CI "regenerate-and-diff" gate treat any drift as a
 * hand-edit of generated truth.
 */

/** Directory (repo-relative) the projection writes into. */
export const OUTPUT_DIR = "decisions";

/** Path (repo-relative) of the machine-readable graph manifest. */
export const GRAPH_PATH = "graph.json";

/** One rendered artifact: a repo-relative path and its full content. */
export type RenderedFile = {
  content: string;
  path: string;
};

function metaLine(label: string, value: string): string {
  return `- ${label}: ${value}`;
}

/** Render a single decision record as a conformant Markdown document. */
export function renderDecision(record: DecisionRecord): string {
  const meta: string[] = [
    metaLine("Status", record.status),
    metaLine("Author", record.actor),
    metaLine("Date", record.ts),
  ];
  if (record.supersedes) {
    meta.push(metaLine("Supersedes", `[${record.supersedes}](${record.supersedes}.md)`));
  }
  if (record.supersededBy) {
    meta.push(
      metaLine("Superseded by", `[${record.supersededBy}](${record.supersededBy}.md)`),
    );
  }
  const body = record.body.trim();
  const lines = [`# ${record.display} · ${record.title}`, "", ...meta, ""];
  if (body) {
    lines.push(body, "");
  }
  return `${lines.join("\n").replace(/\s+$/, "")}\n`;
}

/** Render the decisions index listing every record in commit order. */
export function renderIndex(records: readonly DecisionRecord[]): string {
  const lines = ["# Decisions", ""];
  if (records.length === 0) {
    lines.push("_No decisions recorded yet._");
  } else {
    for (const record of records) {
      const suffix = record.status === "superseded" ? " — superseded" : "";
      lines.push(`- [${record.display} ${record.title}](${record.display}.md)${suffix}`);
    }
  }
  return `${lines.join("\n").replace(/\s+$/, "")}\n`;
}

/**
 * Render the `graph.json` manifest: records as nodes plus `supersedes` edges,
 * with object keys emitted in a fixed order so the serialization is stable.
 */
export function renderGraph(records: readonly DecisionRecord[]): string {
  const nodes = records.map((record) => ({
    display: record.display,
    id: record.id,
    status: record.status,
    title: record.title,
    type: record.type,
  }));
  const edges = records
    .filter((record) => record.supersedes)
    .map((record) => ({
      from: record.display,
      to: record.supersedes as string,
      type: "supersedes",
    }));
  return `${JSON.stringify({ edges, nodes }, undefined, 2)}\n`;
}

/**
 * Render the full projection: one file per decision, the index, and the graph
 * manifest, as repo-relative paths under {@link OUTPUT_DIR}. Deterministic and
 * self-contained — the caller only has to write these paths verbatim.
 */
export function renderProjection(records: readonly DecisionRecord[]): RenderedFile[] {
  const files: RenderedFile[] = records.map((record) => ({
    content: renderDecision(record),
    path: `${OUTPUT_DIR}/${record.display}.md`,
  }));
  files.push({ content: renderIndex(records), path: `${OUTPUT_DIR}/index.md` });
  files.push({ content: renderGraph(records), path: GRAPH_PATH });
  return [...files].sort((a, b) => a.path.localeCompare(b.path));
}
