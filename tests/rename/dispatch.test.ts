import { afterEach, describe, expect, it } from "vitest";
import { newFixture, seedHardCaseRepo, type FixtureRepo } from "../_helpers/rename-fixtures.js";
import { dispatch } from "../../src/dispatch.js";
import { AuditLog } from "../../src/lib/audit.js";
import { openState } from "../../src/lib/state.js";
import { Operations } from "../../src/lib/operations.js";
import { fakeOctokit } from "../_helpers/octokit.js";
import { TOOLS, findTool } from "../../src/tools/registry.js";
import { renamePlanTool } from "../../src/tools/rename-plan.js";
import { renameApplyTool } from "../../src/tools/rename-apply.js";
import { renameRollbackTool } from "../../src/tools/rename-rollback.js";

/**
 * Covers dispatch + audit integration for rename tools.
 *
 * Extends the Stage A F-006 fix (audit entry carries operationId even on
 * failure) to the three rename tools, plus the registry wiring.
 */

function makeCtx() {
  const db = openState(":memory:");
  return { octokit: fakeOctokit({}), db, operations: new Operations(db) };
}

describe("registry — rename tools registered", () => {
  it("TOOLS includes forkctl_rename_plan", () => {
    expect(TOOLS.find((t) => t.name === "forkctl_rename_plan")).toBeDefined();
  });

  it("TOOLS includes forkctl_rename_apply", () => {
    expect(TOOLS.find((t) => t.name === "forkctl_rename_apply")).toBeDefined();
  });

  it("TOOLS includes forkctl_rename_rollback", () => {
    expect(TOOLS.find((t) => t.name === "forkctl_rename_rollback")).toBeDefined();
  });

  it("findTool('forkctl_rename_plan') returns the plan tool descriptor", () => {
    const t = findTool("forkctl_rename_plan");
    expect(t).toBeDefined();
    expect(t!.name).toBe("forkctl_rename_plan");
    expect(typeof t!.handler).toBe("function");
  });

  it("rename tools all carry non-empty descriptions", () => {
    for (const name of ["forkctl_rename_plan", "forkctl_rename_apply", "forkctl_rename_rollback"]) {
      const t = findTool(name);
      expect(t).toBeDefined();
      expect(t!.description.length).toBeGreaterThan(10);
    }
  });
});

describe("dispatch — rename-plan", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("rejects invalid input (bad `from`) as INVALID_INPUT via Zod", async () => {
    const ctx = makeCtx();
    const r = await dispatch(renamePlanTool, { path: "./x", from: "bad/slash", to: "ok" }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("INVALID_INPUT");
  });

  it("rejects missing required field (`to`) as INVALID_INPUT", async () => {
    const ctx = makeCtx();
    const r = await dispatch(renamePlanTool, { path: "./x", from: "forkable" }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("INVALID_INPUT");
  });

  it("records a successful audit entry with tool=forkctl_rename_plan on success", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    const ctx = makeCtx();
    const r = await dispatch(
      renamePlanTool,
      { path: fx.root, from: "forkable", to: "splitshift", layers: ["identity"] },
      ctx,
    );
    expect(r.ok).toBe(true);
    const log = new AuditLog(ctx.db);
    const entries = log.query({ tool: "forkctl_rename_plan", limit: 5 });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.ok).toBe(true);
  });

  it("records a failed audit entry on handler failure (RENAME_INVALID_NAME)", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    const ctx = makeCtx();
    await dispatch(
      renamePlanTool,
      { path: fx.root, from: "forkable", to: "forkable" },
      ctx,
    );
    const log = new AuditLog(ctx.db);
    const entries = log.query({ tool: "forkctl_rename_plan", limit: 5 });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.ok).toBe(false);
  });
});

describe("dispatch — rename-apply", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("rejects input without a plan field as INVALID_INPUT (Zod)", async () => {
    const ctx = makeCtx();
    const r = await dispatch(renameApplyTool, { path: "./x" }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("INVALID_INPUT");
  });

  it("surfaces RENAME_PLAN_STALE when the plan file is missing", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    const ctx = makeCtx();
    const r = await dispatch(
      renameApplyTool,
      { path: fx.root, plan: ".forkctl/missing.json", verify: false },
      ctx,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("RENAME_PLAN_STALE");
    // Audit entry records the failure.
    const log = new AuditLog(ctx.db);
    const entries = log.query({ tool: "forkctl_rename_apply", limit: 5 });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.ok).toBe(false);
  });

  it("records a success audit entry when apply completes", async () => {
    fx = newFixture();
    fx.write("a.md", "forkable\n");
    const ctx = makeCtx();
    const planRes = await dispatch(
      renamePlanTool,
      { path: fx.root, from: "forkable", to: "splitshift", layers: ["textual"], lockfileStrategy: "skip" },
      ctx,
    );
    expect(planRes.ok).toBe(true);
    if (!planRes.ok) return;
    const applyRes = await dispatch(
      renameApplyTool,
      { path: fx.root, plan: planRes.data.planPath, verify: false },
      ctx,
    );
    expect(applyRes.ok).toBe(true);
    const log = new AuditLog(ctx.db);
    const entries = log.query({ tool: "forkctl_rename_apply", limit: 5 });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.ok).toBe(true);
  });
});

describe("dispatch — rename-rollback", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("records a failed audit entry for RENAME_ROLLBACK_NOT_FOUND", async () => {
    fx = newFixture();
    fx.write("a.md", "x\n");
    const ctx = makeCtx();
    const r = await dispatch(renameRollbackTool, { path: fx.root }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("RENAME_ROLLBACK_NOT_FOUND");
    const log = new AuditLog(ctx.db);
    const entries = log.query({ tool: "forkctl_rename_rollback", limit: 5 });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.ok).toBe(false);
  });

  it("records a success audit entry after a successful rollback", async () => {
    fx = newFixture();
    fx.write("a.md", "forkable\n");
    const ctx = makeCtx();
    const planRes = await dispatch(
      renamePlanTool,
      { path: fx.root, from: "forkable", to: "splitshift", layers: ["textual"], lockfileStrategy: "skip" },
      ctx,
    );
    if (!planRes.ok) return;
    await dispatch(
      renameApplyTool,
      { path: fx.root, plan: planRes.data.planPath, verify: false },
      ctx,
    );
    const rb = await dispatch(renameRollbackTool, { path: fx.root }, ctx);
    expect(rb.ok).toBe(true);
    const log = new AuditLog(ctx.db);
    const entries = log.query({ tool: "forkctl_rename_rollback", limit: 5, ok: true });
    expect(entries.length).toBeGreaterThanOrEqual(1);
  });
});
