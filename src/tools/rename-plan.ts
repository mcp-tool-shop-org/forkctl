import * as path from "node:path";
import { promises as fs } from "node:fs";
import { ForkctlError } from "../lib/errors.js";
import { fail, safe } from "../lib/result.js";
import { buildLogger } from "../lib/logger.js";
import { buildRenamePlan, writePlanArtifacts } from "../lib/rename/plan.js";
import { gcSnapshots } from "../lib/rename/snapshot.js";
import { RenamePlanInputSchema, type RenamePlanInput, type RenamePlan } from "../schemas/rename.js";
import type { ToolDescriptor } from "./types.js";

export interface RenamePlanOutput {
  plan: RenamePlan;
  planPath: string;
  diffPath: string;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export const renamePlanTool: ToolDescriptor<RenamePlanInput, RenamePlanOutput> = {
  name: "forkctl_rename_plan",
  description:
    "Build a read-only rename plan: detect casing variants of `from`, enumerate every file that would change across identity/symbols/textual/post layers, and write a reviewable JSON + diff artifact under .forkctl/.",
  inputSchema: RenamePlanInputSchema,
  handler: async (input) => {
    const logger = buildLogger({ defaultLevel: "info", baseFields: { tool: "forkctl_rename_plan" } });
    const repoRoot = path.resolve(input.path);
    if (!(await exists(repoRoot))) {
      return fail(
        new ForkctlError("RENAME_NOT_A_REPO", `path does not exist: ${repoRoot}`, {
          hint: "To fix: pass an absolute or relative path to an existing directory.",
        }),
      );
    }
    if (input.from === input.to) {
      return fail(
        new ForkctlError("RENAME_INVALID_NAME", "`from` and `to` must differ", {
          hint: "To fix: pass a different `--to` name.",
        }),
      );
    }
    await gcSnapshots(repoRoot).catch(() => undefined);

    logger.info("plan-start", { from: input.from, to: input.to, path: repoRoot });
    return safe(async (): Promise<RenamePlanOutput> => {
      const { plan, changes, warnings } = await buildRenamePlan({
        repoRoot,
        from: input.from,
        to: input.to,
        layers: input.layers,
        exclude: input.exclude,
        lockfileStrategy: input.lockfileStrategy,
        deepTs: input.deepTs,
        preserveComments: input.preserveComments,
        preserveHistory: input.preserveHistory,
        brand: input.brand,
        stringsMode: input.stringsMode,
      });
      plan.warnings = warnings;
      const { planPath, diffPath } = await writePlanArtifacts(repoRoot, plan, changes);
      plan.diffPath = path.relative(repoRoot, diffPath).split(path.sep).join("/");
      logger.info("plan-complete", {
        files: plan.totalFiles,
        warnings: warnings.length,
      });
      return { plan, planPath, diffPath };
    });
  },
};
