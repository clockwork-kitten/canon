import { defineConfig } from "./src/index.ts";

// canon dogfoods its own doc-conformance tooling. This config exercises config
// discovery, the `defineConfig` authoring API, and the `llms.txt` generator —
// all over the single pinned mdast/GFM parser and this one resolved config
// object, the guarantee canon exists to keep.
export default defineConfig({
  // canon tracks the studio markdownlint baseline exactly, so there are no
  // markdownlint overrides here (the in-code baseline applies as-is).

  // `canon llms` generates llms.txt (https://llmstxt.org/) — canon dogfooding
  // its own doc-index generator. Sections match by path prefix; a doc joins the
  // first it matches.
  llms: {
    project: "Clockwork Kitten — canon",
    sections: [{ prefix: "", title: "Documentation" }],
    summary:
      "Standalone documentation-repo conformance for the clockwork-kitten studio: markdown lint, reference integrity, and llms.txt generation over one pinned mdast/GFM parser and one config.",
  },
  // The reference checker resolves internal cross-references on disk. canon's
  // own docs cite only external URLs, so no cross-repo ignores are needed yet.
  references: {},
});
