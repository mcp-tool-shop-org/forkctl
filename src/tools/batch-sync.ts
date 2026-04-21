import { mapGitHubError, parseRepoRef } from "../lib/github.js";
import { safe } from "../lib/result.js";
import { BatchSyncInputSchema, type BatchSyncInput } from "../schemas/fleet.js";
import type { ToolDescriptor } from "./types.js";

export interface BatchSyncResult {
  fork: string;
  branch: string;
  outcome: "fast-forward" | "merge" | "none" | "conflict" | "error" | "skipped";
  message: string;
}

export interface BatchSyncOutput {
  scheduled: number;
  attempted: number;
  succeeded: number;
  conflicts: number;
  errors: number;
  stoppedEarly: boolean;
  results: BatchSyncResult[];
}

/**
 * Sequential, rate-limit-friendly batch sync. Runs sync against each fork
 * in order. Stops early after `failFastAfter` consecutive non-success outcomes
 * (conflict + error count, but not 'none' which is a successful no-op).
 */
export const batchSyncTool: ToolDescriptor<BatchSyncInput, BatchSyncOutput> = {
  name: "forkctl_batch_sync",
  description:
    "Sync multiple forks in sequence (rate-limit-friendly). Stops after `failFastAfter` consecutive failures (conflict or error). Conflicts are surfaced as 'conflict' outcomes — never force-pushed. Use forkctl_propose_sync_pr to resolve.",
  inputSchema: BatchSyncInputSchema,
  handler: (input, ctx) =>
    safe(async () => {
      const results: BatchSyncResult[] = [];
      let consecutiveFailures = 0;
      let stoppedEarly = false;

      for (const ref of input.forks) {
        if (consecutiveFailures >= input.failFastAfter) {
          results.push({
            fork: ref,
            branch: input.branch ?? "unknown",
            outcome: "skipped",
            message: `Skipped after ${input.failFastAfter} consecutive failures.`,
          });
          stoppedEarly = true;
          continue;
        }
        const r = await syncOne(ctx.octokit, ref, input.branch);
        results.push(r);
        if (r.outcome === "conflict" || r.outcome === "error") {
          consecutiveFailures++;
        } else {
          consecutiveFailures = 0;
        }
      }

      const attempted = results.filter((r) => r.outcome !== "skipped").length;
      const succeeded = results.filter(
        (r) => r.outcome === "fast-forward" || r.outcome === "merge" || r.outcome === "none",
      ).length;
      const conflicts = results.filter((r) => r.outcome === "conflict").length;
      const errors = results.filter((r) => r.outcome === "error").length;

      return {
        scheduled: input.forks.length,
        attempted,
        succeeded,
        conflicts,
        errors,
        stoppedEarly,
        results,
      };
    }),
};

async function syncOne(
  octokit: import("@octokit/rest").Octokit,
  ref: string,
  branchOverride: string | undefined,
): Promise<BatchSyncResult> {
  const { owner, repo } = parseRepoRef(ref);
  let branch = branchOverride;
  try {
    if (!branch) {
      const r = await octokit.rest.repos.get({ owner, repo });
      branch = r.data.default_branch;
    }
    const res = await octokit.rest.repos.mergeUpstream({ owner, repo, branch });
    const data = res.data as { merge_type?: "fast-forward" | "merge" | "none"; message?: string };
    return {
      fork: ref,
      branch,
      outcome: data.merge_type ?? "none",
      message: data.message ?? "Sync complete.",
    };
  } catch (err) {
    const e = mapGitHubError(err);
    if (e.code === "GITHUB_CONFLICT") {
      return {
        fork: ref,
        branch: branch ?? "unknown",
        outcome: "conflict",
        message: "Diverged — fast-forward not possible. Use forkctl_propose_sync_pr.",
      };
    }
    return {
      fork: ref,
      branch: branch ?? "unknown",
      outcome: "error",
      message: e.message,
    };
  }
}
