import { AuditLog, type AuditEntry } from "../lib/audit.js";
import { safe } from "../lib/result.js";
import { AuditLogInputSchema, type AuditLogInput } from "../schemas/receipts.js";
import type { ToolDescriptor } from "./types.js";

export interface AuditLogOutput {
  entries: AuditEntry[];
  count: number;
}

export const auditLogTool: ToolDescriptor<AuditLogInput, AuditLogOutput> = {
  name: "forkable_audit_log",
  description:
    "Query the append-only audit log. Filter by tool, operationId, ok flag, or sinceMs (epoch). Inputs are redacted at write time — tokens and known secret keys never land in the log.",
  inputSchema: AuditLogInputSchema,
  handler: (input, ctx) =>
    safe(async () => {
      const log = new AuditLog(ctx.db);
      const filter: Parameters<AuditLog["query"]>[0] = { limit: input.limit };
      if (input.tool !== undefined) filter.tool = input.tool;
      if (input.operationId !== undefined) filter.operationId = input.operationId;
      if (input.ok !== undefined) filter.ok = input.ok;
      if (input.sinceMs !== undefined) filter.sinceMs = input.sinceMs;
      const entries = log.query(filter);
      return { entries, count: entries.length };
    }),
};
