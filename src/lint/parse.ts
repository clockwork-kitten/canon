import type { Root } from "mdast";

import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";

/**
 * Parse Markdown to an mdast tree with GFM enabled, the studio's Markdown
 * flavour (tables, task lists, strikethrough, autolinks). Both the reference
 * checker and the `llms.txt` generator parse through this one helper so they
 * agree on document structure — e.g. a GFM table is a `table` node in both, not
 * an accidental paragraph.
 */
export function parseMarkdown(markdown: string): Root {
  return fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
}
