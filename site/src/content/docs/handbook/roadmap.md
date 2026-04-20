---
title: Roadmap
description: What's shipped, what's designed, and what's being considered.
sidebar:
  order: 8
---

forkable ships small, landed chunks. Nothing goes in the "soon" column that doesn't already have a design doc.

## Shipped

**v1.1.0 (2026-04-20)** — Layer 7 (Rename). Three new tools taking the surface to seven layers and twenty-two tools. AST-aware polyglot rename across identity files, code symbols (JS/TS/TSX/HTML/CSS bundled; other languages resolve at runtime), non-code textual surfaces, and a post-pass that regenerates lockfiles and emits an asset-regeneration manifest. Snapshotted apply; one-command rollback. See the [Rename handbook page](../rename/) for the walkthrough.

**v1.0.0 (2026-04-19)** — initial release. Six layers, 19 tools, all schema-validated and audit-logged. MCP server + CLI with full parity.

See the [CHANGELOG](https://github.com/mcp-tool-shop-org/forkable/blob/main/CHANGELOG.md) for the full list.

## Landed design — Layer 7: `forkable rename`

Forking a repo is easy. *Adopting* it as your own product means every reference — package names, class identifiers, badge URLs, lockfile hashes, even binaries — needs to change coherently. Existing tools either did template-time substitution (fails on repos that weren't built as templates) or `sed -i` chains (brittle, no casing awareness, corrupts partial matches).

Layer 7 shipped AST-aware rename in v1.1.0: a planner that understands what an identifier actually *is* and renames it the way a refactor tool would, while also handling every non-code surface (README, badges, repo URLs, lockfiles, binaries).

**Tool surface (shipped in v1.1.0)**

- `forkable_rename_plan` — returns a reviewable `RenamePlan`.
- `forkable_rename_apply` — consumes the plan, returns a `RenameReceipt`. Only mutating command.
- `forkable_rename_rollback` — restores from latest snapshot.

`plan` is read-only. `apply` requires a plan file produced by `plan`. There is no one-shot `--yes` flag — renames are consequential and the two-step flow is deliberate.

The full design — scope rules, per-language AST handling, snapshot/rollback contract, non-goals — lives in [`design/rename.md`](https://github.com/mcp-tool-shop-org/forkable/blob/main/design/rename.md) in the repo.

## Under consideration

Nothing else has a design doc yet. If something here matters to you, open a discussion at https://github.com/mcp-tool-shop-org/forkable/discussions — design work happens there first.

- **Fleet-wide rename.** Once Layer 7 is solid, batch-apply a rename across many adopted forks.
- **Policy preflight for enterprise migrations.** Today `preflight-policy` checks a single repo; enterprise adopters often want to assess a whole org.
- **Bootstrap profile: `plugin-fork`.** A profile tuned for forks that are plugins/extensions of an upstream framework — keeps upstream sync but also keeps a clean contributor-facing surface.

## How to influence the roadmap

- File an issue with a concrete scenario, not just a wish. "Here's what I'm trying to do / here's where forkable got in the way" beats "please add X."
- Design discussions happen in [Discussions](https://github.com/mcp-tool-shop-org/forkable/discussions) before any code or doc lands.
- If you're shipping a fork-heavy workflow at scale, open an issue with the shape of it — real adoption patterns drive what gets built next.
