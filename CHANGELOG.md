# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Fixed

## [2.0.0] - 2026-04-20

**Rename: `@mcptoolshop/forkable` → `@mcptoolshop/forkctl`.** The old name collided with an unrelated consumer product ([forkable.com](https://forkable.com)), hurting discoverability. All functionality is preserved — this is a name-only migration executed (dogfooded) with Layer 7 itself.

### Breaking
- npm package: `@mcptoolshop/forkable` → `@mcptoolshop/forkctl`. The old package is deprecated on npm with a pointer to the new one.
- CLI binaries: `forkable` / `forkable-mcp` → `forkctl` / `forkctl-mcp`.
- MCP tool names: `forkable_*` → `forkctl_*` (all 22 tools). The `make_forkable` suffix of `forkctl_make_forkable` is retained — it is the domain verb ("make a repo forkable"), not the product name.
- Error class: `ForkableError` → `ForkctlError`. Error *codes* (e.g., `MAKE_FORKABLE_BRANCH_EXISTS`) are unchanged.
- Env vars: `FORKABLE_LOG` → `FORKCTL_LOG`; `FORKABLE_STATE_DIR` → `FORKCTL_STATE_DIR`.
- Scratch directory: `.forkable/` (plan artifacts, snapshots, asset-regen manifest) → `.forkctl/`.
- Repo: [mcp-tool-shop-org/forkable](https://github.com/mcp-tool-shop-org/forkable) → [mcp-tool-shop-org/forkctl](https://github.com/mcp-tool-shop-org/forkctl).

### Notes
- **The rename was dogfooded.** v1.1.0's Layer 7 (`rename plan` + `apply`) performed the initial pass; a thin post-pass updated public symbols (tool names, error class, env vars, scratch dir) that fell outside Layer 7's default scope. The v1.2 roadmap now tracks these as engine improvements, not one-off fixes.
- Tests: 378 passing (unchanged from v1.1.0).

## [1.1.0] - 2026-04-20

### Added
- Layer 7 — AST-aware polyglot rename (forkable_rename_plan/apply/rollback).
- Structured logger (src/lib/logger.ts) with stderr JSON-line output.
- Octokit retry + throttling plugins (transient 5xx / rate limit resilience).
- Migration runner skeleton in state.
- Handbook: troubleshooting page with all 26 ForkableErrorCode entries; rename page.
- New error codes: SYNC_BRANCH_EXISTS, MAKE_FORKABLE_BRANCH_EXISTS, RENAME_* (7 codes), STRING_LITERAL_REWRITTEN, ENV_REQUIRES_REVIEW, RENAME_LANG_UNAVAILABLE, RENAME_DEEP_TS_FAILED.

### Changed
- Compare basehead in diagnose-divergence and fleet-health now uses upstream
  default branch, not fork's branch (fixes silent 404 on renamed defaults).
- propose-sync-pr and make-forkable no longer silently reuse a stale
  branch on 422 — return SYNC_BRANCH_EXISTS / MAKE_FORKABLE_BRANCH_EXISTS.
- OpenAI key regex tightened to structural match; loose fallback is MEDIUM.
- Node minimum: 20 → 22 (Node 20 EOL 2026-04-30; action v4 sunset 2026-06-02).
- CI: actions bumped v4 → v5, permissions: contents: read, npm audit added,
  tarball verification added, pages.yml guards missing site/.

### Fixed
- All Stage A findings (bugs/security); all Stage B proactive findings
  amended with humanization (UX-emphasized).
- README flag: `--destination` → `--destination-org` (all 8 languages).
- 2 dead handbook links.

## [1.0.0] - 2026-04-19

Initial release. All hard gates A–D pass.

### Added
- Six product layers, **19 tools**, all schema-validated:
  - Assessment: `forkable_assess`, `forkable_choose_path`, `forkable_make_forkable`
  - Execution: `forkable_preflight_policy`, `forkable_create_fork`, `forkable_create_from_template`, `forkable_check_operation`
  - Bootstrap: `forkable_bootstrap`, `forkable_configure_upstream`, `forkable_scan_drift`, `forkable_emit_handoff`
  - Sync: `forkable_sync`, `forkable_diagnose_divergence`, `forkable_propose_sync_pr`
  - Fleet: `forkable_list_forks`, `forkable_fleet_health`, `forkable_batch_sync`
  - Receipts: `forkable_receipt`, `forkable_audit_log`
- MCP stdio server (`forkable mcp` subcommand or `forkable-mcp` binary).
- CLI parity: every tool has a subcommand with sensible CLI flags + `--json`.
- Async-aware execution: fork/template creation returns an operation_id; `check_operation` performs single-probe readiness checks.
- Fork policy resolver covers enterprise → org → repo cascade and surfaces `FORK_POLICY_BLOCKED` before wasted API calls.
- Sync layer uses GitHub merge-upstream (since 2021) and the cross-repo compare API for honest divergence diagnosis. Conflicted syncs route to `propose_sync_pr` — never force-pushes.
- Bootstrap profiles: `contributor`, `starter-kit`, `internal-seed`, `client-delivery`, `experiment`. Idempotent — files that already exist are skipped, not overwritten.
- Drift scanner detects hardcoded local paths, leaked secrets (GitHub PAT, AWS, OpenAI, Google), and stale source-owner references. Secret values are never echoed.
- SQLite state store (better-sqlite3) for operation tracking and append-only audit log. Audit redacts sensitive keys and inline PATs at write time.
- Single dispatch boundary (`src/dispatch.ts`) auto-validates and auto-audits every tool call.
- TypeScript / Node 20+ / ESM throughout.
- 162 tests across 31 files, all green.
- CI: paths-gated, ubuntu-latest, concurrency-guarded, single workflow file.
- SHIP_GATE.md tracks all hard gates A–D; SECURITY.md with explicit threat model.
