#!/usr/bin/env node
import { Command } from "commander";
import { dispatch } from "./dispatch.js";
import { buildOctokit } from "./lib/github.js";
import { openState } from "./lib/state.js";
import { Operations } from "./lib/operations.js";
import { findTool } from "./tools/registry.js";
import type { ToolContext } from "./tools/types.js";
import type { ToolResult } from "./lib/result.js";
import { VERSION } from "./index.js";

/**
 * CLI surface. Every tool has a subcommand with its primary positional input
 * and any optional flags. Common: --json for raw JSON output.
 *
 * The MCP subcommand starts the MCP server (same binary).
 */

function makeContext(toolName?: string): ToolContext {
  // Rename tools (L7) don't make any GitHub API calls — don't require a
  // token to run them. Build a lazy proxy instead that throws if misused.
  const renameOnly = toolName !== undefined && toolName.startsWith("forkable_rename_");
  const octokit = renameOnly
    ? (new Proxy({}, {
        get() {
          throw new Error("rename tools must not use octokit");
        },
      }) as unknown as ReturnType<typeof buildOctokit>)
    : buildOctokit();
  const db = openState();
  const operations = new Operations(db);
  return { octokit, db, operations };
}

function outputResult(result: ToolResult<unknown>, opts: { json?: boolean }): never {
  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else if (result.ok) {
    process.stdout.write(JSON.stringify(result.data, null, 2) + "\n");
  } else {
    process.stderr.write(`ERROR ${result.error.code}: ${result.error.message}\n`);
    if (result.error.hint) process.stderr.write(`hint: ${result.error.hint}\n`);
  }
  process.exit(result.ok ? 0 : 1);
}

async function run<I>(toolName: string, input: I, opts: { json?: boolean }): Promise<never> {
  const tool = findTool(toolName);
  if (!tool) {
    process.stderr.write(`Unknown tool: ${toolName}\n`);
    process.exit(2);
  }
  const ctx = makeContext(toolName);
  const result = await dispatch(tool, input, ctx);
  outputResult(result, opts);
}

const program = new Command();
program
  .name("forkable")
  .description("Adoption control plane for GitHub repos")
  .version(VERSION);

// ---- Assessment -----------------------------------------------------------
program
  .command("assess <repo>")
  .description("Score a repo's adoption-readiness")
  .option("-g, --goal <goal>", "adoption goal")
  .option("--json", "raw JSON output")
  .action(async (repo, opts) => {
    const input: Record<string, unknown> = { repo };
    if (opts.goal) input.goal = opts.goal;
    await run("forkable_assess", input, opts);
  });

program
  .command("choose-path <repo>")
  .description("Recommend fork | template | import | clone_detached")
  .requiredOption("-g, --goal <goal>", "adoption goal")
  .option("--json", "raw JSON output")
  .action(async (repo, opts) => {
    await run("forkable_choose_path", { repo, goal: opts.goal }, opts);
  });

program
  .command("make-forkable <repo>")
  .description("Generate a patch plan (default) or PR to fix the source repo's adoption blockers")
  .option("-m, --mode <mode>", "plan | pr", "plan")
  .option("-b, --branch <branch>", "branch name for pr mode", "forkable/adoption-fixes")
  .option("--json", "raw JSON output")
  .action(async (repo, opts) => {
    await run(
      "forkable_make_forkable",
      { repo, mode: opts.mode, branch: opts.branch },
      opts,
    );
  });

// ---- Execution ------------------------------------------------------------
program
  .command("preflight-policy <repo>")
  .description("Detect fork-policy blockers before attempting a fork")
  .option("--json", "raw JSON output")
  .action(async (repo, opts) => {
    await run("forkable_preflight_policy", { repo }, opts);
  });

program
  .command("create-fork <source>")
  .description("Start an async fork")
  .option("-o, --destination-org <org>", "destination organization")
  .option("-n, --name <name>", "override fork name")
  .option("--default-branch-only", "fork only the default branch", false)
  .option("--json", "raw JSON output")
  .action(async (source, opts) => {
    const input: Record<string, unknown> = { source, defaultBranchOnly: !!opts.defaultBranchOnly };
    if (opts.destinationOrg) input.destinationOrg = opts.destinationOrg;
    if (opts.name) input.name = opts.name;
    await run("forkable_create_fork", input, opts);
  });

program
  .command("create-from-template <template>")
  .description("Generate a new repo from a template")
  .requiredOption("-o, --owner <owner>", "new repo owner")
  .requiredOption("-n, --name <name>", "new repo name")
  .option("-d, --description <desc>", "repo description")
  .option("--private", "create as private", false)
  .option("--include-all-branches", "copy all branches", false)
  .option("--json", "raw JSON output")
  .action(async (template, opts) => {
    const input: Record<string, unknown> = {
      template,
      owner: opts.owner,
      name: opts.name,
      private: !!opts.private,
      includeAllBranches: !!opts.includeAllBranches,
    };
    if (opts.description) input.description = opts.description;
    await run("forkable_create_from_template", input, opts);
  });

program
  .command("check-operation <operationId>")
  .description("Probe the status of an async operation")
  .option("--json", "raw JSON output")
  .action(async (operationId, opts) => {
    await run("forkable_check_operation", { operationId }, opts);
  });

// ---- Bootstrap ------------------------------------------------------------
program
  .command("bootstrap <destination>")
  .description("Apply a bootstrap profile to a destination repo")
  .requiredOption("-p, --profile <profile>", "contributor | starter-kit | internal-seed | client-delivery | experiment")
  .option("-s, --source <source>", "source / upstream repo")
  .option("--no-apply", "dry-run (advisory only)")
  .option("--json", "raw JSON output")
  .action(async (destination, opts) => {
    const input: Record<string, unknown> = {
      destination,
      profile: opts.profile,
      apply: opts.apply !== false,
    };
    if (opts.source) input.source = opts.source;
    await run("forkable_bootstrap", input, opts);
  });

program
  .command("configure-upstream <destination>")
  .description("Wire upstream sync for a fork")
  .requiredOption("-s, --source <source>", "upstream repo")
  .option("-b, --branch <branch>", "upstream branch", "main")
  .option("--no-install-workflow", "skip installing the sync workflow")
  .option("--json", "raw JSON output")
  .action(async (destination, opts) => {
    await run(
      "forkable_configure_upstream",
      {
        destination,
        source: opts.source,
        branch: opts.branch,
        installWorkflow: opts.installWorkflow !== false,
      },
      opts,
    );
  });

program
  .command("scan-drift <destination>")
  .description("Scan a destination repo for hardcoded paths, leaked secrets, stale refs")
  .option("-s, --source <source>", "original source (improves stale-ref detection)")
  .option("--json", "raw JSON output")
  .action(async (destination, opts) => {
    const input: Record<string, unknown> = { destination };
    if (opts.source) input.source = opts.source;
    await run("forkable_scan_drift", input, opts);
  });

program
  .command("emit-handoff <destination>")
  .description("Emit a single truthful handoff artifact")
  .option("-s, --source <source>", "upstream repo")
  .option("-p, --profile <profile>", "bootstrap profile used")
  .option("--json", "raw JSON output")
  .action(async (destination, opts) => {
    const input: Record<string, unknown> = { destination };
    if (opts.source) input.source = opts.source;
    if (opts.profile) input.profile = opts.profile;
    await run("forkable_emit_handoff", input, opts);
  });

// ---- Sync -----------------------------------------------------------------
program
  .command("sync <fork>")
  .description("Sync a fork branch with upstream")
  .option("-b, --branch <branch>", "branch to sync (defaults to fork's default)")
  .option("--json", "raw JSON output")
  .action(async (fork, opts) => {
    const input: Record<string, unknown> = { fork };
    if (opts.branch) input.branch = opts.branch;
    await run("forkable_sync", input, opts);
  });

program
  .command("diagnose-divergence <fork>")
  .description("Read-only divergence report for a fork")
  .option("-b, --branch <branch>", "branch to diagnose")
  .option("--json", "raw JSON output")
  .action(async (fork, opts) => {
    const input: Record<string, unknown> = { fork };
    if (opts.branch) input.branch = opts.branch;
    await run("forkable_diagnose_divergence", input, opts);
  });

program
  .command("propose-sync-pr <fork>")
  .description("Open a PR-based sync for a diverged fork")
  .option("-b, --branch <branch>", "target branch on the fork")
  .option("-s, --sync-branch <name>", "name for the sync branch", "forkable/sync-from-upstream")
  .option("-t, --pr-title <title>", "PR title", "forkable: sync from upstream")
  .option("--json", "raw JSON output")
  .action(async (fork, opts) => {
    const input: Record<string, unknown> = {
      fork,
      syncBranch: opts.syncBranch,
      prTitle: opts.prTitle,
    };
    if (opts.branch) input.branch = opts.branch;
    await run("forkable_propose_sync_pr", input, opts);
  });

// ---- Fleet ----------------------------------------------------------------
program
  .command("list-forks")
  .description("List forks (yours or of a source repo)")
  .option("-s, --source <source>", "list forks of this source repo")
  .option("-l, --limit <n>", "max results", (v) => parseInt(v, 10), 100)
  .option("--json", "raw JSON output")
  .action(async (opts) => {
    const input: Record<string, unknown> = { limit: opts.limit };
    if (opts.source) input.source = opts.source;
    await run("forkable_list_forks", input, opts);
  });

program
  .command("fleet-health")
  .description("Health-check your forks")
  .option("-l, --limit <n>", "max forks to check", (v) => parseInt(v, 10), 25)
  .option("--json", "raw JSON output")
  .action(async (opts) => {
    await run("forkable_fleet_health", { limit: opts.limit }, opts);
  });

program
  .command("batch-sync <forks...>")
  .description("Sync multiple forks in sequence")
  .option("-b, --branch <branch>", "branch override")
  .option("--fail-fast-after <n>", "stop after this many consecutive failures", (v) => parseInt(v, 10), 3)
  .option("--json", "raw JSON output")
  .action(async (forks, opts) => {
    const input: Record<string, unknown> = { forks, failFastAfter: opts.failFastAfter };
    if (opts.branch) input.branch = opts.branch;
    await run("forkable_batch_sync", input, opts);
  });

// ---- Receipts -------------------------------------------------------------
program
  .command("receipt <operationId>")
  .description("Get the receipt for an operation")
  .option("--json", "raw JSON output")
  .action(async (operationId, opts) => {
    await run("forkable_receipt", { operationId }, opts);
  });

program
  .command("audit-log")
  .description("Query the audit log")
  .option("-t, --tool <tool>", "filter by tool name")
  .option("-o, --operation-id <id>", "filter by operation id")
  .option("--ok <bool>", "filter by ok flag (true|false)")
  .option("-l, --limit <n>", "max entries", (v) => parseInt(v, 10), 50)
  .option("--json", "raw JSON output")
  .action(async (opts) => {
    const input: Record<string, unknown> = { limit: opts.limit };
    if (opts.tool) input.tool = opts.tool;
    if (opts.operationId) input.operationId = opts.operationId;
    if (opts.ok !== undefined) input.ok = opts.ok === "true";
    await run("forkable_audit_log", input, opts);
  });

// ---- Rename (L7) ----------------------------------------------------------
const renameCmd = program
  .command("rename")
  .description("AST-aware polyglot rename for fork rebranding (plan / apply / rollback)");

renameCmd
  .command("plan <path>")
  .description("Build a read-only rename plan and write .forkable/rename-plan.{json,diff}")
  .requiredOption("--from <name>", "source canonical name (e.g. forkable)")
  .requiredOption("--to <name>", "target canonical name (e.g. splitshift)")
  .option("--layers <list>", "comma-separated subset of identity,symbols,deep-ts,textual,post")
  .option("--exclude <globs...>", "additional glob patterns to skip")
  .option("--lockfile-strategy <strategy>", "regenerate | skip", "regenerate")
  .option("--preserve-comments", "skip comment rewrites in source code", false)
  .option("--deep-ts", "force-enable ts-morph deep TS pass", false)
  .option("--no-deep-ts", "force-disable ts-morph deep TS pass")
  .option("--json", "raw JSON output")
  .action(async (repoPath, opts) => {
    const input: Record<string, unknown> = {
      path: repoPath,
      from: opts.from,
      to: opts.to,
      lockfileStrategy: opts.lockfileStrategy,
      preserveComments: !!opts.preserveComments,
    };
    if (opts.layers) input.layers = String(opts.layers).split(",").map((s) => s.trim()).filter(Boolean);
    if (opts.exclude) input.exclude = Array.isArray(opts.exclude) ? opts.exclude : [opts.exclude];
    if (opts.deepTs !== undefined) input.deepTs = !!opts.deepTs;
    await run("forkable_rename_plan", input, opts);
  });

renameCmd
  .command("apply <path>")
  .description("Apply a rename plan (snapshot → identity → symbols → textual → post)")
  .requiredOption("--plan <plan>", "path to rename-plan.json produced by `plan`")
  .option("--no-verify", "skip the post-rename verify hook")
  .option("--json", "raw JSON output")
  .action(async (repoPath, opts) => {
    const input: Record<string, unknown> = {
      path: repoPath,
      plan: opts.plan,
      verify: opts.verify !== false,
    };
    await run("forkable_rename_apply", input, opts);
  });

renameCmd
  .command("rollback <path>")
  .description("Restore the repo from the latest rename snapshot")
  .option("--snapshot-id <id>", "specific snapshot id (defaults to most recent)")
  .option("--json", "raw JSON output")
  .action(async (repoPath, opts) => {
    const input: Record<string, unknown> = { path: repoPath };
    if (opts.snapshotId) input.snapshotId = opts.snapshotId;
    await run("forkable_rename_rollback", input, opts);
  });

// ---- MCP server launcher --------------------------------------------------
program
  .command("mcp")
  .description("Start the MCP stdio server")
  .action(async () => {
    await import("./server.js");
  });

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`forkable cli fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
