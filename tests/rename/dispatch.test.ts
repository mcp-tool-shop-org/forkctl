import { describe, it } from "vitest";

/**
 * Covers dispatch + audit integration for rename tools.
 *
 * The existing dispatch-error-operation-id.test.ts already pins the fix from
 * Stage A F-006 (audit entry includes operationId even on failure). These
 * `.todo()` entries extend that contract to the three rename tools.
 *
 * Promote to real tests once `src/tools/rename-{plan,apply,rollback}.ts` are
 * wired into `src/tools/registry.ts` — and once the rename pipeline can run
 * without side-effects against a tmpdir fixture.
 *
 * Tool names (wire-level) per convention:
 *   - forkable_rename_plan
 *   - forkable_rename_apply
 *   - forkable_rename_rollback
 */

describe("dispatch — rename-plan", () => {
  it.todo("rejects invalid input (bad `from`) as INVALID_INPUT via Zod");
  it.todo("records a successful audit entry with tool=forkable_rename_plan on success");
  it.todo("records a failed audit entry on handler failure");
  it.todo("audit entry carries operationId when the receipt has one (even on failure)");
});

describe("dispatch — rename-apply", () => {
  it.todo("rejects without a plan file as INVALID_INPUT");
  it.todo("stale plan surfaces audit entry with code=RENAME_PLAN_STALE");
  it.todo("records tool=forkable_rename_apply audit entry on success");
});

describe("dispatch — rename-rollback", () => {
  it.todo("missing snapshot surfaces audit entry with code=RENAME_ROLLBACK_NOT_FOUND");
  it.todo("records tool=forkable_rename_rollback audit entry on success");
});

describe("registry — rename tools registered", () => {
  it.todo("TOOLS includes forkable_rename_plan");
  it.todo("TOOLS includes forkable_rename_apply");
  it.todo("TOOLS includes forkable_rename_rollback");
  it.todo("findTool('forkable_rename_plan') returns the plan tool");
});
