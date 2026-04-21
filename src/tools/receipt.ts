import { ForkctlError } from "../lib/errors.js";
import type { OperationRecord } from "../lib/operations.js";
import type { AuditEntry } from "../lib/audit.js";
import { AuditLog } from "../lib/audit.js";
import { safe } from "../lib/result.js";
import { ReceiptInputSchema, type ReceiptInput } from "../schemas/receipts.js";
import type { ToolDescriptor } from "./types.js";

export interface Receipt {
  operation: OperationRecord;
  auditTrail: AuditEntry[];
  /** Human-friendly one-line summary of the operation. */
  summary: string;
}

export const receiptTool: ToolDescriptor<ReceiptInput, Receipt> = {
  name: "forkctl_receipt",
  description:
    "Get a machine-readable receipt for any forkctl operation: the operation record + every audit entry that referenced it, plus a one-line summary. Use this as the canonical proof of what forkctl did.",
  inputSchema: ReceiptInputSchema,
  handler: (input, ctx) =>
    safe(async () => {
      const op = ctx.operations.get(input.operationId);
      if (!op) {
        throw new ForkctlError("OPERATION_NOT_FOUND", `Operation ${input.operationId} not found`);
      }
      const audit = new AuditLog(ctx.db);
      const trail = audit.byOperation(op.id);
      return { operation: op, auditTrail: trail, summary: summarize(op) };
    }),
};

function summarize(op: OperationRecord): string {
  const verb =
    op.kind === "create_fork"
      ? "Forked"
      : op.kind === "create_from_template"
        ? "Generated from template"
        : op.kind === "batch_sync"
          ? "Batch-synced"
          : op.kind;
  const status =
    op.status === "succeeded"
      ? "OK"
      : op.status === "failed"
        ? `FAILED (${op.error?.code ?? "unknown"})`
        : op.status === "timed_out"
          ? "TIMED OUT"
          : "PENDING";
  return `${verb} ${op.source ?? "?"} → ${op.destination ?? "?"} — ${status}`;
}
