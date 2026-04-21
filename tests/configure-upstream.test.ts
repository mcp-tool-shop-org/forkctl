import { describe, expect, it } from "vitest";
import { configureUpstreamTool } from "../src/tools/configure-upstream.js";
import { bootstrapFakeOctokit } from "./_helpers/bootstrap-octokit.js";
import { openState } from "../src/lib/state.js";
import { Operations } from "../src/lib/operations.js";

function ctx(octokit: ReturnType<typeof bootstrapFakeOctokit>) {
  const db = openState(":memory:");
  return { octokit, db, operations: new Operations(db) };
}

describe("forkctl_configure_upstream", () => {
  it("returns the canonical git remote sequence and installs the workflow", async () => {
    const calls = { createOrUpdateFile: [] as Array<{ path: string; message: string; content: string }> };
    const oct = bootstrapFakeOctokit({ calls });
    const result = await configureUpstreamTool.handler(
      {
        destination: "myhandle/forked-repo",
        source: "octocat/source-repo",
        branch: "main",
        installWorkflow: true,
      },
      ctx(oct),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.workflowInstalled).toBe(true);
    expect(result.data.workflowPath).toBe(".github/workflows/sync-upstream.yml");
    expect(result.data.remoteCommands.join("\n")).toContain("git remote add upstream https://github.com/octocat/source-repo.git");
    expect(calls.createOrUpdateFile.some((c) => c.path === ".github/workflows/sync-upstream.yml")).toBe(true);
  });

  it("skips workflow when installWorkflow=false", async () => {
    const calls = { createOrUpdateFile: [] as Array<{ path: string; message: string; content: string }> };
    const oct = bootstrapFakeOctokit({ calls });
    const result = await configureUpstreamTool.handler(
      {
        destination: "myhandle/forked",
        source: "octocat/source",
        branch: "main",
        installWorkflow: false,
      },
      ctx(oct),
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.workflowInstalled).toBe(false);
    expect(calls.createOrUpdateFile).toHaveLength(0);
  });

  it("reports workflowInstalled=false when one already exists", async () => {
    const oct = bootstrapFakeOctokit({
      existingFiles: new Set([".github/workflows/sync-upstream.yml"]),
    });
    const result = await configureUpstreamTool.handler(
      {
        destination: "myhandle/forked",
        source: "octocat/source",
        branch: "main",
        installWorkflow: true,
      },
      ctx(oct),
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.workflowInstalled).toBe(false);
  });
});
