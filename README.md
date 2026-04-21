<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/forkctl/readme.png" width="500" alt="forkctl">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/forkctl/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/forkctl/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/forkctl/"><img src="https://img.shields.io/badge/Landing-Page-2563eb" alt="Landing Page"></a>
</p>

> Adoption control plane for GitHub repos. Not a fork wrapper — an end-to-end layer that assesses adoption-readiness, chooses the right duplication path, executes it as a tracked async operation, leaves the result runnable, keeps it synced over time, and — new in v1.1.0 — renames it coherently when you're ready to call it your own.

## What's new in v1.1.0

Layer 7 — **AST-aware polyglot rename**. `forkctl rename plan` emits a reviewable diff across identity files, code symbols (26 languages via ast-grep), and non-code textual surfaces. `forkctl rename apply` snapshots the tree, runs all passes, regenerates lockfiles, and leaves an asset-regeneration manifest for anything binary. `forkctl rename rollback` restores the latest snapshot. No `sed` chains. Word-boundary correct. Casing-aware.

## What forkctl does

Forking a GitHub repo is one click. Adopting it — picking fork vs template, dealing with org policy, waiting for async creation, wiring upstream sync, making the result actually runnable — is everything else.

Forkctl owns the everything-else.

| Layer        | What it does                                                                                  |
|--------------|-----------------------------------------------------------------------------------------------|
| Assessment   | Score a repo's adoption-readiness, recommend fork vs template vs import, propose source-side fixes. |
| Execution    | Create the copy as a tracked async operation. Surfaces org/enterprise fork-policy blockers up front. |
| Bootstrap    | Profile-driven aftercare — upstream wiring, README updates, drift scan, runnable handoff.     |
| Sync         | Calls the GitHub merge-upstream API. Reports divergence honestly. Falls back to PR when needed. |
| Fleet        | List, health-check, and batch-sync your forks.                                                 |
| Receipts     | Machine-readable record of every operation. Audit log in local SQLite.                         |
| Rename       | AST-aware polyglot rename — identity files, code symbols, textual surfaces, lockfile regen.    |

## Usage shapes

Forkctl ships as both an **MCP server** (stdio transport, for Claude Code and other MCP clients) and a **CLI** with the same surface.

### MCP

Add to your MCP client config:

```json
{
  "mcpServers": {
    "forkctl": {
      "command": "npx",
      "args": ["-y", "@mcptoolshop/forkctl", "mcp"],
      "env": { "GITHUB_TOKEN": "ghp_..." }
    }
  }
}
```

### CLI

```bash
npx @mcptoolshop/forkctl assess owner/repo
npx @mcptoolshop/forkctl choose-path owner/repo --goal contribute_upstream
npx @mcptoolshop/forkctl create-fork owner/repo --destination-org my-org
npx @mcptoolshop/forkctl sync my-fork
npx @mcptoolshop/forkctl fleet-health
```

All commands accept `--json` for machine-readable output.

<!-- FORKABLE_COUNTS_START -->
## The twenty-two tools
<!-- FORKABLE_COUNTS_END -->

### Assessment
- `forkctl_assess` — adoption-readiness score, blockers, strengths
- `forkctl_choose_path` — fork | template | import | clone-detached
- `forkctl_make_forkable` — fix the source repo (default: plan; opt-in: PR)

### Execution
- `forkctl_preflight_policy` — detect enterprise/org/repo fork-policy blockers
- `forkctl_create_fork` — async, returns operation_id
- `forkctl_create_from_template` — uses GitHub `/generate`
- `forkctl_check_operation` — poll any in-flight op

### Bootstrap
- `forkctl_bootstrap` — profile-driven (contributor / starter-kit / internal-seed / client-delivery / experiment)
- `forkctl_configure_upstream` — set remote, optional sync workflow
- `forkctl_scan_drift` — hardcoded paths, leaked secrets, stale CI references in the copy
- `forkctl_emit_handoff` — single truthful artifact: URLs, commands, caveats, next action

### Sync
- `forkctl_sync` — GitHub merge-upstream API
- `forkctl_diagnose_divergence` — commits behind, files at risk, predicted conflicts
- `forkctl_propose_sync_pr` — PR-based sync when fast-forward fails

### Fleet
- `forkctl_list_forks` — yours + watched, with health column
- `forkctl_fleet_health` — stale / conflicted / abandoned
- `forkctl_batch_sync` — bounded, rate-limit-aware

### Receipts
- `forkctl_receipt` — machine-readable record of any op
- `forkctl_audit_log` — append-only history

### Rename (Layer 7 — new in v1.1.0)
- `forkctl_rename_plan` — AST-aware rename planner; emits reviewable diff
- `forkctl_rename_apply` — snapshots + applies identity + symbols + textual + post passes
- `forkctl_rename_rollback` — restores from latest snapshot

## Bootstrap profiles

| Profile             | For                                                                | Aftercare                                                                       |
|---------------------|--------------------------------------------------------------------|---------------------------------------------------------------------------------|
| `contributor`       | Forking to send PRs back upstream                                   | Upstream remote, sync workflow, contributor README block, PR template if absent |
| `starter-kit`       | Generated from a template to kick off your own product              | Strip template references, fresh README, fresh LICENSE prompt, .env.example     |
| `internal-seed`     | Internal team copy of a shared seed repo                            | Replace placeholders, set internal CODEOWNERS, lock visibility                  |
| `client-delivery`   | Per-client fork of a deliverable                                    | Client-named branches, sanitized history check, locked default branch           |
| `experiment`        | Throwaway / detached copy                                           | Detach upstream, mark as experiment in README, no sync workflow                 |

## Configuration

| Variable             | Required | Default                                      | Notes                                           |
|----------------------|----------|----------------------------------------------|-------------------------------------------------|
| `GITHUB_TOKEN`       | yes      | —                                            | `repo`, `workflow`, `read:org` scopes           |
| `GITHUB_API_URL`     | no       | `https://api.github.com`                     | For GHES / ghe.com                              |
| `FORKCTL_STATE_DIR` | no       | OS user-state dir (via `env-paths`)          | Where the SQLite operations + audit DB live     |

## Security

See [SECURITY.md](SECURITY.md) for the threat model and reporting policy. Key points:

- `GITHUB_TOKEN` is never logged.
- Every tool input is validated through Zod.
- `make_forkable` defaults to `plan` mode. `pr` mode is opt-in.
- Forkctl never force-pushes, deletes repos, or deletes branches.
- No telemetry. No outbound calls except the configured GitHub API.

## Status

v1.1.0 — adds Layer 7 (Rename). Built to the [shipcheck](https://github.com/mcp-tool-shop-org/shipcheck) gate.

See [SHIP_GATE.md](SHIP_GATE.md) for the gate scorecard.

## License

MIT — see [LICENSE](LICENSE).

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
