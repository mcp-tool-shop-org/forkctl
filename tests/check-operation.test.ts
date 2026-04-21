import { describe, expect, it } from "vitest";
import { checkOperationTool } from "../src/tools/check-operation.js";
import { execFakeOctokit } from "./_helpers/exec-octokit.js";
import { openState } from "../src/lib/state.js";
import { Operations } from "../src/lib/operations.js";

function ctx(octokit: ReturnType<typeof execFakeOctokit>) {
  const db = openState(":memory:");
  return { octokit, db, operations: new Operations(db) };
}

describe("forkctl_check_operation", () => {
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

  it("returns timed_out ops as-is without re-probing (F-004)", async () => {
    // NOTE: backend F-010 is about wiring Operations.timeout() into the
    // check-operation handler so pending ops past a threshold auto-transition.
    // Until that wiring lands, Operations.timeout() must still be called
    // explicitly. This test exercises the terminal-state short-circuit and
    // will keep passing once the auto-timeout path is wired — an op that
    // arrives here already flagged `timed_out` must be returned as-is.
    const c = ctx(execFakeOctokit({ existingRepos: new Set(["x/b"]) }));
    const op = c.operations.create({
      kind: "create_fork",
      source: "a/b",
      destination: "x/b",
    });
    // Simulate the op being aged past the timeout threshold and marked via
    // the Operations.timeout() path (which is what backend F-010 will invoke).
    c.operations.timeout(op.id);
    const before = c.operations.get(op.id);
    expect(before?.status).toBe("timed_out");

    const result = await checkOperationTool.handler({ operationId: op.id }, c);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Should NOT have flipped back to succeeded despite destination existing —
    // the terminal `timed_out` state is sticky.
    expect(result.data.status).toBe("timed_out");
  });

  it("Operations.timeout() only flips pending ops (guardrail for F-004/F-010)", async () => {
    // Direct unit check: timeout() must be a no-op on terminal states so the
    // eventual auto-timeout path can't clobber a succeeded op.
    const c = ctx(execFakeOctokit());
    const op = c.operations.create({ kind: "create_fork", source: "a/b", destination: "x/b" });
    c.operations.succeed(op.id, { fullName: "x/b" });
    const after = c.operations.timeout(op.id);
    expect(after.status).toBe("succeeded"); // unchanged
  });
});
