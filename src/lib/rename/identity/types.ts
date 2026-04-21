import type { RenameChange } from "../../../schemas/rename.js";
import type { VariantSet } from "../variants.js";

/**
 * Shared shape for every identity-pass editor. Each editor reads its target
 * file if present, proposes `RenameChange` records, and — in apply mode —
 * writes the rewritten content back.
 */
export interface IdentityEditorContext {
  repoRoot: string;
  from: string;
  to: string;
  variants: VariantSet;
  apply: boolean;
}

export interface IdentityEditorResult {
  changes: RenameChange[];
  /** The file's absolute path if it was processed (even with zero changes). */
  fileAbs?: string;
  /** The file's relative path (POSIX). */
  fileRel?: string;
}

export interface IdentityEditor {
  /** Human-readable kind — matches the filename (`package.json`, `Cargo.toml`, etc). */
  kind: string;
  /** Process repo-root; return changes. Editors that don't find a target file return []. */
  run(ctx: IdentityEditorContext): Promise<IdentityEditorResult[]>;
}
