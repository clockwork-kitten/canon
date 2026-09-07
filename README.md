# canon

Standalone **documentation-repo conformance** tool for the clockwork-kitten studio: markdown lint,
reference integrity, and `llms.txt` generation over one pinned mdast/GFM parser and one config —
with schema-aware entry operations and cross-repo intake to come.

`canon` runs on any documentation repo by itself, and is invoked by
[`conform`](https://github.com/clockwork-kitten/standards) as one tool in the studio's global check
(alongside `bedrock` and the code toolchain).

> Extracted from `clockwork-kitten/standards` (the `@clockwork-kitten/conform` engine). Scaffolding
> in progress — see the repo roadmap.
