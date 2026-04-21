import { describe, expect, it } from "vitest";
import { fleetHealthTool } from "../src/tools/fleet-health.js";
import { fleetFakeOctokit } from "./_helpers/fleet-octokit.js";
import { openState } from "../src/lib/state.js";
import { Operations } from "../src/lib/operations.js";

function ctx(octokit: ReturnType<typeof fleetFakeOctokit>) {
  const db = openState(":memory:");
  return { octokit, db, operations: new Operations(db) };
}

describe("forkctl_fleet_health", () => {
  it("computes status per fork and sorts diverged + behind to the top", async () => {
    const oct = fleetFakeOctokit({
      myRepos: [
        { full_name: "me/in-sync", fork: true, parent: { full_name: "u/x", default_branch: "main" }, default_branch: "main" },
        { full_name: "me/behind", fork: true, parent: { full_name: "u/y", default_branch: "main" }, default_branch: "main" },
        { full_name: "me/diverged", fork: true, parent: { full_name: "u/z", default_branch: "main" }, default_branch: "main" },
      ],
      compareByFork: {
        "me/in-sync": { status: "identical", ahead_by: 0, behind_by: 0 },
        "me/behind": { status: "behind", ahead_by: 0, behind_by: 4 },
        "me/diverged": { status: "diverged", ahead_by: 1, behind_by: 2 },
      },
    });
    const result = await fleetHealthTool.handler({ limit: 25 }, ctx(oct));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.scanned).toBe(3);
    expect(result.data.forks[0]!.status).toBe("diverged");
    expect(result.data.forks[1]!.status).toBe("behind");
    expect(result.data.summary.diverged).toBe(1);
    expect(result.data.summary.behind).toBe(1);
    expect(result.data.summary.inSync).toBe(1);
  });

  it("scans an explicit list when forks are provided", async () => {
    const oct = fleetFakeOctokit({
      myRepos: [
        { full_name: "me/one", fork: true, parent: { full_name: "u/a", default_branch: "main" }, default_branch: "main" },
      ],
      compareByFork: { "me/one": { status: "identical", ahead_by: 0, behind_by: 0 } },
    });
    const result = await fleetHealthTool.handler(
      { forks: ["me/one"], limit: 25 },
      ctx(oct),
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.scanned).toBe(1);
  });

  it("uses upstream default branch when fork renamed its default (backend F-002)", async () => {
    // Fork renamed main→trunk; upstream still on main. Compare must be
    // upstream-main ... fork-owner:trunk, NOT trunk...trunk.
    const calls = {
      compareCommits: [] as Array<{ owner: string; repo: string; basehead: string }>,
    };
    const oct = fleetFakeOctokit({
      myRepos: [
        {
          full_name: "me/renamed",
          fork: true,
          parent: { full_name: "octocat/source", default_branch: "main" },
          default_branch: "trunk",
        },
      ],
      compareByFork: { "me/renamed": { status: "behind", ahead_by: 0, behind_by: 3 } },
      calls,
    });
    const result = await fleetHealthTool.handler(
      { forks: ["me/renamed"], limit: 25 },
      ctx(oct),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(calls.compareCommits).toHaveLength(1);
    const cmp = calls.compareCommits[0]!;
    expect(cmp.owner).toBe("octocat");
    expect(cmp.repo).toBe("source");
    expect(cmp.basehead).toBe("main...me:trunk");
    expect(result.data.forks[0]!.status).toBe("behind");
  });

  it("non-fork → no_upstream", async () => {
    const oct = fleetFakeOctokit({
      myRepos: [
        { full_name: "me/own", fork: false, default_branch: "main" },
      ],
    });
    const result = await fleetHealthTool.handler(
      { forks: ["me/own"], limit: 25 },
      ctx(oct),
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.forks[0]!.status).toBe("no_upstream");
  });
});
