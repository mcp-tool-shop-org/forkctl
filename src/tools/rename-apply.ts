import * as path from "node:path";
import { promises as fs } from "node:fs";
import { ForkctlError } from "../lib/errors.js";
import { fail, safe } from "../lib/result.js";
import { buildLogger } from "../lib/logger.js";
import { buildRenamePlan } from "../lib/rename/plan.js";
import { runIdentityPass } from "../lib/rename/identity/index.js";
import { runSymbolsPass } from "../lib/rename/symbols.js";
import { runDeepTsPass } from "../lib/rename/deep-ts.js";
import { runTextualPass } from "../lib/rename/textual.js";
import { runPostPass } from "../lib/rename/post.js";
import { gcSnapshots, takeSnapshot } from "../lib/rename/snapshot.js";
import { buildVariantSet } from "../lib/rename/variants.js";
import { buildLanguageManifest, walkRepo } from "../lib/rename/walk.js";
import {
  RenameApplyInputSchema,
  RenamePlanSchema,
  type RenameApplyInput,
  type RenameReceipt,
  type RenameWarning,
} from "../schemas/rename.js";
import type { ToolDescriptor } from "./types.js";

export interface RenameApplyOutput {
  receipt: RenameReceipt;
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

export const renameApplyTool: ToolDescriptor<RenameApplyInput, RenameApplyOutput> = {
  name: "forkctl_rename_apply",
  description:
    "Apply a rename plan to the target repo. Takes a snapshot first (git stash or file tree), then executes layers A→B→C→D→E in order, and writes a receipt. Rollback available via forkctl_rename_rollback.",
  inputSchema: RenameApplyInputSchema,
  handler: async (input) => {
    const logger = buildLogger({ defaultLevel: "info", baseFields: { tool: "forkctl_rename_apply" } });
    const repoRoot = path.resolve(input.path);
    if (!(await exists(repoRoot))) {
      return fail(
        new ForkctlError("RENAME_NOT_A_REPO", `path does not exist: ${repoRoot}`, {
          hint: "To fix: pass a valid repository path.",
        }),
      );
    }
    const planAbs = path.isAbsolute(input.plan) ? input.plan : path.join(repoRoot, input.plan);
    if (!(await exists(planAbs))) {
      return fail(
        new ForkctlError("RENAME_PLAN_STALE", `plan file not found: ${planAbs}`, {
          hint: "To fix: run `forkctl rename plan` first to produce a plan.json.",
        }),
      );
    }
    await gcSnapshots(repoRoot).catch(() => undefined);

    return safe(async (): Promise<RenameApplyOutput> => {
      const startedAt = new Date().toISOString();
      const rawPlan = JSON.parse(await fs.readFile(planAbs, "utf8")) as unknown;
      const plan = RenamePlanSchema.parse(rawPlan);

      const warnings: RenameWarning[] = [];

      // Rebuild a fresh plan, compare fingerprint — stale detection.
      const rebuilt = await buildRenamePlan({
        repoRoot,
        from: plan.from,
        to: plan.to,
        layers: plan.selectedLayers,
        exclude: [], // excludes are captured inside the plan; we don't re-persist here
        lockfileStrategy: plan.lockfileStrategy,
        preserveComments: false,
      });
      if (rebuilt.plan.fingerprint !== plan.fingerprint) {
        warnings.push({
          code: "RENAME_PLAN_STALE",
          message: "Plan fingerprint differs from current repo state; applying anyway against stored plan intent.",
        });
      }

      // Snapshot.
      logger.info("apply-start", { from: plan.from, to: plan.to, path: repoRoot });
      let snapshot;
      try {
        snapshot = await takeSnapshot(repoRoot);
      } catch (err) {
        if (err instanceof ForkctlError) throw err;
        throw new ForkctlError("RENAME_SNAPSHOT_FAILED", (err as Error).message, {
          hint: "To fix: ensure the repo is readable and writable.",
        });
      }

      const variants = buildVariantSet(plan.from, plan.to);
      const walked = await walkRepo(repoRoot, { exclude: [] });
      const langMan = buildLanguageManifest(walked);

      const perLayer: RenameReceipt["perLayer"] = {};
      const layersApplied: RenameReceipt["layersApplied"] = [];
      const identityFiles = new Set<string>();

      if (plan.selectedLayers.includes("identity")) {
        logger.info("per-layer-start", { layer: "identity" });
        const r = await runIdentityPass({
          repoRoot,
          from: plan.from,
          to: plan.to,
          variants,
          apply: true,
        });
        for (const f of r.files) identityFiles.add(f);
        perLayer.identity = r.files.size;
        layersApplied.push("identity");
        logger.info("per-layer-complete", { layer: "identity", files: r.files.size });
      }

      if (plan.selectedLayers.includes("symbols")) {
        logger.info("per-layer-start", { layer: "symbols" });
        const r = await runSymbolsPass({
          repoRoot,
          variants,
          apply: true,
          preserveComments: false,
          files: walked,
          byLanguage: langMan.byLanguage,
        });
        perLayer.symbols = r.filesChanged.size;
        layersApplied.push("symbols");
        if (!r.available) {
          warnings.push({ code: "RENAME_SYMBOLS_UNAVAILABLE", message: "ast-grep unavailable — symbols pass skipped." });
        }
        for (const w of r.warnings) warnings.push(w);
        logger.info("per-layer-complete", { layer: "symbols", files: r.filesChanged.size });
      }

      // Pass C — deep-ts. Runs after symbols, before textual. Auto-enabled
      // when tsconfig.json + ts-morph resolve; skipped otherwise. Failure
      // never blocks the overall rename — degrades to a warning.
      // Plan layer set may or may not list "deep-ts" — we also run when the
      // plan's stored layers.deepTs was populated (plan-time auto-enable).
      const planHasDeepTs = plan.layers.deepTs !== undefined;
      const layersWantDeepTs = plan.selectedLayers.includes("deep-ts");
      if (planHasDeepTs || layersWantDeepTs) {
        logger.info("per-layer-start", { layer: "deep-ts" });
        const r = await runDeepTsPass({
          repoRoot,
          variants,
          apply: true,
          logger,
        });
        if (r.ran) {
          perLayer.deepTs = r.filesChanged.size;
          layersApplied.push("deep-ts");
        }
        for (const w of r.warnings) warnings.push(w);
        logger.info("per-layer-complete", {
          layer: "deep-ts",
          files: r.filesChanged.size,
          ran: r.ran,
          ...(r.skipReason ? { skipReason: r.skipReason } : {}),
        });
      }

      if (plan.selectedLayers.includes("textual")) {
        logger.info("per-layer-start", { layer: "textual" });
        const r = await runTextualPass({
          repoRoot,
          variants,
          apply: true,
          files: walked,
          skipFiles: identityFiles,
          preserveHistory: true,
        });
        perLayer.textual = r.filesChanged.size;
        layersApplied.push("textual");
        for (const w of r.warnings) warnings.push(w);
        logger.info("per-layer-complete", { layer: "textual", files: r.filesChanged.size });
      }

      if (plan.selectedLayers.includes("post")) {
        logger.info("per-layer-start", { layer: "post" });
        const r = await runPostPass({
          repoRoot,
          variants,
          from: plan.from,
          to: plan.to,
          apply: true,
          lockfileStrategy: plan.lockfileStrategy,
          runVerify: input.verify,
          files: walked,
        });
        const postEntry: NonNullable<RenameReceipt["perLayer"]["post"]> = {
          lockfilesRegenerated: r.lockfilesRegenerated,
          pathsMoved: r.pathsMoved,
        };
        if (r.assetRegenManifestPath !== undefined) postEntry.assetRegenManifest = r.assetRegenManifestPath;
        if (r.verify !== undefined) postEntry.verify = r.verify;
        perLayer.post = postEntry;
        layersApplied.push("post");
        for (const w of r.warnings) warnings.push(w);
        logger.info("per-layer-complete", {
          layer: "post",
          lockfiles: r.lockfilesRegenerated.length,
          moves: r.pathsMoved.length,
        });
      }

      const filesChanged =
        (perLayer.identity ?? 0) +
        (perLayer.symbols ?? 0) +
        (perLayer.deepTs ?? 0) +
        (perLayer.textual ?? 0);

      const receipt: RenameReceipt = {
        path: repoRoot,
        from: plan.from,
        to: plan.to,
        startedAt,
        completedAt: new Date().toISOString(),
        snapshotId: snapshot.id,
        snapshotDir: path.relative(repoRoot, snapshot.dir).split(path.sep).join("/"),
        layersApplied,
        filesChanged,
        perLayer,
        warnings,
      };
      // Persist receipt for audit/rollback.
      const receiptDir = path.join(repoRoot, ".forkctl");
      await fs.mkdir(receiptDir, { recursive: true });
      await fs.writeFile(
        path.join(receiptDir, "rename-receipt.json"),
        JSON.stringify(receipt, null, 2) + "\n",
        "utf8",
      );
      logger.info("apply-complete", { filesChanged, layers: layersApplied.length });
      return { receipt };
    });
  },
};
