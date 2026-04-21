import { afterEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { newFixture, seedHardCaseRepo, initGitRepo, type FixtureRepo } from "../_helpers/rename-fixtures.js";
import { renamePlanTool } from "../../src/tools/rename-plan.js";
import { renameApplyTool } from "../../src/tools/rename-apply.js";
import { renameRollbackTool } from "../../src/tools/rename-rollback.js";
import { openState } from "../../src/lib/state.js";
import { Operations } from "../../src/lib/operations.js";
import { fakeOctokit } from "../_helpers/octokit.js";
import type { ToolContext } from "../../src/tools/types.js";

/**
 * Covers design §4 UX + F1 scaffold + F7 (plan / apply / rollback).
 *
 * These tests exercise the three rename tools directly via their handlers.
 * Dispatch-level integration (Zod validation, audit) is covered in
 * dispatch.test.ts. Here we focus on the realized behavior of the handlers
 * given well-formed (already-parsed) input.
 */

function makeCtx(): ToolContext {
  const db = openState(":memory:");
  return {
    octokit: fakeOctokit({}),
    db,
    operations: new Operations(db),
  };
}

describe("rename-plan tool (F7)", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("produces .forkctl/rename-plan.json at the repo root", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    const r = await renamePlanTool.handler(
      {
        path: fx.root,
        from: "forkable",
        to: "splitshift",
        layers: ["identity", "textual", "post"],
        exclude: [],
        lockfileStrategy: "regenerate",
        historyRewrite: false,
        lspTier: false,
        preserveComments: false,
        preserveHistory: true,
      },
      makeCtx(),
    );
    expect(r.ok).toBe(true);
    expect(existsSync(fx.resolve(".forkctl/rename-plan.json"))).toBe(true);
  });

  it("produces .forkctl/rename-plan.diff (unified diff preview)", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    await renamePlanTool.handler(
      {
        path: fx.root,
        from: "forkable",
        to: "splitshift",
        layers: ["identity", "textual", "post"],
        exclude: [],
        lockfileStrategy: "regenerate",
        historyRewrite: false,
        lspTier: false,
        preserveComments: false,
        preserveHistory: true,
      },
      makeCtx(),
    );
    expect(existsSync(fx.resolve(".forkctl/rename-plan.diff"))).toBe(true);
    const diff = readFileSync(fx.resolve(".forkctl/rename-plan.diff"), "utf8");
    expect(diff).toContain("# forkctl rename plan diff");
    expect(diff).toContain("from: forkable");
    expect(diff).toContain("to:   splitshift");
  });

  it("plan.fingerprint is deterministic — running plan twice yields identical fingerprints", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    const input = {
      path: fx.root,
      from: "forkable",
      to: "splitshift",
      layers: ["identity", "textual", "post"] as const,
      exclude: [],
      lockfileStrategy: "regenerate" as const,
      historyRewrite: false,
      lspTier: false,
      preserveComments: false,
      preserveHistory: true,
    };
    const r1 = await renamePlanTool.handler({ ...input, layers: [...input.layers] }, makeCtx());
    const r2 = await renamePlanTool.handler({ ...input, layers: [...input.layers] }, makeCtx());
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.data.plan.fingerprint).toBe(r2.data.plan.fingerprint);
    }
  });

  it("plan is read-only — no source files in the working tree are mutated", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    const pkgBefore = readFileSync(fx.resolve("package.json"), "utf8");
    const readmeBefore = readFileSync(fx.resolve("README.md"), "utf8");
    await renamePlanTool.handler(
      {
        path: fx.root,
        from: "forkable",
        to: "splitshift",
        layers: ["identity", "textual", "post"],
        exclude: [],
        lockfileStrategy: "regenerate",
        historyRewrite: false,
        lspTier: false,
        preserveComments: false,
        preserveHistory: true,
      },
      makeCtx(),
    );
    expect(readFileSync(fx.resolve("package.json"), "utf8")).toBe(pkgBefore);
    expect(readFileSync(fx.resolve("README.md"), "utf8")).toBe(readmeBefore);
  });

  it("plan records every variant keyed by VariantKey", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    const r = await renamePlanTool.handler(
      {
        path: fx.root,
        from: "forkable",
        to: "splitshift",
        layers: ["identity"],
        exclude: [],
        lockfileStrategy: "regenerate",
        historyRewrite: false,
        lspTier: false,
        preserveComments: false,
        preserveHistory: true,
      },
      makeCtx(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const keys = Object.keys(r.data.plan.variants);
    expect(keys).toContain("kebab-case");
    expect(keys).toContain("PascalCase");
    expect(keys).toContain("SCREAMING_SNAKE");
    expect(keys).toContain("Title Case");
  });

  it("rejects when `from === to` via RENAME_INVALID_NAME", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    const r = await renamePlanTool.handler(
      {
        path: fx.root,
        from: "forkable",
        to: "forkable",
        layers: ["identity"],
        exclude: [],
        lockfileStrategy: "regenerate",
        historyRewrite: false,
        lspTier: false,
        preserveComments: false,
        preserveHistory: true,
      },
      makeCtx(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("RENAME_INVALID_NAME");
  });

  it("rejects when the target path does not exist via RENAME_NOT_A_REPO", async () => {
    const r = await renamePlanTool.handler(
      {
        path: "/path/definitely/does/not/exist/forkable-xxxx",
        from: "forkable",
        to: "splitshift",
        layers: ["identity"],
        exclude: [],
        lockfileStrategy: "regenerate",
        historyRewrite: false,
        lspTier: false,
        preserveComments: false,
        preserveHistory: true,
      },
      makeCtx(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("RENAME_NOT_A_REPO");
  });
});

describe("rename-apply tool (F7)", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("returns RENAME_PLAN_STALE when the plan file is missing", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    const r = await renameApplyTool.handler(
      { path: fx.root, plan: ".forkctl/does-not-exist.json", verify: false },
      makeCtx(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("RENAME_PLAN_STALE");
  });

  it("returns RENAME_NOT_A_REPO when path does not exist", async () => {
    const r = await renameApplyTool.handler(
      {
        path: "/path/definitely/not/here/forkable-yyyy",
        plan: "plan.json",
        verify: false,
      },
      makeCtx(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("RENAME_NOT_A_REPO");
  });

  it("writes a snapshot to .forkctl/snapshots/rename-*/ before mutating", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    // Build a plan first.
    const planRes = await renamePlanTool.handler(
      {
        path: fx.root,
        from: "forkable",
        to: "splitshift",
        layers: ["identity"],
        exclude: [],
        lockfileStrategy: "skip",
        historyRewrite: false,
        lspTier: false,
        preserveComments: false,
        preserveHistory: true,
      },
      makeCtx(),
    );
    expect(planRes.ok).toBe(true);
    if (!planRes.ok) return;

    const applyRes = await renameApplyTool.handler(
      { path: fx.root, plan: planRes.data.planPath, verify: false },
      makeCtx(),
    );
    expect(applyRes.ok).toBe(true);
    if (!applyRes.ok) return;
    expect(existsSync(fx.resolve(".forkctl/snapshots", applyRes.data.receipt.snapshotId))).toBe(true);
  });

  it("returns a RenameReceipt with layers applied and snapshot metadata", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    const planRes = await renamePlanTool.handler(
      {
        path: fx.root,
        from: "forkable",
        to: "splitshift",
        layers: ["identity"],
        exclude: [],
        lockfileStrategy: "skip",
        historyRewrite: false,
        lspTier: false,
        preserveComments: false,
        preserveHistory: true,
      },
      makeCtx(),
    );
    expect(planRes.ok).toBe(true);
    if (!planRes.ok) return;

    const r = await renameApplyTool.handler(
      { path: fx.root, plan: planRes.data.planPath, verify: false },
      makeCtx(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.receipt.from).toBe("forkable");
    expect(r.data.receipt.to).toBe("splitshift");
    expect(r.data.receipt.layersApplied).toContain("identity");
    expect(r.data.receipt.snapshotId.startsWith("rename-")).toBe(true);
  });

  it("writes .forkctl/rename-receipt.json alongside the snapshot", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    const planRes = await renamePlanTool.handler(
      {
        path: fx.root,
        from: "forkable",
        to: "splitshift",
        layers: ["identity"],
        exclude: [],
        lockfileStrategy: "skip",
        historyRewrite: false,
        lspTier: false,
        preserveComments: false,
        preserveHistory: true,
      },
      makeCtx(),
    );
    if (!planRes.ok) return;

    await renameApplyTool.handler(
      { path: fx.root, plan: planRes.data.planPath, verify: false },
      makeCtx(),
    );
    expect(existsSync(fx.resolve(".forkctl/rename-receipt.json"))).toBe(true);
  });

  it("second apply on an already-renamed tree is safe (idempotent in the no-op sense)", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    const planRes = await renamePlanTool.handler(
      {
        path: fx.root,
        from: "forkable",
        to: "splitshift",
        layers: ["identity"],
        exclude: [],
        lockfileStrategy: "skip",
        historyRewrite: false,
        lspTier: false,
        preserveComments: false,
        preserveHistory: true,
      },
      makeCtx(),
    );
    if (!planRes.ok) return;
    const r1 = await renameApplyTool.handler(
      { path: fx.root, plan: planRes.data.planPath, verify: false },
      makeCtx(),
    );
    expect(r1.ok).toBe(true);
    // Second apply — the plan is now stale because the tree is renamed, but
    // apply is non-destructive (warning, not error) and should return ok.
    const r2 = await renameApplyTool.handler(
      { path: fx.root, plan: planRes.data.planPath, verify: false },
      makeCtx(),
    );
    expect(r2.ok).toBe(true);
  });

  // History rewrite is a stub per design §10 and §9.4. Not in v1.1.
  it.todo("when `--rewrite-history` is set, invokes the history-rewrite path (v1.2+ stub)");

  // Non-git repos use file-tree snapshot. Apply does take a snapshot but the
  // test below pins that path.
  it("works on a non-git repo — snapshot mode is `files`", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    const planRes = await renamePlanTool.handler(
      {
        path: fx.root,
        from: "forkable",
        to: "splitshift",
        layers: ["identity"],
        exclude: [],
        lockfileStrategy: "skip",
        historyRewrite: false,
        lspTier: false,
        preserveComments: false,
        preserveHistory: true,
      },
      makeCtx(),
    );
    if (!planRes.ok) return;
    const applyRes = await renameApplyTool.handler(
      { path: fx.root, plan: planRes.data.planPath, verify: false },
      makeCtx(),
    );
    expect(applyRes.ok).toBe(true);
    if (!applyRes.ok) return;
    // No git → snapshot dir has tree/ not pre-head.txt
    const snapDir = fx.resolve(".forkctl/snapshots", applyRes.data.receipt.snapshotId);
    expect(existsSync(`${snapDir}/tree`)).toBe(true);
    expect(existsSync(`${snapDir}/pre-head.txt`)).toBe(false);
  });
});

describe("rename-rollback tool (F7)", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("restores the file tree on a non-git repo after an apply", async () => {
    fx = newFixture();
    fx.write("a.md", "forkable\n");
    // Plan + apply (minimal).
    const planRes = await renamePlanTool.handler(
      {
        path: fx.root,
        from: "forkable",
        to: "splitshift",
        layers: ["textual"],
        exclude: [],
        lockfileStrategy: "skip",
        historyRewrite: false,
        lspTier: false,
        preserveComments: false,
        preserveHistory: true,
      },
      makeCtx(),
    );
    if (!planRes.ok) return;
    const applyRes = await renameApplyTool.handler(
      { path: fx.root, plan: planRes.data.planPath, verify: false },
      makeCtx(),
    );
    expect(applyRes.ok).toBe(true);
    // File was rewritten.
    expect(readFileSync(fx.resolve("a.md"), "utf8")).toContain("splitshift");
    // Roll back.
    const rb = await renameRollbackTool.handler({ path: fx.root }, makeCtx());
    expect(rb.ok).toBe(true);
    if (rb.ok) expect(rb.data.mode).toBe("files");
    expect(readFileSync(fx.resolve("a.md"), "utf8")).toContain("forkable");
  });

  it("returns RENAME_ROLLBACK_NOT_FOUND when no snapshot exists", async () => {
    fx = newFixture();
    fx.write("a.md", "forkable\n");
    const r = await renameRollbackTool.handler({ path: fx.root }, makeCtx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("RENAME_ROLLBACK_NOT_FOUND");
  });

  it("returns RENAME_NOT_A_REPO for a non-existent path", async () => {
    const r = await renameRollbackTool.handler(
      { path: "/does/not/exist/forkable-zzzz" },
      makeCtx(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("RENAME_NOT_A_REPO");
  });

  it("rolls back by explicit snapshotId", async () => {
    fx = newFixture();
    fx.write("a.md", "forkable\n");
    const planRes = await renamePlanTool.handler(
      {
        path: fx.root,
        from: "forkable",
        to: "splitshift",
        layers: ["textual"],
        exclude: [],
        lockfileStrategy: "skip",
        historyRewrite: false,
        lspTier: false,
        preserveComments: false,
        preserveHistory: true,
      },
      makeCtx(),
    );
    if (!planRes.ok) return;
    const applyRes = await renameApplyTool.handler(
      { path: fx.root, plan: planRes.data.planPath, verify: false },
      makeCtx(),
    );
    if (!applyRes.ok) return;
    const snapshotId = applyRes.data.receipt.snapshotId;
    // Mutate after apply so rollback has something to restore.
    writeFileSync(fx.resolve("a.md"), "something-else\n");
    const rb = await renameRollbackTool.handler({ path: fx.root, snapshotId }, makeCtx());
    expect(rb.ok).toBe(true);
    if (rb.ok) expect(rb.data.restoredFrom).toBe(snapshotId);
    expect(readFileSync(fx.resolve("a.md"), "utf8")).toContain("forkable");
  });
});
