---
title: Welcome to forkctl
description: Adoption control plane for GitHub repos. Assess, choose path, fork or template, bootstrap, sync.
sidebar:
  order: 0
---

> Forking a GitHub repo is one click. Adopting it — picking fork vs template, dealing with org policy, waiting for async creation, wiring upstream sync, making the result actually runnable — is everything else. **Forkctl owns the everything-else.**

<!-- FORKABLE_COUNTS_START -->
forkctl is an MCP server **and** a CLI. The same twenty-two tools are exposed through both surfaces, sharing one schema-validated, audit-logged dispatch boundary.
<!-- FORKABLE_COUNTS_END -->

## When to reach for forkctl

- You want to **contribute** back to an open-source project but skip the manual steps of forking, syncing, and configuring upstream.
- You want to **derive a new product** from a template and not be left with stale references in the result.
- You want to **adopt** a repo into your org with policy preflight, drift scanning, and a structured handoff.
- You want to **maintain a fleet of forks** without writing a custom GitHub bot.
- You're a maintainer who wants to **make your repo more adoptable** for everyone else.

## The seven layers

| Layer | What it owns |
|---|---|
| **Assessment** | Score adoption-readiness, pick fork vs template, fix source-side blockers |
| **Execution** | Async fork or template generation with operation tracking |
| **Bootstrap** | Profile-driven aftercare so the new repo is actually runnable |
| **Sync** | Honest divergence diagnosis + PR-based fallback when fast-forward is impossible |
| **Fleet** | List, health-check, batch-sync many forks at once |
| **Receipts** | Append-only SQLite audit log + machine-readable operation receipts |
| **Rename** *(new in v1.1.0)* | AST-aware polyglot rename — identity, symbols, textual surfaces, lockfiles. See [Rename](./rename/). |

## Two surfaces, one product

```bash
# As a CLI
npx @mcptoolshop/forkctl assess octocat/hello-world
npx @mcptoolshop/forkctl sync myhandle/my-fork
```

```json
// As an MCP server (Claude Code, Cursor, any MCP client)
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

## Where to next

- New here? Start with [Getting Started](../getting-started/).
- Want the day-to-day patterns? [Usage](../usage/).
- Want every knob? [Configuration](../configuration/).
- Want to look up a specific tool? [Reference](../reference/).
- Want to know how it's wired internally? [Architecture](./architecture/).
- Renaming a repo you just adopted? [Rename](./rename/) — new in v1.1.0.
- Worried about secrets and force-pushes? [Security](../security/) explicitly states what forkctl will and won't do.
