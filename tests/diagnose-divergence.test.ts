import { describe, expect, it } from "vitest";
import { diagnoseDivergenceTool } from "../src/tools/diagnose-divergence.js";
import { syncFakeOctokit } from "./_helpers/sync-octokit.js";
import { openState } from "../src/lib/state.js";
import { Operations } from "../src/lib/operations.js";

function ctx(octokit: ReturnType<typeof syncFakeOctokit>) {
  const db = openState(":memory:");
  return { octokit, db, operations: new Operations(db) };
}

describe("forkctl_diagnose_divergence", () => {
  it("behind: fastForwardable=true and recommends sync", async () => {
    const oct = syncFakeOctokit({
      compare: { status: "behind", ahead_by: 0, behind_by: 5, total_commits: 5 },
    });
    const result = await diagnoseDivergenceTool.handler(
      { fork: "myhandle/fork" },
      ctx(oct),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("behind");
    expect(result.data.fastForwardable).toBe(true);
    expect(result.data.recommendation).toContain("forkctl_sync");
  });

  it("diverged: fastForwardable=false and recommends propose_sync_pr", async () => {
    const oct = syncFakeOctokit({
      compare: { status: "diverged", ahead_by: 2, behind_by: 5, total_commits: 7 },
    });
    const result = await diagnoseDivergenceTool.handler(
      { fork: "myhandle/fork" },
      ctx(oct),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("diverged");
    expect(result.data.fastForwardable).toBe(false);
    expect(result.data.recommendation).toContain("propose_sync_pr");
  });

  it("ahead: fork has commits upstream lacks (F-003)", async () => {
    const oct = syncFakeOctokit({
      compare: { status: "ahead", ahead_by: 3, behind_by: 0, total_commits: 3 },
    });
    const result = await diagnoseDivergenceTool.handler(
      { fork: "myhandle/fork" },
      ctx(oct),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("ahead");
    expect(result.data.aheadBy).toBe(3);
    expect(result.data.behindBy).toBe(0);
    // ahead forks can't be fast-forwarded — recommendation should hint at upstream PR, not sync.
    expect(result.data.fastForwardable).toBe(false);
    expect(result.data.recommendation).toMatch(/PR upstream|ahead/i);
  });

  it("identical: in sync", async () => {
    const oct = syncFakeOctokit({
      compare: { status: "identical", ahead_by: 0, behind_by: 0, total_commits: 0 },
    });
    const result = await diagnoseDivergenceTool.handler(
      { fork: "myhandle/fork" },
      ctx(oct),
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.status).toBe("identical");
    expect(result.data.fastForwardable).toBe(true);
    expect(result.data.recommendation).toMatch(/no action/i);
  });

  it("uses upstream's default branch when fork renamed its default (backend F-001)", async () => {
    // Upstream still on `master`, fork renamed to `main`. The compare call
    // MUST be upstream-master...fork-owner:main, not fork-main...fork-main.
    const calls = { compareCommits: [] as unknown[] };
    const oct = syncFakeOctokit({
      fork: {
        fork: true,
        parent: { full_name: "octocat/source", default_branch: "master" },
        default_branch: "main",
      },
      compare: { status: "behind", ahead_by: 0, behind_by: 2, total_commits: 2 },
      calls,
    });
    const result = await diagnoseDivergenceTool.handler(
      { fork: "myhandle/fork" },
      ctx(oct),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.upstream).toBe("octocat/source");
    expect(result.data.branch).toBe("main");
    expect(calls.compareCommits).toHaveLength(1);
    const cmp = calls.compareCommits[0] as { owner: string; repo: string; basehead: string };
    expect(cmp.owner).toBe("octocat");
    expect(cmp.repo).toBe("source");
    // base = upstream default (master); head = fork owner:fork branch (myhandle:main)
    expect(cmp.basehead).toBe("master...myhandle:main");
  });

  it("rejects non-fork repos with INVALID_INPUT", async () => {
    const oct = syncFakeOctokit({
      fork: { fork: false, default_branch: "main" },
    });
    const result = await diagnoseDivergenceTool.handler(
      { fork: "myhandle/not-a-fork" },
      ctx(oct),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
  });
});
