import { describe, expect, it } from "vitest";
import { proposeSyncPrTool } from "../src/tools/propose-sync-pr.js";
import { syncFakeOctokit } from "./_helpers/sync-octokit.js";
import { openState } from "../src/lib/state.js";
import { Operations } from "../src/lib/operations.js";

function ctx(octokit: ReturnType<typeof syncFakeOctokit>) {
  const db = openState(":memory:");
  return { octokit, db, operations: new Operations(db) };
}

describe("forkable_propose_sync_pr", () => {
  it("creates a sync branch at upstream HEAD and opens a PR", async () => {
    const calls = { createRef: [] as unknown[], pullsCreate: [] as unknown[] };
    const oct = syncFakeOctokit({ calls, upstreamSha: "deadbeef00" });
    const result = await proposeSyncPrTool.handler(
      {
        fork: "myhandle/fork",
        syncBranch: "forkable/sync-from-upstream",
        prTitle: "forkable: sync from upstream",
      },
      ctx(oct),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.prUrl).toContain("github.com");
    const ref = calls.createRef[0] as { sha: string; ref: string };
    expect(ref.sha).toBe("deadbeef00");
    expect(ref.ref).toBe("refs/heads/forkable/sync-from-upstream");
    const pr = calls.pullsCreate[0] as { head: string; base: string };
    expect(pr.head).toBe("forkable/sync-from-upstream");
    expect(pr.base).toBe("main");
  });

  it("tolerates pre-existing sync branch (422 on createRef)", async () => {
    const calls = { createRef: [] as unknown[], pullsCreate: [] as unknown[] };
    const oct = syncFakeOctokit({ calls, createRef: "exists" });
    const result = await proposeSyncPrTool.handler(
      {
        fork: "myhandle/fork",
        syncBranch: "forkable/sync-from-upstream",
        prTitle: "forkable: sync from upstream",
      },
      ctx(oct),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(calls.pullsCreate).toHaveLength(1);
  });

  it("rejects non-fork repos", async () => {
    const oct = syncFakeOctokit({ fork: { fork: false, default_branch: "main" } });
    const result = await proposeSyncPrTool.handler(
      {
        fork: "myhandle/not-fork",
        syncBranch: "forkable/sync-from-upstream",
        prTitle: "forkable: sync from upstream",
      },
      ctx(oct),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  it("stale sync branch at different SHA surfaces SYNC_BRANCH_EXISTS (backend F-003)", async () => {
    // After createRef returns 422, the handler reads back the existing branch.
    // If the existing branch points at a SHA different from upstream's HEAD,
    // that's a real collision and we must surface SYNC_BRANCH_EXISTS rather
    // than silently reusing the stale branch (which would hide divergence).
    const oct = syncFakeOctokit({
      createRef: "exists",
      upstreamSha: "upstreamhead00",
      existingSyncBranchSha: "staleshaffff11",
      syncBranchName: "forkable/sync-from-upstream",
    });
    const result = await proposeSyncPrTool.handler(
      {
        fork: "myhandle/fork",
        syncBranch: "forkable/sync-from-upstream",
        prTitle: "forkable: sync from upstream",
      },
      ctx(oct),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SYNC_BRANCH_EXISTS");
    expect(result.error.hint).toMatch(/delete|different syncBranch/i);
    expect(result.error.details).toMatchObject({
      syncBranch: "forkable/sync-from-upstream",
    });
  });

  it("PR conflict (existing PR) surfaces GITHUB_VALIDATION with hint", async () => {
    const oct = syncFakeOctokit({ prCreate: "conflict" });
    const result = await proposeSyncPrTool.handler(
      {
        fork: "myhandle/fork",
        syncBranch: "forkable/sync-from-upstream",
        prTitle: "forkable: sync from upstream",
      },
      ctx(oct),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("GITHUB_VALIDATION");
    expect(result.error.hint).toContain("Check open PRs");
  });
});
