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

## v0.2 — Event-sourced decision log (MVS)

The single-source-of-truth reframe: truth is an **append-only event log**, and
every doc is a **deterministic projection** of it (like a compacted Kafka topic
reconstructing a table). Capture is conflict-free; a single serialized *drain*
(the "elected leader") assigns IDs, so concurrent authors never race. This is the
smallest slice that proves the model end-to-end; the schema-aware entry ops below
become the expansion path (more record types, cross-repo intake) on this
substrate rather than a parallel design.

| # | Task | Status | Notes |
| --- | --- | --- | --- |
| 1 | Log primitives: intake + event types, content-addressed IDs | ☑ | `src/log/events.ts`; opaque sha256 canonical id (nonce-seeded) + stable per-type `DEC-000N` display id; `schemaVersion` stamped on every event |
| 2 | The drain (single-writer serializer) | ☑ | `src/log/drain.ts`; pure `drain(existing, pending)` assigns monotonic `seq` + display id, idempotent skip of already-committed intake; the Action just calls it |
| 3 | Deterministic projector + renderers | ☑ | `src/log/project.ts` folds events → records (derives `accepted`/`superseded` + back-links); `src/log/render.ts` emits `decisions/*.md`, an index, and `graph.json` |
| 4 | CLI + store + drain Action | ☑ | `canon add-decision` / `drain` / `build [--check]`; `.github/workflows/drain.yml` (concurrency 1, inert until `intake/` exists); CI projection-lock via `check:build` |
| 5 | Expansion (deferred) | ☐ | More record types (TERM/NOTE), compaction (fold state → snapshot), federation, coverage — layered additively on the log |

## v0.2b — Schema-aware entry operations + cross-repo intake

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

- canon is published privately to **GitHub Packages** as `@clockwork-kitten/canon`
  (scoped to the clockwork-kitten org, staying private until a later move to
  public npm). It runs its TypeScript directly under Bun, so the published package
  ships source — no build/`dist` step — and the `canon` bin resolves without
  compilation.
- Consume it as a normal dependency. Add a committed `.npmrc` mapping the scope
  (`@clockwork-kitten:registry=https://npm.pkg.github.com`), then
  `bun add @clockwork-kitten/canon` (or pinned, e.g. `@0.1.0`). CI reads with the
  auto-scoped `GITHUB_TOKEN` (`permissions: packages: read` + package access to
  the repo, or org-internal visibility); local dev needs a personal `~/.npmrc`
  with a `read:packages` token. `conform` depends on it this way.
- Semantic-ish tags; breaking changes to a config's rules or the CLI bump the
  major. Consuming repos pin to a version and upgrade deliberately.
- The `release` workflow (human-triggered `workflow_dispatch`) validates the
  version, verifies CI is green, tags, publishes a GitHub Release, moves the
  major-line alias, and publishes to GitHub Packages using the workflow's
  built-in `GITHUB_TOKEN` (`packages: write`) — no external secret required. The
  publish is gated on the release job (so tag/Release happen first) and on the
  clockwork-kitten owner.
- Moving to public npm later is a ~2-line change: drop `publishConfig.registry`,
  swap the publish token in `release.yml`, and delete consumers' `.npmrc`
  registry line — no rename.
- **No release is cut yet.** canon is scaffolded to `v0.1.0`-ready and push-button;
  cutting the tag is a deliberate, human-approved step.

## Open items

- **License choice.** Currently `LICENSE` is MIT (inherited from `standards`).
  Reconsider **Apache-2.0** (patent grant) if/when canon is commercialized.
