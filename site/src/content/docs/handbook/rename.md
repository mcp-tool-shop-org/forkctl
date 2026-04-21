---
title: Rename
description: AST-aware polyglot rename for adopted repos — new in v1.1.0. Identity, symbols, textual, lockfiles.
sidebar:
  order: 9
---

> New in **v1.1.0**. Layer 7 of forkctl. Read-only plan, snapshotted apply, one-command rollback.

When you adopt a repo and decide to call it your own, every reference to the original name needs to change — the `package.json` `name`, the `Cargo.toml` `[package].name`, the exported `Forkable` class, the README H1, the repo URL in workflow files, the `FORKABLE_API_KEY` that's really just the env prefix, the directory called `src/forkctl/`. Every one of those, in every casing variant, with word boundaries that don't break `starship` when you rename `star`.

`forkctl rename` does that in one command.

## What it does — concretely

Given `--from forkctl --to splitshift`, the rename derives the casing variant set:

| Variant | From | To |
|---|---|---|
| kebab-case | `forkctl` | `splitshift` |
| snake_case | `forkctl` | `splitshift` |
| camelCase | `forkctl` | `splitshift` |
| PascalCase | `Forkable` | `Splitshift` |
| SCREAMING_SNAKE | `FORKABLE` | `SPLITSHIFT` |
| Title Case | `Forkable` | `Splitshift` |

Then rewrites every occurrence of any of those — at identifier boundaries in source code, at the H1 in the README, inside structured fields like `package.json` `name` — without touching coincidental matches like `forkableness` or `unforkable`.

## Quickstart

```bash
# 1. Plan (read-only). Emits .forkctl/rename-plan.{json,diff}.
forkctl rename plan . --from forkctl --to splitshift

# 2. Review the diff in your editor.
$EDITOR .forkctl/rename-plan.diff

# 3. Apply. Snapshots the tree first.
forkctl rename apply . --plan .forkctl/rename-plan.json

# 4. If anything looks wrong, roll back.
forkctl rename rollback .
```

Plan is always free. Apply is the only mutating command and it refuses to run without a plan file. There is no `--yes` — rename is consequential and the diff review is the point.

## Under the hood — the five passes

Apply runs these in order. Each is idempotent and independently rollable.

### A · Identity manifest

Rewrites a known list of identity-carrying files using structured editors (`JSON.parse`, `@iarna/toml`, `fast-xml-parser`, remark walkers) — never regex. Covers `package.json` (`name`, `bin`, `repository.url`, `homepage`, `bugs.url`), `Cargo.toml`, `pyproject.toml`, `go.mod`, `composer.json`, `pom.xml`, `README.md` + translations (H1 + badge URLs), `LICENSE` copyright line, `.github/workflows/**`, and site config.

Binary assets (favicon, OG image, logos) are **never modified** — they're listed in `.forkctl/asset-regen.json` as a manual TODO.

### B · Code symbols via ast-grep

Uses `@ast-grep/napi`'s tree-sitter cores to match identifier-kind nodes across JS, TS, TSX, HTML, and CSS (bundled in v1.1.0; other languages resolve at runtime when the relevant `@ast-grep/napi-*` binding is present — otherwise `RENAME_LANG_UNAVAILABLE` fires non-fatally). Identifier-kind matching is what buys you the word-boundary guarantee: `forkctl` inside `starship` can't match.

Comments and string literals in code are rewritten by default, with `STRING_LITERAL_REWRITTEN` emitted as a warning so you can review. Most product-name string literals *are* real product references (error messages, config keys, log lines).

### C · Deep TypeScript pass

Uses `ts-morph` against the real TypeScript compiler's symbol table — the same quality as VS Code's "Rename Symbol." Auto-enables when `tsconfig.json` is present and `ts-morph` resolves. Catches the things ast-grep's pure-AST pass misses: re-exports in barrel files, computed-property shortcuts, cross-file refactors. Adds 10–30s on large TS repos. Opt out with `--no-deep-ts`.

### D · Non-code textual

Walks `*.md`, `*.mdx`, `*.txt`, `*.yml`, `*.yaml`, `*.toml` (non-identity fields), and `.env.example` with word-boundary regex per casing variant. Skips code-fence blocks in markdown (parsed via remark). Skips YAML *keys* — only rewrites values, to keep schema files intact.

`.env*` files are always diff-only — they surface as `ENV_REQUIRES_REVIEW` and require human approval before any key or value is rewritten.

### E · Post-rename

Runs after A–D succeed. Idempotent.

1. **Lockfile regeneration.** Deletes `package-lock.json` / `pnpm-lock.yaml` / `yarn.lock` / `Cargo.lock` / `poetry.lock` / `uv.lock`, then runs the native install command. Manual lockfile rewrites would corrupt integrity hashes — always regenerate.
2. **Path renames.** If `src/forkctl/` exists, `git mv` to `src/splitshift/`. Handles case-insensitive filesystems (Windows, macOS default) with a two-step `.tmp` rename.
3. **Asset regeneration manifest.** Writes `.forkctl/asset-regen.json` listing every binary asset that likely needs to be remade. Never modified; surfaced as a TODO list.
4. **Verify hook.** If the repo has `npm run verify` / `make verify` / `cargo check`, runs it and reports. Does not fail the rename on verify failure — it's a post-condition, not a gate.

## Flags reference

### `rename plan`

| Flag | Type | Default | Notes |
|---|---|---|---|
| `--from <name>` | string | **required** | Canonical old name |
| `--to <name>` | string | **required** | Canonical new name |
| `--layers <csv>` | `identity,symbols,deep-ts,textual,post` | all (deep-ts auto) | Restrict which passes plan |
| `--exclude <glob>` | glob (repeatable) | — | Added to built-in excludes |
| `--lockfile-strategy <mode>` | `regenerate \| skip` | `regenerate` | Post-pass lockfile behaviour |
| `--no-deep-ts` | — | — | Disable the ts-morph pass |
| `--json` | — | — | Machine-readable output |

### `rename apply`

| Flag | Type | Default | Notes |
|---|---|---|---|
| `--plan <path>` | string | **required** | Path to `rename-plan.json` |
| `--plan-hash <sha>` | string | — | Optional stale-plan guard |
| `--json` | — | — | Machine-readable output |

### `rename rollback`

| Flag | Type | Default | Notes |
|---|---|---|---|
| `--json` | — | — | Machine-readable output |

Plan artifacts live at `.forkctl/rename-plan.json` and `.forkctl/rename-plan.diff`. Snapshots at `.forkctl/snapshots/rename-<timestamp>/`. All three paths are under the repo root, so `.gitignore` them if you don't want snapshots tracked.

## Exclusions (always)

forkctl never touches `.git/`, `node_modules/`, `bower_components/`, `dist/`, `build/`, `out/`, `.next/`, `.nuxt/`, `.astro/`, `target/`, `__pycache__/`, `.venv/`, `venv/`, `env/`, `coverage/`, minified JS/CSS, sourcemaps, or binary files by extension (`.png`, `.jpg`, `.ico`, `.woff*`, `.ttf`, `.otf`, `.wasm`, `.so`, `.dll`, `.dylib`, `.exe`, `.bin`, `.mp3`, `.mp4`, `.webm`, `.pdf`, `.zip`, `.tar*`, `.gz`).

## Snapshot & rollback

Before apply mutates anything:

- **git repos.** Record the pre-rename HEAD SHA + `git stash push --include-untracked` for any working-tree changes. Rollback = `git reset --hard <pre-rename-HEAD>` + `git stash pop` (if stash existed).
- **non-git repos.** Tarball the working tree (excluding standard excludes). Rollback = extract tarball over the working tree.

Snapshots live for 7 days, garbage-collected on the next `forkctl` command.

## Troubleshooting

Every failure is a structured `ForkctlError` with a code. See [Troubleshooting — Rename](../troubleshooting/#rename-new-in-v110) for the full per-code recovery reference. Quick pointers:

- Apply failed mid-run → `forkctl rename rollback <path>` then read `details.layer`.
- Plan won't apply → `RENAME_PLAN_STALE`; re-run plan.
- Lockfile regen failed → the rename itself already landed; fix the toolchain issue and regenerate by hand.
- A specific binding isn't bundled → `RENAME_LANG_UNAVAILABLE`; install the binding and re-run, or accept that file as out-of-scope.

## Known limitations (v1.1.0)

- **Polyglot symbol pass is narrowed.** JS, TS, TSX, HTML, CSS bindings ship bundled. Other languages resolve at runtime only if you've installed the matching `@ast-grep/napi-*` package, else fall through with `RENAME_LANG_UNAVAILABLE`. **Full polyglot bundle is a v1.2.0 target.**
- **Git history is never rewritten.** `--rewrite-history` is a stub. Targeted for v1.2+ behind explicit opt-in that documents the force-push / collaborator-impact tradeoffs.
- **Monorepo `--scope` flag is deferred.** v1.1.0 is whole-repo only.
- **LSP tier (multilspy) is future work.** Not wired in v1.1.0.
- **Comments are rewritten by default.** A `--preserve-comments` flag is planned for v1.2.

## What rename is not

- **A domain-concept rename.** Renaming `Customer` → `Account` inside the codebase is a different tool. Rename is the *product-name* rewrite, one canonical string + its variants.
- **A cross-repo coordinator.** Rename operates on one working tree. Coordinating a rename across provider/consumer pairs is a job for [multi-repo-publish-sequencing](../../).
- **An automated translator.** Rename rewrites the product *name* inside translated READMEs — it does not re-translate the prose. A fresh translation pass is a separate step.
