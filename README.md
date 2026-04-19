# forkable

> Adoption control plane for GitHub repos. Not a fork wrapper — an end-to-end layer that assesses adoption-readiness, chooses the right duplication path, executes it as a tracked async operation, leaves the result runnable, and keeps it synced over time.

[![npm](https://img.shields.io/npm/v/@mcptoolshop/forkable.svg)](https://www.npmjs.com/package/@mcptoolshop/forkable)
[![CI](https://github.com/mcp-tool-shop-org/forkable/actions/workflows/ci.yml/badge.svg)](https://github.com/mcp-tool-shop-org/forkable/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## What forkable does

Forking a GitHub repo is one click. Adopting it — picking fork vs template, dealing with org policy, waiting for async creation, wiring upstream sync, making the result actually runnable — is everything else.

Forkable owns the everything-else.

| Layer        | What it does                                                                                  |
|--------------|-----------------------------------------------------------------------------------------------|
| Assessment   | Score a repo's adoption-readiness, recommend fork vs template vs import, propose source-side fixes. |
| Execution    | Create the copy as a tracked async operation. Surfaces org/enterprise fork-policy blockers up front. |
| Bootstrap    | Profile-driven aftercare — upstream wiring, README updates, drift scan, runnable handoff.     |
| Sync         | Calls the GitHub merge-upstream API. Reports divergence honestly. Falls back to PR when needed. |
| Fleet        | List, health-check, and batch-sync your forks.                                                 |
| Receipts     | Machine-readable record of every operation. Audit log in local SQLite.                         |

## Usage shapes

Forkable ships as both an **MCP server** (stdio transport, for Claude Code and other MCP clients) and a **CLI** with the same surface.

### MCP

Add to your MCP client config:

```json
{
  "mcpServers": {
    "forkable": {
      "command": "npx",
      "args": ["-y", "@mcptoolshop/forkable", "mcp"],
      "env": { "GITHUB_TOKEN": "ghp_..." }
    }
  }
}
```

### CLI

```bash
npx @mcptoolshop/forkable assess owner/repo
npx @mcptoolshop/forkable choose-path owner/repo --goal contribute_upstream
npx @mcptoolshop/forkable create-fork owner/repo --destination my-org
npx @mcptoolshop/forkable sync my-fork
npx @mcptoolshop/forkable fleet-health
```

All commands accept `--json` for machine-readable output.

## The eighteen tools

### Assessment
- `forkable_assess` — adoption-readiness score, blockers, strengths
- `forkable_choose_path` — fork | template | import | clone-detached
- `forkable_make_forkable` — fix the source repo (default: plan; opt-in: PR)

### Execution
- `forkable_preflight_policy` — detect enterprise/org/repo fork-policy blockers
- `forkable_create_fork` — async, returns operation_id
- `forkable_create_from_template` — uses GitHub `/generate`
- `forkable_check_operation` — poll any in-flight op

### Bootstrap
- `forkable_bootstrap` — profile-driven (contributor / starter-kit / internal-seed / client-delivery / experiment)
- `forkable_configure_upstream` — set remote, optional sync workflow
- `forkable_scan_drift` — hardcoded paths, leaked secrets, stale CI references in the copy
- `forkable_emit_handoff` — single truthful artifact: URLs, commands, caveats, next action

### Sync
- `forkable_sync` — GitHub merge-upstream API
- `forkable_diagnose_divergence` — commits behind, files at risk, predicted conflicts
- `forkable_propose_sync_pr` — PR-based sync when fast-forward fails

### Fleet
- `forkable_list_forks` — yours + watched, with health column
- `forkable_fleet_health` — stale / conflicted / abandoned
- `forkable_batch_sync` — bounded, rate-limit-aware

### Receipts
- `forkable_receipt` — machine-readable record of any op
- `forkable_audit_log` — append-only history

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
| `FORKABLE_STATE_DIR` | no       | OS user-state dir (via `env-paths`)          | Where the SQLite operations + audit DB live     |

## Security

See [SECURITY.md](SECURITY.md) for the threat model and reporting policy. Key points:

- `GITHUB_TOKEN` is never logged.
- Every tool input is validated through Zod.
- `make_forkable` defaults to `plan` mode. `pr` mode is opt-in.
- Forkable never force-pushes, deletes repos, or deletes branches.
- No telemetry. No outbound calls except the configured GitHub API.

## Status

v1.0.0 — initial release. Built to the [shipcheck](https://github.com/mcp-tool-shop-org/shipcheck) gate.

See [SHIP_GATE.md](SHIP_GATE.md) for the gate scorecard.

## License

MIT — see [LICENSE](LICENSE).
