import { describe, expect, it } from "vitest";
import { bootstrapTool } from "../src/tools/bootstrap.js";
import { bootstrapFakeOctokit } from "./_helpers/bootstrap-octokit.js";
import { openState } from "../src/lib/state.js";
import { Operations } from "../src/lib/operations.js";

function ctx(octokit: ReturnType<typeof bootstrapFakeOctokit>) {
  const db = openState(":memory:");
  return { octokit, db, operations: new Operations(db) };
}

describe("forkctl_bootstrap", () => {
  it("contributor profile installs sync workflow when missing and returns advisory upstream commands", async () => {
    const calls = { createOrUpdateFile: [] as Array<{ path: string; message: string; content: string }> };
    const oct = bootstrapFakeOctokit({ calls });
    const result = await bootstrapTool.handler(
      {
        destination: "myhandle/forked-repo",
        source: "octocat/source-repo",
        profile: "contributor",
        apply: true,
      },
      ctx(oct),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.profile).toBe("contributor");
    const stepIds = result.data.results.map((r) => r.step);
    expect(stepIds).toContain("set_upstream_remote");
    expect(stepIds).toContain("install_sync_workflow");
    const sync = result.data.results.find((r) => r.step === "install_sync_workflow")!;
    expect(sync.outcome).toBe("applied");
    expect(calls.createOrUpdateFile.some((c) => c.path === ".github/workflows/sync-upstream.yml")).toBe(true);
    const upstream = result.data.results.find((r) => r.step === "set_upstream_remote")!;
    expect(upstream.outcome).toBe("advisory");
    expect(upstream.advice?.join("\n")).toContain("octocat/source-repo");
  });

  it("apply=false produces only advisory outcomes for executable steps", async () => {
    const calls = { createOrUpdateFile: [] as Array<{ path: string; message: string; content: string }> };
    const oct = bootstrapFakeOctokit({ calls });
    const result = await bootstrapTool.handler(
      {
        destination: "myhandle/forked-repo",
        source: "octocat/source-repo",
        profile: "contributor",
        apply: false,
      },
      ctx(oct),
    );
    if (!result.ok) throw new Error("expected ok");
    const sync = result.data.results.find((r) => r.step === "install_sync_workflow")!;
    expect(sync.outcome).toBe("advisory");
    expect(calls.createOrUpdateFile).toHaveLength(0);
  });

  it("internal-seed profile sets visibility to private when apply=true", async () => {
    const calls = { update: [] as unknown[] };
    const oct = bootstrapFakeOctokit({ calls });
    const result = await bootstrapTool.handler(
      {
        destination: "myorg/internal-copy",
        profile: "internal-seed",
        apply: true,
      },
      ctx(oct),
    );
    if (!result.ok) throw new Error("expected ok");
    const lock = result.data.results.find((r) => r.step === "lock_visibility_private")!;
    expect(lock.outcome).toBe("applied");
    expect(calls.update).toHaveLength(1);
  });

  it("client-delivery profile applies branch protection when apply=true", async () => {
    const calls = { updateBranchProtection: [] as unknown[] };
    const oct = bootstrapFakeOctokit({ calls });
    const result = await bootstrapTool.handler(
      {
        destination: "myorg/client-x-copy",
        profile: "client-delivery",
        apply: true,
      },
      ctx(oct),
    );
    if (!result.ok) throw new Error("expected ok");
    const lock = result.data.results.find((r) => r.step === "lock_default_branch")!;
    expect(lock.outcome).toBe("applied");
    expect(calls.updateBranchProtection).toHaveLength(1);
  });

  it("skips ensure_pr_template when one already exists", async () => {
    const oct = bootstrapFakeOctokit({
      existingFiles: new Set([".github/PULL_REQUEST_TEMPLATE.md"]),
    });
    const result = await bootstrapTool.handler(
      {
        destination: "myhandle/forked",
        source: "octocat/source",
        profile: "contributor",
        apply: true,
      },
      ctx(oct),
    );
    if (!result.ok) throw new Error("expected ok");
    const pr = result.data.results.find((r) => r.step === "ensure_pr_template")!;
    expect(pr.outcome).toBe("skipped");
  });

  it("summary counts match the result outcomes", async () => {
    const oct = bootstrapFakeOctokit();
    const result = await bootstrapTool.handler(
      { destination: "h/r", profile: "experiment", apply: true },
      ctx(oct),
    );
    if (!result.ok) throw new Error("expected ok");
    const total =
      result.data.summary.applied +
      result.data.summary.skipped +
      result.data.summary.advisory +
      result.data.summary.failed;
    expect(total).toBe(result.data.results.length);
  });
});
