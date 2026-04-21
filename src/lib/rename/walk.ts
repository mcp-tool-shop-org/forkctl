/**
 * Directory walker for rename passes. Honors always-excluded dirs and the
 * user's additional exclude globs. Returns POSIX-normalized paths relative
 * to the repo root.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { isInExcludedDir } from "./exclusions.js";

/** Simple glob matcher: supports `*`, `**`, and path-separator-sensitive segments. */
export function matchGlob(pattern: string, relPath: string): boolean {
  // Normalize to POSIX.
  const p = relPath.split(path.sep).join("/");
  // Escape regex metachars except * and ?.
  const re = new RegExp(
    "^" +
      pattern
        .split(path.sep)
        .join("/")
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*\//g, "(?:.*/)?")
        .replace(/\*\*/g, ".*")
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, "[^/]") +
      "$",
  );
  return re.test(p);
}

export function matchAnyGlob(patterns: readonly string[], relPath: string): boolean {
  for (const g of patterns) {
    if (matchGlob(g, relPath)) return true;
  }
  return false;
}

export interface WalkedFile {
  /** POSIX-style relative path from root. */
  rel: string;
  /** Absolute path on disk. */
  abs: string;
  size: number;
}

export interface WalkOptions {
  exclude?: readonly string[];
}

/**
 * Walk the tree rooted at `root`, yielding every non-excluded file.
 * Directory exclusions are applied early (we never descend into .git, etc).
 */
export async function walkRepo(
  root: string,
  opts: WalkOptions = {},
): Promise<WalkedFile[]> {
  const out: WalkedFile[] = [];
  const userExcl = opts.exclude ?? [];

  async function recur(dir: string, parts: string[]): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const childParts = [...parts, entry.name];
      const rel = childParts.join("/");
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (isInExcludedDir(childParts)) continue;
        if (matchAnyGlob(userExcl, rel)) continue;
        await recur(full, childParts);
        continue;
      }
      if (!entry.isFile()) continue;
      if (isInExcludedDir(parts)) continue;
      if (matchAnyGlob(userExcl, rel)) continue;
      let stat: import("node:fs").Stats;
      try {
        stat = await fs.stat(full);
      } catch {
        continue;
      }
      out.push({ rel, abs: full, size: stat.size });
    }
  }

  await recur(root, []);
  return out;
}

/** Detect which language a given file represents. Used by the symbols pass. */
export function languageForFile(rel: string): string | undefined {
  const lower = rel.toLowerCase();
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "TypeScript";
  if (lower.endsWith(".js") || lower.endsWith(".jsx") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) return "JavaScript";
  if (lower.endsWith(".py")) return "Python";
  if (lower.endsWith(".rs")) return "Rust";
  if (lower.endsWith(".go")) return "Go";
  if (lower.endsWith(".java")) return "Java";
  if (lower.endsWith(".rb")) return "Ruby";
  if (lower.endsWith(".php")) return "Php";
  if (lower.endsWith(".cs")) return "CSharp";
  if (lower.endsWith(".c") || lower.endsWith(".h")) return "C";
  if (lower.endsWith(".cpp") || lower.endsWith(".cc") || lower.endsWith(".hpp")) return "Cpp";
  if (lower.endsWith(".swift")) return "Swift";
  if (lower.endsWith(".kt") || lower.endsWith(".kts")) return "Kotlin";
  if (lower.endsWith(".scala")) return "Scala";
  if (lower.endsWith(".lua")) return "Lua";
  if (lower.endsWith(".json")) return "Json";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "Html";
  if (lower.endsWith(".css")) return "Css";
  return undefined;
}

export interface LanguageManifest {
  byLanguage: Record<string, string[]>;
}

export function buildLanguageManifest(files: readonly WalkedFile[]): LanguageManifest {
  const byLanguage: Record<string, string[]> = {};
  for (const f of files) {
    const lang = languageForFile(f.rel);
    if (!lang) continue;
    if (!byLanguage[lang]) byLanguage[lang] = [];
    byLanguage[lang].push(f.rel);
  }
  return { byLanguage };
}
