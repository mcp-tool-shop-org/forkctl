/**
 * Plan-builder — orchestrates all passes in dry-run mode and produces a
 * `RenamePlan` artifact plus a diff preview.
 */

import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import * as path from "node:path";
import type {
  RenameChange,
  RenameLayer,
  RenamePlan,
  RenameWarning,
  VariantEntry,
  VariantKey,
} from "../../schemas/rename.js";
import { runIdentityPass } from "./identity/index.js";
import { runSymbolsPass } from "./symbols.js";
import { runDeepTsPass } from "./deep-ts.js";
import { runTextualPass } from "./textual.js";
import { runPostPass } from "./post.js";
import { buildVariantSet, type VariantSet } from "./variants.js";
import { buildLanguageManifest, walkRepo } from "./walk.js";

export interface BuildPlanOptions {
  repoRoot: string;
  from: string;
  to: string;
  layers: RenameLayer[];
  exclude: string[];
  lockfileStrategy: "regenerate" | "skip";
  deepTs?: boolean | undefined;
  preserveComments: boolean;
  preserveHistory?: boolean;
}

function variantsToSchemaRecord(v: VariantSet): Record<VariantKey, VariantEntry> {
  return {
    "kebab-case": v["kebab-case"],
    snake_case: v.snake_case,
    camelCase: v.camelCase,
    PascalCase: v.PascalCase,
    SCREAMING_SNAKE: v.SCREAMING_SNAKE,
    "dot.case": v["dot.case"],
    "Title Case": v["Title Case"],
  };
}

function hashPlanInput(opts: BuildPlanOptions): string {
  const h = createHash("sha256");
  h.update(JSON.stringify({
    from: opts.from,
    to: opts.to,
    layers: [...opts.layers].sort(),
    path: path.resolve(opts.repoRoot),
    exclude: [...opts.exclude].sort(),
    lockfileStrategy: opts.lockfileStrategy,
    deepTs: opts.deepTs,
    preserveComments: opts.preserveComments,
    preserveHistory: opts.preserveHistory ?? true,
  }));
  return h.digest("hex").slice(0, 16);
}

export async function buildRenamePlan(opts: BuildPlanOptions): Promise<{ plan: RenamePlan; changes: RenameChange[]; warnings: RenameWarning[] }> {
  const variants = buildVariantSet(opts.from, opts.to);
  const warnings: RenameWarning[] = [];
  const allChanges: RenameChange[] = [];
  const walked = await walkRepo(opts.repoRoot, { exclude: opts.exclude });
  const langMan = buildLanguageManifest(walked);

  const plan: RenamePlan = {
    from: opts.from,
    to: opts.to,
    path: path.resolve(opts.repoRoot),
    createdAt: new Date().toISOString(),
    variants: variantsToSchemaRecord(variants),
    layers: {},
    excluded: [
      ".git", "node_modules", "bower_components", "dist", "build", "out",
      ".next", ".nuxt", ".astro", "target", "__pycache__", ".venv", "venv", "coverage",
      ...opts.exclude,
    ],
    warnings,
    totalFiles: 0,
    selectedLayers: opts.layers,
    lockfileStrategy: opts.lockfileStrategy,
    fingerprint: hashPlanInput(opts),
  };

  const identityFiles = new Set<string>();

  if (opts.layers.includes("identity")) {
    const r = await runIdentityPass({
      repoRoot: opts.repoRoot,
      from: opts.from,
      to: opts.to,
      variants,
      apply: false,
    });
    for (const f of r.files) identityFiles.add(f);
    allChanges.push(...r.changes);
    plan.layers.identity = {
      files: r.files.size,
      hotspots: r.hotspots,
      changes: r.changes,
    };
  }

  if (opts.layers.includes("symbols")) {
    const r = await runSymbolsPass({
      repoRoot: opts.repoRoot,
      variants,
      apply: false,
      preserveComments: opts.preserveComments,
      files: walked,
      byLanguage: langMan.byLanguage,
    });
    if (!r.available) {
      warnings.push({
        code: "RENAME_SYMBOLS_UNAVAILABLE",
        message: "ast-grep not available — symbols pass skipped. Identifier-safe rewrites are not performed.",
      });
    }
    for (const w of r.warnings) warnings.push(w);
    allChanges.push(...r.changes);
    plan.layers.symbols = {
      files: r.filesChanged.size,
      byLanguage: r.byLanguage,
      changes: r.changes,
    };
  }

  // Pass C — deep-ts. Runs AFTER symbols, BEFORE textual. Auto-enabled when
  // tsconfig.json + ts-morph resolve; explicit opt-out via deepTs: false.
  // Can also be explicitly requested via layers including "deep-ts".
  const deepTsRequested =
    opts.layers.includes("deep-ts") || opts.deepTs !== false;
  if (deepTsRequested) {
    const r = await runDeepTsPass({
      repoRoot: opts.repoRoot,
      variants,
      apply: false,
      deepTs: opts.deepTs,
    });
    if (r.ran) {
      allChanges.push(...r.changes);
      plan.layers.deepTs = {
        files: r.filesChanged.size,
        changes: r.changes,
      };
    }
    for (const w of r.warnings) warnings.push(w);
  }

  if (opts.layers.includes("textual")) {
    const r = await runTextualPass({
      repoRoot: opts.repoRoot,
      variants,
      apply: false,
      files: walked,
      skipFiles: identityFiles,
      preserveHistory: opts.preserveHistory,
    });
    allChanges.push(...r.changes);
    for (const w of r.warnings) warnings.push(w);
    plan.layers.textual = {
      files: r.filesChanged.size,
      hotspots: r.hotspots,
      changes: r.changes,
    };
  }

  if (opts.layers.includes("post")) {
    const r = await runPostPass({
      repoRoot: opts.repoRoot,
      variants,
      from: opts.from,
      to: opts.to,
      apply: false,
      lockfileStrategy: opts.lockfileStrategy,
      runVerify: false,
      files: walked,
    });
    plan.layers.post = {
      lockfilesToRegenerate: r.lockfilesToRegenerate,
      pathsToMove: r.pathsToMove,
      assetsToRegen: r.assetsToRegen,
    };
    for (const w of r.warnings) warnings.push(w);
  }

  plan.totalFiles =
    (plan.layers.identity?.files ?? 0) +
    (plan.layers.symbols?.files ?? 0) +
    (plan.layers.deepTs?.files ?? 0) +
    (plan.layers.textual?.files ?? 0);

  return { plan, changes: allChanges, warnings };
}

/**
 * Write plan + diff artifacts to `.forkctl/`. Creates the dir if needed.
 */
export async function writePlanArtifacts(
  repoRoot: string,
  plan: RenamePlan,
  changes: RenameChange[],
): Promise<{ planPath: string; diffPath: string }> {
  const dir = path.join(repoRoot, ".forkctl");
  await fs.mkdir(dir, { recursive: true });
  const planPath = path.join(dir, "rename-plan.json");
  await fs.writeFile(planPath, JSON.stringify(plan, null, 2) + "\n", "utf8");
  const diffPath = path.join(dir, "rename-plan.diff");
  await fs.writeFile(diffPath, renderDiff(plan, changes), "utf8");
  return { planPath, diffPath };
}

function renderDiff(plan: RenamePlan, changes: RenameChange[]): string {
  const byFile = new Map<string, RenameChange[]>();
  for (const c of changes) {
    if (!byFile.has(c.file)) byFile.set(c.file, []);
    byFile.get(c.file)!.push(c);
  }
  const lines: string[] = [];
  lines.push(`# forkctl rename plan diff`);
  lines.push(`# from: ${plan.from}`);
  lines.push(`# to:   ${plan.to}`);
  lines.push(`# path: ${plan.path}`);
  lines.push(`# total files: ${plan.totalFiles}`);
  lines.push("");
  const files = Array.from(byFile.keys()).sort();
  for (const file of files) {
    const fileChanges = byFile.get(file)!;
    lines.push(`--- a/${file}`);
    lines.push(`+++ b/${file}`);
    for (const c of fileChanges) {
      const lineHint = c.line ? `L${c.line}` : `(${c.layer})`;
      lines.push(`@@ ${lineHint} ${c.kind} @@`);
      lines.push(`- ${c.before}`);
      lines.push(`+ ${c.after}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
