import { describe, expect, it } from "vitest";
import { z } from "zod";
import { dispatch } from "../src/dispatch.js";
import { AuditLog } from "../src/lib/audit.js";
import { ForkctlError } from "../src/lib/errors.js";
import { openState } from "../src/lib/state.js";
import { Operations } from "../src/lib/operations.js";
import { fail } from "../src/lib/result.js";
import { fakeOctokit } from "./_helpers/octokit.js";
import type { ToolDescriptor } from "../src/tools/types.js";

/**
 * Error-path operationId pinning (tests-H4).
 *
 * Stage A F-006 fixed a silent bug: when a tool registered an operation row,
 * then failed, the audit row did NOT carry the operation_id. That meant
 * users couldn't `forkctl_check_operation <id>` to find out what happened
 * to their fork creation — the op existed in the operations table but
 * nothing in the audit trail pointed at it.
 *
 * The fix was in `extractOperationId`: look at the error details for
 * `operationId` or `operation.id`, not just the success payload.
 *
 * This test pins that by building a toy tool whose handler ALWAYS returns a
 * failure that includes operation.id in the error details, and asserts the
 * audit entry came out with operation_id set.
 */

interface ToyInput {
  anything?: string;
}
interface ToyOutput {
  operationId: string;
}

const toyTool: ToolDescriptor<ToyInput, ToyOutput> = {
  name: "forkctl_toy_error_with_op",
  description: "Test-only tool that registers an op then fails.",
  inputSchema: z.object({ anything: z.string().optional() }),
  handler: async () => {
    return fail(
      new ForkctlError("OPERATION_FAILED", "simulated async failure after op registration", {
        hint: "This would tell the user which operation row to inspect.",
        details: {
          operation: { id: "op-deadbeef-1234" },
          attempt: 1,
        },
      }),
    );
  },
};

describe("dispatch extracts operationId from failure details (H4)", () => {
  it("audit entry for a failed call carries operation_id when the error details have operation.id", async () => {
    const db = openState(":memory:");
    const octokit = fakeOctokit({});
    const c = { octokit, db, operations: new Operations(db) };

    const result = await dispatch(toyTool, {}, c);
    expect(result.ok).toBe(false);

    const log = new AuditLog(db);
    const byOp = log.byOperation("op-deadbeef-1234");
    expect(byOp).toHaveLength(1);
    expect(byOp[0]!.ok).toBe(false);
    expect(byOp[0]!.tool).toBe("forkctl_toy_error_with_op");
    // The caller should be able to get back to the full failure shape via
    // byOperation — that's the whole point of the Stage A fix.
    expect(byOp[0]!.operationId).toBe("op-deadbeef-1234");
  });

  it("audit entry for a failed call without any operation id has operationId = null (no accidental tagging)", async () => {
    const plainFailTool: ToolDescriptor<ToyInput, ToyOutput> = {
      name: "forkctl_toy_plain_fail",
      description: "fails without an op id",
      inputSchema: z.object({ anything: z.string().optional() }),
      handler: async () =>
        fail(new ForkctlError("INTERNAL", "plain", { hint: "no op" })),
    };

    const db = openState(":memory:");
    const c = { octokit: fakeOctokit({}), db, operations: new Operations(db) };
    await dispatch(plainFailTool, {}, c);

    const log = new AuditLog(db);
    const entries = log.query({ tool: "forkctl_toy_plain_fail", limit: 5 });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.operationId).toBeNull();
  });

  it("handles the alternate shape: details.operationId (flat) as well as details.operation.id (nested)", async () => {
    const flatShapeTool: ToolDescriptor<ToyInput, ToyOutput> = {
      name: "forkctl_toy_flat_op",
      description: "uses flat operationId in details",
      inputSchema: z.object({ anything: z.string().optional() }),
      handler: async () =>
        fail(
          new ForkctlError("OPERATION_FAILED", "flat-shape failure", {
            details: { operationId: "op-flat-9999" },
          }),
        ),
    };

    const db = openState(":memory:");
    const c = { octokit: fakeOctokit({}), db, operations: new Operations(db) };
    await dispatch(flatShapeTool, {}, c);

    const log = new AuditLog(db);
    const byOp = log.byOperation("op-flat-9999");
    expect(byOp).toHaveLength(1);
  });
});
