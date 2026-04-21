import { describe, expect, it } from "vitest";
import { receiptTool } from "../src/tools/receipt.js";
import { auditLogTool } from "../src/tools/audit-log.js";
import { openState } from "../src/lib/state.js";
import { Operations } from "../src/lib/operations.js";
import { AuditLog } from "../src/lib/audit.js";
import type { Octokit } from "@octokit/rest";

function ctx() {
  const db = openState(":memory:");
  return { octokit: {} as Octokit, db, operations: new Operations(db) };
}

describe("forkctl_receipt", () => {
  it("returns the operation + audit trail + summary", async () => {
    const c = ctx();
    const op = c.operations.create({
      kind: "create_fork",
      source: "octocat/x",
      destination: "myhandle/x",
    });
    c.operations.succeed(op.id, { fullName: "myhandle/x" });
    const log = new AuditLog(c.db);
    log.record({ tool: "forkctl_create_fork", input: { source: "octocat/x" }, ok: true, result: { ok: true }, operationId: op.id });

    const result = await receiptTool.handler({ operationId: op.id }, c);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.operation.id).toBe(op.id);
    expect(result.data.operation.status).toBe("succeeded");
    expect(result.data.auditTrail).toHaveLength(1);
    expect(result.data.summary).toContain("Forked");
    expect(result.data.summary).toContain("OK");
  });

  it("returns OPERATION_NOT_FOUND for unknown id", async () => {
    const result = await receiptTool.handler({ operationId: "nope" }, ctx());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("OPERATION_NOT_FOUND");
  });

  it("summarizes failed operations with the error code", async () => {
    const c = ctx();
    const op = c.operations.create({
      kind: "create_fork",
      source: "a/b",
      destination: "c/b",
    });
    c.operations.fail(op.id, { code: "GITHUB_FORBIDDEN", message: "no" });
    const result = await receiptTool.handler({ operationId: op.id }, c);
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.summary).toContain("FAILED");
    expect(result.data.summary).toContain("GITHUB_FORBIDDEN");
  });
});

describe("forkctl_audit_log", () => {
  it("returns recent entries respecting filter", async () => {
    const c = ctx();
    const log = new AuditLog(c.db);
    log.record({ tool: "forkctl_assess", input: { repo: "x/y" }, ok: true, result: { score: 80 } });
    log.record({ tool: "forkctl_sync", input: { fork: "me/x" }, ok: false, result: null });

    const result = await auditLogTool.handler({ tool: "forkctl_assess", limit: 50 }, c);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.count).toBe(1);
    expect(result.data.entries[0]!.tool).toBe("forkctl_assess");
  });
});
