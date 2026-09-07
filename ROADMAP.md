# Roadmap — canon

The sequenced plan for `canon`, the studio's standalone documentation-repo
conformance tool. Status: ☐ todo · ◐ in progress · ☑ done · ⏸ deferred. Order is
about **dependencies**, not urgency.

`canon` was extracted from `clockwork-kitten/standards` (the
`@clockwork-kitten/conform` engine) at the standards roadmap's v0.6. It owns the
pinned mdast/GFM parser and every doc-structural operation in-process, keeping
the one-parser/one-config guarantee inside canon. `conform` invokes it as one
opaque tool; any pure-documentation repo can adopt `canon` alone.

## v0.1 — Extract and stand up canon

Move the documentation surface out of `standards` into an independent,
self-standing tool with its own parser, config, CLI, tests, CI, and release line.
Fresh git history; the code track is deliberately left behind in `conform`.

| # | Task | Status | Notes |
| --- | --- | --- | --- |
| 1 | Package skeleton (`@clockwork-kitten/canon`, `bin: canon`) | ☑ | TS/Bun; lean runtime deps (markdownlint + the mdast/remark stack); own `tsconfig`, `vitest` (≥80% coverage) |
| 2 | Extract the doc surface | ☑ | Pinned mdast/GFM parser, markdownlint runner (incl. `fix`/`applyFixes`), reference-integrity checker, `llms.txt` generator, deep-merge config machinery |
| 3 | Own config, CLI, and config discovery | ☑ | `canon.config.*` via `defineConfig`; `canon check` / `canon fix` / `canon llms [--check]`; studio markdownlint baseline as default with per-repo deep-merge override |
| 4 | Dogfood canon on itself | ☑ | canon's own markdown passes `canon check`; generates its own `llms.txt`; in-code baseline mirrored by `.markdownlint.jsonc` with a parity test |
| 5 | CI + release scaffolding | ☑ | `ci` workflow: typecheck + tests + `canon check` + `canon llms --check`; `release` workflow present (human-triggered, not yet run). Scaffolded to `v0.1.0`-ready |

## v0.2 — Schema-aware entry operations + cross-repo intake

Typed, schema-aware entry operations agents call instead of splicing prose — the
doc tool's original structural contribution — plus a standardized way to propose
a schema-valid entry into *another* repo, gated behind the checks that guarantee
the invariants. Carried over from the standards roadmap's v0.7.

| # | Task | Status | Notes |
| --- | --- | --- | --- |
| 1 | Per-document schemas in `canon.config` (`ideas`, `decisions`, `roadmap`) | ☐ | The same config the linter consumes; shape = `## I-NNN`, monotonic IDs, one separator |
| 2 | `entry delete` / `add` / `move` / `renumber` positional splices | ☐ | Re-lint against the same schema as postcondition; idempotency tested (apply twice, diff must be empty) |
| 3 | Cross-repo intake: producer (`entry add --repo`) + receiver (`entry-intake.yml`) | ☐ | Opens a PR, never direct-commits — preserves the human-merge gate |
| 4 | Surface decision: a CLI and/or an MCP tool for agents | ☐ | Answers the original open question |

## Follow-ups

- **Integrate full code standards on canon itself.** canon's CI is intentionally
  dogfood-only for now (typecheck + tests + `canon check` + `canon llms --check`);
  it cannot run the studio code track on its own source until `conform` is
  disentangled into the orchestrator that bundles the code toolchain. Add the
  full ESLint/Prettier/knip baseline to canon's CI once that lands.

## Release & versioning

- canon is published to npm as `@clockwork-kitten/canon` (public scoped package).
  It runs its TypeScript directly under Bun, so the published package ships source
  — no build/`dist` step — and the `canon` bin resolves without compilation.
- Consume it as a normal dependency: `bun add @clockwork-kitten/canon` (or pinned,
  e.g. `@0.1.0`). `conform` depends on it this way.
- Semantic-ish tags; breaking changes to a config's rules or the CLI bump the
  major. Consuming repos pin to a version and upgrade deliberately.
- The `release` workflow (human-triggered `workflow_dispatch`) validates the
  version, verifies CI is green, tags, publishes a GitHub Release, moves the
  major-line alias, and publishes to npm. The npm publish is gated on an
  `NPM_TOKEN` repo secret — absent it, the tag/Release still succeed and publish
  no-ops.
- **No release is cut yet.** canon is scaffolded to `v0.1.0`-ready and push-button;
  cutting the tag is a deliberate, human-approved step.

## Open items

- **License choice.** Currently `LICENSE` is MIT (inherited from `standards`).
  Reconsider **Apache-2.0** (patent grant) if/when canon is commercialized.
