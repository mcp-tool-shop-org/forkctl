import { describe, expect, it } from "vitest";
import { listForksTool } from "../src/tools/list-forks.js";
import { fleetFakeOctokit } from "./_helpers/fleet-octokit.js";
import { openState } from "../src/lib/state.js";
import { Operations } from "../src/lib/operations.js";

function ctx(octokit: ReturnType<typeof fleetFakeOctokit>) {
  const db = openState(":memory:");
  return { octokit, db, operations: new Operations(db) };
}

describe("forkctl_list_forks", () => {
  it("lists my forks (filters non-forks)", async () => {
    const oct = fleetFakeOctokit({
      myRepos: [
        { full_name: "me/fork-a", fork: true, default_branch: "main" },
        { full_name: "me/own-repo", fork: false, default_branch: "main" },
        { full_name: "me/fork-b", fork: true, default_branch: "main" },
      ],
    });
    const result = await listForksTool.handler({ limit: 100 }, ctx(oct));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.count).toBe(2);
    expect(result.data.forks.map((f) => f.fullName)).toEqual(["me/fork-a", "me/fork-b"]);
  });

  it("lists forks of a source repo when source provided", async () => {
    const oct = fleetFakeOctokit({
      sourceForks: {
        "octocat/source": [
          { full_name: "alice/source", fork: true, default_branch: "main" },
          { full_name: "bob/source", fork: true, default_branch: "main" },
        ],
      },
    });
    const result = await listForksTool.handler(
      { source: "octocat/source", limit: 100 },
      ctx(oct),
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.count).toBe(2);
    expect(result.data.forks[0]!.parent).toBe("octocat/source");
  });

  it("respects limit", async () => {
    const oct = fleetFakeOctokit({
      myRepos: Array.from({ length: 10 }, (_, i) => ({
        full_name: `me/fork-${i}`,
        fork: true,
        default_branch: "main",
      })),
    });
    const result = await listForksTool.handler({ limit: 3 }, ctx(oct));
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.count).toBe(3);
  });
});
