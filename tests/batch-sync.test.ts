import { describe, expect, it } from "vitest";
import { batchSyncTool } from "../src/tools/batch-sync.js";
import { fleetFakeOctokit } from "./_helpers/fleet-octokit.js";
import { openState } from "../src/lib/state.js";
import { Operations } from "../src/lib/operations.js";

function ctx(octokit: ReturnType<typeof fleetFakeOctokit>) {
  const db = openState(":memory:");
  return { octokit, db, operations: new Operations(db) };
}

describe("forkctl_batch_sync", () => {
  it("syncs a list of forks sequentially", async () => {
    const calls = { mergeUpstream: [] as Array<{ owner: string; repo: string; branch: string }> };
    const oct = fleetFakeOctokit({
      myRepos: [
        { full_name: "me/a", fork: true, default_branch: "main" },
        { full_name: "me/b", fork: true, default_branch: "main" },
      ],
      mergeByFork: { "me/a": "ok-ff", "me/b": "ok-merge" },
      calls,
    });
    const result = await batchSyncTool.handler(
      { forks: ["me/a", "me/b"], failFastAfter: 3 },
      ctx(oct),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.scheduled).toBe(2);
    expect(result.data.attempted).toBe(2);
    expect(result.data.succeeded).toBe(2);
    expect(calls.mergeUpstream).toHaveLength(2);
  });

  it("conflicts surface as outcome=conflict, not as errors", async () => {
    const oct = fleetFakeOctokit({
      myRepos: [{ full_name: "me/a", fork: true, default_branch: "main" }],
      mergeByFork: { "me/a": "conflict" },
    });
    const result = await batchSyncTool.handler(
      { forks: ["me/a"], failFastAfter: 3 },
      ctx(oct),
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.conflicts).toBe(1);
    expect(result.data.errors).toBe(0);
    expect(result.data.results[0]!.outcome).toBe("conflict");
  });

  it("stops early after failFastAfter consecutive failures", async () => {
    const oct = fleetFakeOctokit({
      myRepos: [
        { full_name: "me/a", fork: true, default_branch: "main" },
        { full_name: "me/b", fork: true, default_branch: "main" },
        { full_name: "me/c", fork: true, default_branch: "main" },
        { full_name: "me/d", fork: true, default_branch: "main" },
      ],
      mergeByFork: {
        "me/a": "conflict",
        "me/b": "conflict",
        "me/c": "ok-ff",
        "me/d": "ok-ff",
      },
    });
    const result = await batchSyncTool.handler(
      { forks: ["me/a", "me/b", "me/c", "me/d"], failFastAfter: 2 },
      ctx(oct),
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.stoppedEarly).toBe(true);
    const skipped = result.data.results.filter((r) => r.outcome === "skipped");
    expect(skipped.length).toBeGreaterThan(0);
  });

  it("uses branch override when provided", async () => {
    const calls = { mergeUpstream: [] as Array<{ owner: string; repo: string; branch: string }> };
    const oct = fleetFakeOctokit({
      myRepos: [{ full_name: "me/a", fork: true, default_branch: "main" }],
      calls,
    });
    await batchSyncTool.handler(
      { forks: ["me/a"], branch: "release", failFastAfter: 3 },
      ctx(oct),
    );
    expect(calls.mergeUpstream[0]!.branch).toBe("release");
  });
});
