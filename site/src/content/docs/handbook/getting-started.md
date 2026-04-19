---
title: Getting Started
description: Install forkable as a CLI or wire it up as an MCP server in 60 seconds.
sidebar:
  order: 1
---

forkable ships as a single npm package that is **both** a CLI and an MCP stdio server. Pick whichever surface fits the way you work — they call the same handlers.

## Requirements

- Node.js **20 or newer**
- A GitHub personal access token (classic or fine-grained) with `repo`, `workflow`, and `read:org` scopes
- For org-restricted operations, the token must be SSO-authorized for that org

## Install

### As a one-shot command

```bash
npx @mcptoolshop/forkable assess octocat/hello-world
```

### As a global CLI

```bash
npm install -g @mcptoolshop/forkable
forkable --help
```

### As a project dependency (embed mode)

```bash
npm install @mcptoolshop/forkable
```

```ts
import { TOOLS, dispatch, buildOctokit, openState, Operations } from "@mcptoolshop/forkable";
```

## Configure your GitHub token

```bash
# bash / zsh
export GITHUB_TOKEN=ghp_xxxxx

# PowerShell
$env:GITHUB_TOKEN = "ghp_xxxxx"
```

| Variable | Required | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | yes | Authenticates every API call. Never logged. |
| `GITHUB_API_URL` | no | Defaults to `https://api.github.com`. Set for GitHub Enterprise Server. |
| `FORKABLE_STATE_DIR` | no | Override the SQLite state directory. Defaults to the OS user-state path. |

## First runs

```bash
# 1. Score a repo's adoption-readiness
forkable assess octocat/hello-world

# 2. Decide the right copy strategy
forkable choose-path octocat/hello-world --goal contribute_upstream

# 3. Run a fork-policy preflight
forkable preflight-policy octocat/hello-world

# 4. Kick off the fork (async — returns operation_id)
forkable create-fork octocat/hello-world --destination-org my-org

# 5. Probe the operation
forkable check-operation <operationId>
```

Every command prints a structured response. Add `--json` for raw machine-readable output.

## Wire it into Claude Code

Edit your MCP client config:

```json
{
  "mcpServers": {
    "forkable": {
      "command": "npx",
      "args": ["-y", "@mcptoolshop/forkable", "mcp"],
      "env": { "GITHUB_TOKEN": "ghp_xxxxx" }
    }
  }
}
```

Restart your client. The 19 tools appear under the `forkable` server.

## Smoke test

```bash
forkable list-forks --limit 5
```

If you see your forks listed, your token works and forkable is happy.

## Next

- Learn the day-to-day patterns in [Usage](../usage/).
- Look up any specific tool in the [Reference](../reference/).
