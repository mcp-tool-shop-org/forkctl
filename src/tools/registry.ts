import { assessTool } from "./assess.js";
import { choosePathTool } from "./choose-path.js";
import { makeForkableTool } from "./make-forkable.js";
import { preflightPolicyTool } from "./preflight-policy.js";
import { createForkTool } from "./create-fork.js";
import { createFromTemplateTool } from "./create-from-template.js";
import { checkOperationTool } from "./check-operation.js";
import { bootstrapTool } from "./bootstrap.js";
import { configureUpstreamTool } from "./configure-upstream.js";
import { scanDriftTool } from "./scan-drift.js";
import { emitHandoffTool } from "./emit-handoff.js";
import { syncTool } from "./sync.js";
import { diagnoseDivergenceTool } from "./diagnose-divergence.js";
import { proposeSyncPrTool } from "./propose-sync-pr.js";
import { listForksTool } from "./list-forks.js";
import { fleetHealthTool } from "./fleet-health.js";
import { batchSyncTool } from "./batch-sync.js";
import { receiptTool } from "./receipt.js";
import { auditLogTool } from "./audit-log.js";
import { renamePlanTool } from "./rename-plan.js";
import { renameApplyTool } from "./rename-apply.js";
import { renameRollbackTool } from "./rename-rollback.js";
import type { ToolDescriptor } from "./types.js";

/**
 * Canonical registry of every forkctl tool.
 * Ordering here follows the six product layers — keep it stable.
 */
export const TOOLS: ToolDescriptor<unknown, unknown>[] = [
  // Assessment
  assessTool as ToolDescriptor<unknown, unknown>,
  choosePathTool as ToolDescriptor<unknown, unknown>,
  makeForkableTool as ToolDescriptor<unknown, unknown>,
  // Execution
  preflightPolicyTool as ToolDescriptor<unknown, unknown>,
  createForkTool as ToolDescriptor<unknown, unknown>,
  createFromTemplateTool as ToolDescriptor<unknown, unknown>,
  checkOperationTool as ToolDescriptor<unknown, unknown>,
  // Bootstrap
  bootstrapTool as ToolDescriptor<unknown, unknown>,
  configureUpstreamTool as ToolDescriptor<unknown, unknown>,
  scanDriftTool as ToolDescriptor<unknown, unknown>,
  emitHandoffTool as ToolDescriptor<unknown, unknown>,
  // Sync
  syncTool as ToolDescriptor<unknown, unknown>,
  diagnoseDivergenceTool as ToolDescriptor<unknown, unknown>,
  proposeSyncPrTool as ToolDescriptor<unknown, unknown>,
  // Fleet
  listForksTool as ToolDescriptor<unknown, unknown>,
  fleetHealthTool as ToolDescriptor<unknown, unknown>,
  batchSyncTool as ToolDescriptor<unknown, unknown>,
  // Receipts
  receiptTool as ToolDescriptor<unknown, unknown>,
  auditLogTool as ToolDescriptor<unknown, unknown>,
  // Rename (L7)
  renamePlanTool as ToolDescriptor<unknown, unknown>,
  renameApplyTool as ToolDescriptor<unknown, unknown>,
  renameRollbackTool as ToolDescriptor<unknown, unknown>,
];

export function findTool(name: string): ToolDescriptor<unknown, unknown> | undefined {
  return TOOLS.find((t) => t.name === name);
}
