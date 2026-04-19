import { describe, expect, it } from "vitest";
import { checkOperationTool } from "../src/tools/check-operation.js";
import { execFakeOctokit } from "./_helpers/exec-octokit.js";
import { openState } from "../src/lib/state.js";
import { Operations } from "../src/lib/operations.js";

function ctx(octokit: ReturnType<typeof execFakeOctokit>) {
  const db = openState(":memory:");
  return { octokit, db, operations: new Operations(db) };
}

describe("forkable_check_operation", () => {
  it("returns OPERATION_NOT_FOUND for unknown id", async () => {
    const result = await checkOperationTool.handler(
      { operationId: "nope" },
      ctx(execFakeOctokit()),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("OPERATION_NOT_FOUND");
  });

  it("leaves operation pending if destination still 404", async () => {
    const c = ctx(execFakeOctokit({ existingRepos: new Set() }));
    const op = c.operations.create({
      kind: "create_fork",
      source: "a/b",
      destination: "x/b",
    });
    const result = await checkOperationTool.handler({ operationId: op.id }, c);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("pending");
  });

  it("marks operation succeeded when destination is now visible", async () => {
    const c = ctx(execFakeOctokit({ existingRepos: new Set(["x/b"]) }));
    const op = c.operations.create({
      kind: "create_fork",
      source: "a/b",
      destination: "x/b",
    });
    const result = await checkOperationTool.handler({ operationId: op.id }, c);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("succeeded");
    expect((result.data.result as { fullName: string }).fullName).toBe("x/b");
  });

  it("returns succeeded ops as-is without re-probing", async () => {
    const c = ctx(execFakeOctokit({ existingRepos: new Set() }));
    const op = c.operations.create({
      kind: "create_fork",
      source: "a/b",
      destination: "x/b",
    });
    c.operations.succeed(op.id, { fullName: "x/b" });
    const result = await checkOperationTool.handler({ operationId: op.id }, c);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("succeeded");
  });
});
