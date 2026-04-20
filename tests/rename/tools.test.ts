import { describe, it } from "vitest";

/**
 * Covers design §4 UX + F1 scaffold + F7 (plan / apply / rollback).
 *
 * Hard-case matrix (§5) rows covered here:
 *   - git history → NOT rewritten without `--rewrite-history`
 *   - non-git repo → snapshot is a tarball, apply works, rollback restores
 *
 * Error codes exercised (already in src/lib/errors.ts):
 *   - RENAME_INVALID_NAME
 *   - RENAME_PLAN_STALE
 *   - RENAME_ROLLBACK_NOT_FOUND
 *   - RENAME_LOCKFILE_REGEN_FAILED
 *   - RENAME_NOT_A_REPO
 *   - RENAME_SNAPSHOT_FAILED
 *   - RENAME_APPLY_FAILED
 *
 * Deferred until `src/tools/rename-{plan,apply,rollback}.ts` land. The
 * tests below document the exact semantics so the backend agent has a
 * contract to build against.
 */

describe("rename-plan tool (F7)", () => {
  it.todo("produces `.forkable/rename-plan.json` at the repo root");
  it.todo("produces `.forkable/rename-plan.diff` (unified diff) at the repo root");
  it.todo("plan.fingerprint is deterministic — running plan twice yields identical fingerprints");
  it.todo("plan is read-only — no files in the working tree are mutated");
  it.todo("plan records every variant (keyed by VariantKey)");
  it.todo("plan emits warnings for incidental string-literal mentions");
});

describe("rename-apply tool (F7)", () => {
  it.todo("refuses to run without a plan file (returns INVALID_INPUT)");
  it.todo("refuses when the plan fingerprint no longer matches the repo → RENAME_PLAN_STALE");
  it.todo("writes a snapshot to `.forkable/snapshots/rename-<ts>/` BEFORE mutating");
  it.todo("on git repo, snapshot records pre-rename HEAD SHA");
  it.todo("on non-git repo, snapshot is a tarball of the working tree (§5)");
  it.todo("does NOT rewrite git history by default");
  it.todo("when `--rewrite-history` is set, invokes the history-rewrite path (v1.2 stub ok)");
  it.todo("returns a RenameReceipt on success with all layers applied");
  it.todo("second apply on a cleanly-renamed repo is a no-op (idempotent)");
  it.todo("snapshot failure surfaces as RENAME_SNAPSHOT_FAILED");
  it.todo("mid-apply failure surfaces as RENAME_APPLY_FAILED");
});

describe("rename-rollback tool (F7)", () => {
  it.todo("restores the latest snapshot on a git repo (`git reset --hard` + stash pop)");
  it.todo("restores from a tarball on a non-git repo");
  it.todo("with no snapshot present → RENAME_ROLLBACK_NOT_FOUND");
  it.todo("by snapshotId, restores that specific snapshot");
  it.todo("garbage-collects snapshots older than 7 days on next forkable command");
});

describe("rename tools — error paths (§5 + errors.ts)", () => {
  it.todo("malformed `from` returns RENAME_INVALID_NAME with a clear hint");
  it.todo("malformed `to` returns RENAME_INVALID_NAME with a clear hint");
  it.todo("pointing at a non-existent path returns RENAME_NOT_A_REPO");
  it.todo("lockfile regen failure bubbles RENAME_LOCKFILE_REGEN_FAILED with stderr in details");
});
