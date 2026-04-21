import { describe, expect, it } from "vitest";
import { dispatch } from "../src/dispatch.js";
import { assessTool } from "../src/tools/assess.js";
import { AuditLog } from "../src/lib/audit.js";
import { openState } from "../src/lib/state.js";
import { Operations } from "../src/lib/operations.js";
import { fakeOctokit } from "./_helpers/octokit.js";

function ctx(oct: ReturnType<typeof fakeOctokit>) {
  const db = openState(":memory:");
  return { octokit: oct, db, operations: new Operations(db) };
}

describe("dispatch", () => {
  it("validates input via Zod and rejects bad input as INVALID_INPUT", async () => {
    const c = ctx(fakeOctokit({}));
    const result = await dispatch(assessTool, { repo: "bad-no-slash" }, c);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
    expect(result.error.hint).toContain("repo:");
  });

  it("records a successful audit entry for a successful call", async () => {
    const oct = fakeOctokit({
      readme: "# ok\n".repeat(100),
      files: [],
      license: { spdx_id: "MIT", name: "MIT" },
    });
    const c = ctx(oct);
    const result = await dispatch(assessTool, { repo: "octocat/x" }, c);
    expect(result.ok).toBe(true);
    const log = new AuditLog(c.db);
    const entries = log.query({ limit: 10 });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.tool).toBe("forkctl_assess");
    expect(entries[0]!.ok).toBe(true);
  });

  it("records a failed audit entry for a failed call", async () => {
    const c = ctx(fakeOctokit({}));
    await dispatch(assessTool, { repo: "bad" }, c);
    const log = new AuditLog(c.db);
    const entries = log.query({ limit: 10 });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.ok).toBe(false);
  });

  it("ties audit entries to operationId when the result has one", async () => {
    const { createForkTool } = await import("../src/tools/create-fork.js");
    const { execFakeOctokit } = await import("./_helpers/exec-octokit.js");
    const oct = execFakeOctokit({ sourceRepo: { visibility: "public" }, login: "tester" });
    const c = ctx(oct as unknown as ReturnType<typeof fakeOctokit>);
    const result = await dispatch(
      createForkTool,
      { source: "octocat/x", defaultBranchOnly: false },
      c,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const opId = (result.data as { operationId: string }).operationId;
    const log = new AuditLog(c.db);
    const trail = log.byOperation(opId);
    expect(trail).toHaveLength(1);
    expect(trail[0]!.tool).toBe("forkctl_create_fork");
  });
});
