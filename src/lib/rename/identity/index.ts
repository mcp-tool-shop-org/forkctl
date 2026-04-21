import type { RenameChange } from "../../../schemas/rename.js";
import { cargoTomlEditor, pyprojectTomlEditor } from "./toml-based.js";
import { goModEditor } from "./go-mod.js";
import { packageJsonEditor } from "./package-json.js";
import {
  astroConfigEditor,
  composerJsonEditor,
  githubWorkflowsEditor,
  gradleEditor,
  licenseEditor,
  pomXmlEditor,
} from "./simple-text.js";
import type { IdentityEditor, IdentityEditorContext } from "./types.js";

/**
 * Ordered list of identity editors. Dispatch runs them all.
 * Order affects which `kind` tag wins for files that would match multiple
 * editors (in practice editors target disjoint filenames).
 */
export const IDENTITY_EDITORS: readonly IdentityEditor[] = [
  packageJsonEditor,
  cargoTomlEditor,
  pyprojectTomlEditor,
  goModEditor,
  composerJsonEditor,
  pomXmlEditor,
  gradleEditor,
  licenseEditor,
  githubWorkflowsEditor,
  astroConfigEditor,
];

export interface IdentityPassResult {
  changes: RenameChange[];
  files: Set<string>;
  hotspots: string[];
}

/**
 * Run the identity pass end-to-end. In dry-run mode, no writes occur.
 */
export async function runIdentityPass(ctx: IdentityEditorContext): Promise<IdentityPassResult> {
  const allChanges: RenameChange[] = [];
  const files = new Set<string>();
  for (const editor of IDENTITY_EDITORS) {
    try {
      const results = await editor.run(ctx);
      for (const r of results) {
        if (r.fileRel) files.add(r.fileRel);
        for (const c of r.changes) allChanges.push(c);
      }
    } catch {
      // Individual editor failure is isolated; other editors keep running.
      // Higher layer can surface via warnings.
    }
  }
  // Hotspots: files with >1 change, sorted by change count.
  const countsByFile = new Map<string, number>();
  for (const c of allChanges) {
    countsByFile.set(c.file, (countsByFile.get(c.file) ?? 0) + 1);
  }
  const hotspots = Array.from(countsByFile.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([f]) => f);
  return { changes: allChanges, files, hotspots };
}

export type { IdentityEditorContext } from "./types.js";
