import { describe, expect, it } from "vitest";
import { syncTool } from "../src/tools/sync.js";
import { syncFakeOctokit } from "./_helpers/sync-octokit.js";
import { openState } from "../src/lib/state.js";
import { Operations } from "../src/lib/operations.js";

function ctx(octokit: ReturnType<typeof syncFakeOctokit>) {
  const db = openState(":memory:");
  return { octokit, db, operations: new Operations(db) };
}

describe("forkable_sync", () => {
  it("fast-forward sync returns mergeType=fast-forward", async () => {
    const result = await syncTool.handler({ fork: "myhandle/fork" }, ctx(syncFakeOctokit()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.mergeType).toBe("fast-forward");
    expect(result.data.fork).toBe("myhandle/fork");
    expect(result.data.branch).toBe("main");
  });

  it("uses provided branch instead of default", async () => {
    const calls = { mergeUpstream: [] as unknown[] };
    const oct = syncFakeOctokit({ calls });
    await syncTool.handler(
      { fork: "myhandle/fork", branch: "release" },
      ctx(oct),
    );
    const args = calls.mergeUpstream[0] as { branch: string };
    expect(args.branch).toBe("release");
  });

  it("conflict surfaces SYNC_CONFLICT with hint pointing to propose_sync_pr", async () => {
    const oct = syncFakeOctokit({ mergeUpstream: "conflict" });
    const result = await syncTool.handler({ fork: "myhandle/fork" }, ctx(oct));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SYNC_CONFLICT");
    expect(result.error.hint).toContain("propose_sync_pr");
  });

  it("none merge type still returns ok", async () => {
    const oct = syncFakeOctokit({ mergeUpstream: "ok-none" });
    const result = await syncTool.handler({ fork: "myhandle/fork" }, ctx(oct));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.mergeType).toBe("none");
  });
});
