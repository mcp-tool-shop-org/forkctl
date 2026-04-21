import * as path from "node:path";
import { promises as fs } from "node:fs";
import { ForkctlError } from "../lib/errors.js";
import { fail, safe } from "../lib/result.js";
import { buildLogger } from "../lib/logger.js";
import { rollbackSnapshot } from "../lib/rename/snapshot.js";
import { RenameRollbackInputSchema, type RenameRollbackInput } from "../schemas/rename.js";
import type { ToolDescriptor } from "./types.js";

export interface RenameRollbackOutput {
  restoredFrom: string;
  mode: "git" | "files";
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

export const renameRollbackTool: ToolDescriptor<RenameRollbackInput, RenameRollbackOutput> = {
  name: "forkctl_rename_rollback",
  description:
    "Restore a repo from the latest rename snapshot (git reset + stash pop for git repos; file-tree restore otherwise). Pass snapshotId to target a specific snapshot.",
  inputSchema: RenameRollbackInputSchema,
  handler: async (input) => {
    const logger = buildLogger({ defaultLevel: "info", baseFields: { tool: "forkctl_rename_rollback" } });
    const repoRoot = path.resolve(input.path);
    if (!(await exists(repoRoot))) {
      return fail(
        new ForkctlError("RENAME_NOT_A_REPO", `path does not exist: ${repoRoot}`, {
          hint: "To fix: pass a valid repository path.",
        }),
      );
    }
    return safe(async (): Promise<RenameRollbackOutput> => {
      const opts: Parameters<typeof rollbackSnapshot>[0] = { repoRoot };
      if (input.snapshotId !== undefined) opts.snapshotId = input.snapshotId;
      const r = await rollbackSnapshot(opts);
      logger.info("rollback-complete", { restoredFrom: r.restoredFrom, mode: r.mode });
      return { restoredFrom: r.restoredFrom, mode: r.mode };
    });
  },
};
