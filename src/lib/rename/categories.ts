/**
 * Brand-category classifier — tags each `RenameChange` with a semantic
 * category (identifier / env-var / tool-name / error-class / header / other)
 * so the plan diff can summarize "47 identifiers, 12 env-vars, 22 tool-names, …"
 * and users can veto a category whole-cloth by excluding it from apply.
 *
 * Classifier is a pure function — no I/O, no side effects. Safe to run over
 * every hit in-memory regardless of `--brand` flag; the flag only controls
 * whether the categories appear in plan output.
 *
 * Design reference: design/brand-mode.md §4.
 */

import type { RenameChange } from "../../schemas/rename.js";

export const BRAND_CATEGORIES = [
  "identifier",
  "envVar",
  "toolName",
  "errorClass",
  "header",
  "other",
] as const;

export type BrandCategory = (typeof BRAND_CATEGORIES)[number];

export interface BrandCategoryCounts {
  identifier: number;
  envVar: number;
  toolName: number;
  errorClass: number;
  header: number;
  other: number;
}

const SCREAMING_RE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;
const ERROR_SUFFIX_RE = /(?:Error|ErrorCode|Exception)$/;
const SNAKE_WORD_RE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;
const HEADER_PREFIX_RE = /^#{1,6}\s+/;

/**
 * Classify a single RenameChange into its brand category.
 *
 * The decision tree walks in order of specificity (error-class before
 * identifier, header before tool-name) so multi-match cases land in the
 * narrowest category.
 */
export function classifyBrandCategory(change: RenameChange): BrandCategory {
  const { kind, before } = change;

  // Identifier-kind hits: ident kinds include `TypeScript:identifier`,
  // `JavaScript:identifier`, `deep-ts:file` (we treat file-level changes as
  // other since they aren't a single identifier).
  const isIdentifier =
    kind.endsWith(":identifier") ||
    kind.endsWith(":type_identifier") ||
    kind.endsWith(":property_identifier") ||
    kind.endsWith(":shorthand_property_identifier");

  if (isIdentifier) {
    if (SCREAMING_RE.test(before)) return "envVar";
    if (ERROR_SUFFIX_RE.test(before)) return "errorClass";
    return "identifier";
  }

  // String-kind hits: `TypeScript:string`, `JavaScript:string`, etc.
  if (kind.endsWith(":string")) {
    if (HEADER_PREFIX_RE.test(before)) return "header";
    // Trim quotes if present (string node fallback path wraps with quotes).
    const trimmed = before.replace(/^['"`](.*)['"`]$/, "$1");
    if (SCREAMING_RE.test(trimmed)) return "envVar";
    if (SNAKE_WORD_RE.test(trimmed)) return "toolName";
    if (ERROR_SUFFIX_RE.test(trimmed)) return "errorClass";
    return "other";
  }

  return "other";
}

/**
 * Count changes by brand category. Zero-initializes every category so the
 * plan output shape is stable regardless of which categories actually hit.
 */
export function countByBrandCategory(
  changes: readonly RenameChange[],
): BrandCategoryCounts {
  const counts: BrandCategoryCounts = {
    identifier: 0,
    envVar: 0,
    toolName: 0,
    errorClass: 0,
    header: 0,
    other: 0,
  };
  for (const c of changes) {
    counts[classifyBrandCategory(c)]++;
  }
  return counts;
}

/**
 * Per-category file-count: how many distinct files contain at least one hit
 * of this category. Useful for the "47 identifiers across 12 files" phrasing.
 */
export function filesByBrandCategory(
  changes: readonly RenameChange[],
): Record<BrandCategory, number> {
  const files: Record<BrandCategory, Set<string>> = {
    identifier: new Set(),
    envVar: new Set(),
    toolName: new Set(),
    errorClass: new Set(),
    header: new Set(),
    other: new Set(),
  };
  for (const c of changes) {
    files[classifyBrandCategory(c)].add(c.file);
  }
  return {
    identifier: files.identifier.size,
    envVar: files.envVar.size,
    toolName: files.toolName.size,
    errorClass: files.errorClass.size,
    header: files.header.size,
    other: files.other.size,
  };
}
