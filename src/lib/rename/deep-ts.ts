/**
 * Pass C — TypeScript deep pass via ts-morph.
 *
 * For TS-heavy repos, ast-grep's identifier-kind match (Pass B) already handles
 * the 95% case. This pass catches the edges ast-grep can't reason about:
 *
 *   - Scope-aware rename via the real TS symbol table
 *   - Re-exports and barrel files (`export { Forkctl } from './forkctl'`) —
 *     both the specifier and the re-export name rewritten as a unit
 *   - Declaration-merging cases (interface + class of the same name)
 *   - `import type` specifier rewrites
 *   - Named-import renames propagating to call sites via the symbol graph
 *
 * Auto-enables when `tsconfig.json` exists at the repo root AND `ts-morph`
 * is resolvable. When either is missing, the pass is a no-op. Explicit opt-out
 * via `deepTs: false`.
 *
 * Runs AFTER ast-grep symbols (Pass B), BEFORE textual (Pass D). Both modify
 * source files — ast-grep handles the bulk, ts-morph is the TS-specific refiner.
 *
 * Failure handling: if ts-morph throws (malformed tsconfig, parse error), we
 * log at warn, record a warning, and do NOT fail the overall rename. The layer
 * contract is best-effort refinement on top of what ast-grep already did.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { RenameChange, RenameWarning } from "../../schemas/rename.js";
import type { Logger } from "../logger.js";
import type { VariantSet } from "./variants.js";
import { rewriteIdentifierVariants } from "./variants.js";

// ts-morph is a heavy dep; import defensively so missing-module is graceful.
type TsMorph = typeof import("ts-morph");
let tsMorphMod: TsMorph | undefined;
let tsMorphResolveAttempted = false;
async function getTsMorph(): Promise<TsMorph | undefined> {
  if (tsMorphMod) return tsMorphMod;
  if (tsMorphResolveAttempted) return undefined;
  tsMorphResolveAttempted = true;
  try {
    tsMorphMod = await import("ts-morph");
    return tsMorphMod;
  } catch {
    return undefined;
  }
}

export interface DeepTsPassOptions {
  repoRoot: string;
  variants: VariantSet;
  apply: boolean;
  /**
   * If explicitly `false`, the pass is skipped regardless of tsconfig presence
   * (user opt-out via `--no-deep-ts`). If `true` or `undefined`, auto-detect.
   */
  deepTs?: boolean | undefined;
  logger?: Logger | undefined;
}

export interface DeepTsPassResult {
  changes: RenameChange[];
  filesChanged: Set<string>;
  warnings: RenameWarning[];
  /** Whether the pass actually ran. False when skipped (no tsconfig, no ts-morph, opt-out). */
  ran: boolean;
  /** Reason the pass was skipped, if applicable. */
  skipReason?: "opt-out" | "no-tsconfig" | "no-ts-morph" | "failed";
}

/**
 * Check whether a name (as seen in TS source) matches any of the enabled
 * casing variants — either as a whole word OR as a case-aware prefix/word
 * within a compound identifier (e.g. `ForkableError`, `makeForkableTool`).
 * Returns the rename target or undefined.
 */
function lookupVariantFromName(
  name: string,
  variants: VariantSet,
): { from: string; to: string } | undefined {
  // Whole-word match (fast path, preserves the original semantic).
  for (const v of Object.values(variants)) {
    if (!v.enabled) continue;
    if (v.from === name) return { from: v.from, to: v.to };
  }
  // Compound identifier — case-aware word-boundary rewrite.
  const rewritten = rewriteIdentifierVariants(name, variants);
  if (rewritten !== null && rewritten !== name) {
    return { from: name, to: rewritten };
  }
  return undefined;
}

async function tsconfigExists(repoRoot: string): Promise<string | undefined> {
  const p = path.join(repoRoot, "tsconfig.json");
  try {
    await fs.access(p);
    return p;
  } catch {
    return undefined;
  }
}

/**
 * Run the TypeScript deep pass. Returns all changes observed.
 *
 * Dry-run strategy: ts-morph mutates source files in memory. For dry-run we
 * rename, capture each file's before/after text by comparing project source
 * files to their on-disk originals, and never call `project.save()`. For
 * apply, we rename then `project.save()` which writes every changed file.
 */
export async function runDeepTsPass(opts: DeepTsPassOptions): Promise<DeepTsPassResult> {
  const result: DeepTsPassResult = {
    changes: [],
    filesChanged: new Set(),
    warnings: [],
    ran: false,
  };

  // Explicit opt-out.
  if (opts.deepTs === false) {
    result.skipReason = "opt-out";
    opts.logger?.info("deep-ts-skip", { reason: "opt-out" });
    return result;
  }

  // Auto-detect: tsconfig.json at repo root.
  const tsconfigPath = await tsconfigExists(opts.repoRoot);
  if (!tsconfigPath) {
    result.skipReason = "no-tsconfig";
    opts.logger?.info("deep-ts-skip", { reason: "no-tsconfig" });
    return result;
  }

  // ts-morph resolvable?
  const mod = await getTsMorph();
  if (!mod) {
    result.skipReason = "no-ts-morph";
    opts.logger?.info("deep-ts-skip", { reason: "no-ts-morph" });
    return result;
  }

  opts.logger?.info("deep-ts-start", {
    apply: opts.apply,
    tsconfig: path.relative(opts.repoRoot, tsconfigPath).split(path.sep).join("/"),
  });

  try {
    const { Project } = mod;
    const project = new Project({
      tsConfigFilePath: tsconfigPath,
      // We don't care about emit diagnostics — this is a rename tool.
      skipAddingFilesFromTsConfig: false,
      skipFileDependencyResolution: false,
      skipLoadingLibFiles: true,
    });

    // Capture originals keyed by absolute path (ts-morph normalizes paths).
    const originals = new Map<string, string>();
    for (const sf of project.getSourceFiles()) {
      originals.set(sf.getFilePath(), sf.getFullText());
    }

    if (originals.size === 0) {
      opts.logger?.info("deep-ts-empty", { message: "no source files from tsconfig" });
      result.ran = true;
      return result;
    }

    // Find renameable declarations whose name matches any variant. We walk each
    // source file and collect named declarations: classes, interfaces, type
    // aliases, enums, functions, variables, and export specifiers.
    //
    // For each match, call `.rename(newName)` — ts-morph propagates across the
    // project's symbol graph (call sites, re-exports, imports, barrels).
    //
    // We process one name at a time and re-scan after each rename, because
    // rename can change identifiers that our previous scan listed.
    let safetyLoop = 0;
    const maxPasses = 8;
    while (safetyLoop < maxPasses) {
      safetyLoop++;
      let renamedThisPass = 0;

      for (const sf of project.getSourceFiles()) {
        // Collect candidate declarations with matching names.
        // We use getDescendants() + a type-guard filter keyed on node kinds
        // that ts-morph's rename() supports.
        const candidates: { node: import("ts-morph").Node; name: string; newName: string; kind: string }[] = [];

        // Classes, interfaces, type aliases, enums, functions (declarations).
        for (const decl of sf.getClasses()) {
          const name = decl.getName();
          if (!name) continue;
          const hit = lookupVariantFromName(name, opts.variants);
          if (hit) candidates.push({ node: decl, name, newName: hit.to, kind: "class" });
          // Class methods and properties — catches `makeForkableTool` method
          // definitions and `ForkableError` nested-class members.
          for (const method of decl.getMethods()) {
            const mName = method.getName();
            const mHit = lookupVariantFromName(mName, opts.variants);
            if (mHit) candidates.push({ node: method, name: mName, newName: mHit.to, kind: "method" });
          }
          for (const prop of decl.getProperties()) {
            const pName = prop.getName();
            const pHit = lookupVariantFromName(pName, opts.variants);
            if (pHit) candidates.push({ node: prop, name: pName, newName: pHit.to, kind: "property" });
          }
        }
        for (const decl of sf.getInterfaces()) {
          const name = decl.getName();
          const hit = lookupVariantFromName(name, opts.variants);
          if (hit) candidates.push({ node: decl, name, newName: hit.to, kind: "interface" });
        }
        for (const decl of sf.getTypeAliases()) {
          const name = decl.getName();
          const hit = lookupVariantFromName(name, opts.variants);
          if (hit) candidates.push({ node: decl, name, newName: hit.to, kind: "type-alias" });
        }
        for (const decl of sf.getEnums()) {
          const name = decl.getName();
          const hit = lookupVariantFromName(name, opts.variants);
          if (hit) candidates.push({ node: decl, name, newName: hit.to, kind: "enum" });
          // Enum members — catches `ForkableErrorCode.MAKE_FORKABLE_BRANCH_EXISTS`
          // members by treating the prefix as case-boundary-matching.
          for (const member of decl.getMembers()) {
            const memName = member.getName();
            const memHit = lookupVariantFromName(memName, opts.variants);
            if (memHit) candidates.push({ node: member, name: memName, newName: memHit.to, kind: "enum-member" });
          }
        }
        for (const decl of sf.getFunctions()) {
          const name = decl.getName();
          if (!name) continue;
          const hit = lookupVariantFromName(name, opts.variants);
          if (hit) candidates.push({ node: decl, name, newName: hit.to, kind: "function" });
        }
        for (const decl of sf.getVariableDeclarations()) {
          const name = decl.getName();
          const hit = lookupVariantFromName(name, opts.variants);
          if (hit) candidates.push({ node: decl, name, newName: hit.to, kind: "variable" });
        }

        if (candidates.length === 0) continue;

        // Pick the first candidate and rename it; break out of the file loop
        // so the next outer iteration re-scans (rename may invalidate other
        // candidate nodes in the same file).
        const first = candidates[0];
        if (!first) continue;
        try {
          // ts-morph's .rename() propagates to all call sites.
          (first.node as unknown as { rename: (n: string) => void }).rename(first.newName);
          renamedThisPass++;
          opts.logger?.debug("deep-ts-rename", {
            file: path.relative(opts.repoRoot, sf.getFilePath()).split(path.sep).join("/"),
            kind: first.kind,
            from: first.name,
            to: first.newName,
          });
          // Re-scan from scratch on next outer iteration.
          break;
        } catch (err) {
          // A single rename failure shouldn't abort the pass.
          result.warnings.push({
            code: "RENAME_DEEP_TS_FAILED",
            message: `ts-morph rename failed for ${first.kind} '${first.name}': ${(err as Error).message}`,
            file: path.relative(opts.repoRoot, sf.getFilePath()).split(path.sep).join("/"),
          });
        }
      }

      if (renamedThisPass === 0) break;
    }

    // Diff every source file against its original; every file with a textual
    // change becomes a RenameChange entry (kind: `deep-ts:file`). A finer-
    // grained diff is possible but noisy — ast-grep already emits per-
    // identifier changes, so deep-ts surfaces file-level deltas as the
    // "refinement on top of Pass B" contract.
    for (const sf of project.getSourceFiles()) {
      const absPath = sf.getFilePath();
      const before = originals.get(absPath);
      if (before === undefined) continue;
      const after = sf.getFullText();
      if (before === after) continue;
      const rel = path.relative(opts.repoRoot, absPath).split(path.sep).join("/");
      result.filesChanged.add(rel);
      result.changes.push({
        file: rel,
        layer: "deep-ts",
        kind: "deep-ts:file",
        // Before/after at the file scope — callers that want per-identifier
        // detail should rely on the symbols pass. We truncate to keep the
        // plan artifact readable.
        before: truncate(before, 120),
        after: truncate(after, 120),
      });
    }

    if (opts.apply && result.filesChanged.size > 0) {
      try {
        await project.save();
        opts.logger?.info("deep-ts-saved", { files: result.filesChanged.size });
      } catch (err) {
        result.warnings.push({
          code: "RENAME_DEEP_TS_FAILED",
          message: `ts-morph project.save() failed: ${(err as Error).message}`,
        });
      }
    } else if (!opts.apply) {
      opts.logger?.info("deep-ts-dryrun", { files: result.filesChanged.size });
    }

    result.ran = true;
    return result;
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    result.warnings.push({
      code: "RENAME_DEEP_TS_FAILED",
      message: `ts-morph pass failed: ${message}`,
    });
    result.skipReason = "failed";
    opts.logger?.warn("deep-ts-failed", { error: message });
    return result;
  }
}

function truncate(s: string, max: number): string {
  const firstLine = s.split(/\r?\n/, 1)[0] ?? "";
  if (firstLine.length <= max) return firstLine;
  return firstLine.slice(0, max - 1) + "…";
}
