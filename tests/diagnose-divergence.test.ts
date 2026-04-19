import { describe, expect, it } from "vitest";
import { diagnoseDivergenceTool } from "../src/tools/diagnose-divergence.js";
import { syncFakeOctokit } from "./_helpers/sync-octokit.js";
import { openState } from "../src/lib/state.js";
import { Operations } from "../src/lib/operations.js";

function ctx(octokit: ReturnType<typeof syncFakeOctokit>) {
  const db = openState(":memory:");
  return { octokit, db, operations: new Operations(db) };
}

describe("forkable_diagnose_divergence", () => {
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
    expect(result.data.recommendation).toContain("forkable_sync");
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
