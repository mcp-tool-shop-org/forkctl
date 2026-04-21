import type { Octokit } from "@octokit/rest";
import { mapGitHubError } from "./github.js";
import type { StepId } from "./profiles.js";

export type StepOutcome = "applied" | "skipped" | "advisory" | "failed";

export interface StepResult {
  step: StepId;
  outcome: StepOutcome;
  message: string;
  /** Human-actionable instructions when outcome is 'advisory'. */
  advice?: string[];
  /** Error details when outcome is 'failed'. */
  error?: { code: string; message: string };
}

export interface StepContext {
  octokit: Octokit;
  destinationOwner: string;
  destinationRepo: string;
  sourceOwner?: string;
  sourceRepo?: string;
  apply: boolean;
}

export type StepExecutor = (ctx: StepContext) => Promise<StepResult>;

export const STEP_EXECUTORS: Record<StepId, StepExecutor> = {
  set_upstream_remote: async (ctx) => {
    const upstream = ctx.sourceOwner && ctx.sourceRepo ? `${ctx.sourceOwner}/${ctx.sourceRepo}` : null;
    return advisory("set_upstream_remote", "Add the upstream remote locally — git remotes are not server-side state.", [
      "git clone https://github.com/" + ctx.destinationOwner + "/" + ctx.destinationRepo + ".git",
      `cd ${ctx.destinationRepo}`,
      upstream
        ? `git remote add upstream https://github.com/${upstream}.git`
        : "git remote add upstream <UPSTREAM_URL>  # source unknown",
      "git fetch upstream",
    ]);
  },

  install_sync_workflow: async (ctx) =>
    ensureFile(
      ctx,
      "install_sync_workflow",
      ".github/workflows/sync-upstream.yml",
      SYNC_WORKFLOW,
      "Sync-upstream workflow",
    ),

  add_contributor_readme_block: async () =>
    advisory(
      "add_contributor_readme_block",
      "Append a 'Working on this fork' block to the README so collaborators know to sync upstream.",
      [
        "## Working on this fork",
        "1. `git fetch upstream`",
        "2. `git rebase upstream/main`",
        "3. Push and open a PR back to the upstream when ready.",
      ],
    ),

  ensure_pr_template: async (ctx) =>
    ensureFile(
      ctx,
      "ensure_pr_template",
      ".github/PULL_REQUEST_TEMPLATE.md",
      PR_TEMPLATE,
      "PR template",
    ),

  strip_template_references: async () =>
    advisory(
      "strip_template_references",
      "Manually grep the codebase for placeholder strings left over from the template (TODO: name, FIXME: org, my-template, etc.) and replace them.",
      [
        'rg -i "my-template|template-org|TODO: name|FIXME: org"',
      ],
    ),

  fresh_readme: async () =>
    advisory(
      "fresh_readme",
      "Replace the template's README with one that describes THIS product, not the template's purpose.",
    ),

  prompt_fresh_license: async () =>
    advisory(
      "prompt_fresh_license",
      "Update LICENSE copyright year and holder to match the new product owner.",
    ),

  ensure_env_example: async (ctx) =>
    ensureFile(
      ctx,
      "ensure_env_example",
      ".env.example",
      "# Required environment variables. Copy to .env and fill in.\n",
      ".env.example stub",
    ),

  replace_placeholders: async () =>
    advisory(
      "replace_placeholders",
      "Find-and-replace seed values that should be team-specific.",
      [
        'rg -i "your-team|your-org|your-name|YOUR_API_KEY"',
      ],
    ),

  set_codeowners: async () =>
    advisory(
      "set_codeowners",
      "Add a CODEOWNERS file at .github/CODEOWNERS naming the responsible team(s).",
      ["* @your-org/your-team"],
    ),

  lock_visibility_private: async (ctx) => {
    if (!ctx.apply) return advisory("lock_visibility_private", "Would set repo visibility to private.");
    try {
      await ctx.octokit.rest.repos.update({
        owner: ctx.destinationOwner,
        repo: ctx.destinationRepo,
        private: true,
      });
      return applied("lock_visibility_private", "Repository set to private.");
    } catch (err) {
      const e = mapGitHubError(err);
      return failed("lock_visibility_private", e);
    }
  },

  client_named_branches: async () =>
    advisory(
      "client_named_branches",
      "Create per-client working branches to keep client work isolated.",
      ["git checkout -b client/<client-name>"],
    ),

  sanitized_history_check: async () =>
    advisory(
      "sanitized_history_check",
      "Audit git history for previous-client artifacts before delivering this copy.",
      [
        "git log --all --full-history --source -p -- '*' | rg -i 'previous-client-name|other-secret'",
        "Use git-filter-repo or BFG if you find anything that needs scrubbing.",
      ],
    ),

  lock_default_branch: async (ctx) => {
    if (!ctx.apply)
      return advisory("lock_default_branch", "Would enable branch protection on the default branch.");
    try {
      const repo = await ctx.octokit.rest.repos.get({
        owner: ctx.destinationOwner,
        repo: ctx.destinationRepo,
      });
      const branch = repo.data.default_branch;
      await ctx.octokit.rest.repos.updateBranchProtection({
        owner: ctx.destinationOwner,
        repo: ctx.destinationRepo,
        branch,
        required_status_checks: null,
        enforce_admins: false,
        required_pull_request_reviews: { required_approving_review_count: 1 },
        restrictions: null,
      });
      return applied("lock_default_branch", `Branch protection enabled on ${branch}.`);
    } catch (err) {
      const e = mapGitHubError(err);
      return failed("lock_default_branch", e);
    }
  },

  detach_upstream: async () =>
    advisory(
      "detach_upstream",
      "Remove any upstream remote so this experiment can't accidentally sync.",
      ["git remote remove upstream"],
    ),

  mark_experiment_in_readme: async () =>
    advisory(
      "mark_experiment_in_readme",
      "Add a banner to the README so future visitors know this is an experiment fork, not a maintained product.",
    ),
};

async function ensureFile(
  ctx: StepContext,
  step: StepId,
  path: string,
  content: string,
  label: string,
): Promise<StepResult> {
  const exists = await fileExists(ctx.octokit, ctx.destinationOwner, ctx.destinationRepo, path);
  if (exists) return skipped(step, `${label} already exists at ${path}.`);
  if (!ctx.apply) return advisory(step, `Would create ${label} at ${path}.`);
  try {
    await ctx.octokit.rest.repos.createOrUpdateFileContents({
      owner: ctx.destinationOwner,
      repo: ctx.destinationRepo,
      path,
      message: `forkctl: add ${label}`,
      content: Buffer.from(content, "utf8").toString("base64"),
    });
    return applied(step, `Created ${label} at ${path}.`);
  } catch (err) {
    const e = mapGitHubError(err);
    return failed(step, e);
  }
}

async function fileExists(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
): Promise<boolean> {
  try {
    await octokit.rest.repos.getContent({ owner, repo, path });
    return true;
  } catch (err) {
    const e = mapGitHubError(err);
    if (e.code === "GITHUB_NOT_FOUND") return false;
    throw e;
  }
}

function applied(step: StepId, message: string): StepResult {
  return { step, outcome: "applied", message };
}
function skipped(step: StepId, message: string): StepResult {
  return { step, outcome: "skipped", message };
}
function failed(
  step: StepId,
  e: { code: string; message: string; hint?: string },
): StepResult {
  return { step, outcome: "failed", message: e.message, error: { code: e.code, message: e.message } };
}
function advisory(step: StepId, message: string, advice?: string[]): StepResult {
  return advice && advice.length > 0
    ? { step, outcome: "advisory", message, advice }
    : { step, outcome: "advisory", message };
}

const SYNC_WORKFLOW = `name: Sync upstream

on:
  schedule:
    - cron: "0 6 * * *"
  workflow_dispatch:

concurrency:
  group: sync-upstream-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Sync default branch with upstream
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: gh repo sync \${{ github.repository }}
`;

const PR_TEMPLATE = `## What

(One sentence — what does this change?)

## Why

(One sentence — why is it needed?)

## How tested

- [ ] (test or check that proves the change works)
`;
