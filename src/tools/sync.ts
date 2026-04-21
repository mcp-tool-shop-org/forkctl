import { ForkctlError } from "../lib/errors.js";
import { mapGitHubError, parseRepoRef } from "../lib/github.js";
import { safe } from "../lib/result.js";
import { SyncInputSchema, type SyncInput } from "../schemas/sync.js";
import type { ToolDescriptor } from "./types.js";

export interface SyncOutput {
  fork: string;
  branch: string;
  mergeType: "fast-forward" | "merge" | "none";
  baseBranch: string;
  message: string;
}

/**
 * Calls POST /repos/{owner}/{repo}/merge-upstream.
 *
 * The endpoint syncs a branch of a fork with its upstream parent. Per GitHub
 * docs, when there are conflicts the call returns 409; we map that to
 * SYNC_CONFLICT and recommend the propose_sync_pr fallback.
 */
export const syncTool: ToolDescriptor<SyncInput, SyncOutput> = {
  name: "forkctl_sync",
  description:
    "Sync a fork branch with its upstream parent via POST /repos/{owner}/{repo}/merge-upstream. Reports the merge type (fast-forward | merge | none) honestly. On conflict, surfaces SYNC_CONFLICT — call forkctl_propose_sync_pr to open a PR-based sync.",
  inputSchema: SyncInputSchema,
  handler: (input, ctx) =>
    safe(async () => {
      const { owner, repo } = parseRepoRef(input.fork);
      let branch = input.branch;
      if (!branch) {
        const r = await ctx.octokit.rest.repos.get({ owner, repo }).catch((err) => {
          throw mapGitHubError(err);
        });
        branch = r.data.default_branch;
      }
      try {
        const res = await ctx.octokit.rest.repos.mergeUpstream({
          owner,
          repo,
          branch,
        });
        const data = res.data as {
          merge_type?: "fast-forward" | "merge" | "none";
          base_branch?: string;
          message?: string;
        };
        return {
          fork: `${owner}/${repo}`,
          branch,
          mergeType: data.merge_type ?? "none",
          baseBranch: data.base_branch ?? "unknown",
          message: data.message ?? "Sync complete.",
        };
      } catch (err) {
        const e = mapGitHubError(err);
        if (e.code === "GITHUB_CONFLICT") {
          throw new ForkctlError(
            "SYNC_CONFLICT",
            "Sync conflicts with upstream — fast-forward not possible.",
            {
              hint: "Call forkctl_propose_sync_pr to open a PR-based sync that you can resolve interactively.",
              details: { fork: `${owner}/${repo}`, branch },
            },
          );
        }
        throw e;
      }
    }),
};
