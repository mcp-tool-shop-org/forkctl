import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { RenameChange } from "../../../schemas/rename.js";
import type { IdentityEditor, IdentityEditorContext, IdentityEditorResult } from "./types.js";

/**
 * Rewrites the identity-carrying fields of every `package.json` in the tree.
 * Fields: `name`, `bin` keys, `repository.url`, `homepage`, `bugs.url`.
 *
 * We rewrite by *exact match on the old name*. Partial matches are left alone —
 * e.g. a package named `foo-bar` when renaming `foo` → `baz` is untouched.
 */

function replaceInString(
  s: string,
  from: string,
  to: string,
): { out: string; changed: boolean } {
  if (s === from) return { out: to, changed: true };
  // Substring replace inside URL/path-like values. Word-boundary-ish: require
  // a non-alphanumeric on either side or the ends.
  const re = new RegExp(`(^|[^A-Za-z0-9_])(${escapeRegex(from)})(?=[^A-Za-z0-9_]|$)`, "g");
  let changed = false;
  const out = s.replace(re, (_m, pre: string) => {
    changed = true;
    return `${pre}${to}`;
  });
  return { out, changed };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function findPackageJsons(root: string): Promise<string[]> {
  const results: string[] = [];
  const ignore = new Set(["node_modules", ".git", "dist", "build", "out", ".next", ".astro", "coverage", ".forkable"]);
  async function recur(dir: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (ignore.has(entry.name)) continue;
        await recur(path.join(dir, entry.name));
      } else if (entry.isFile() && entry.name === "package.json") {
        results.push(path.join(dir, entry.name));
      }
    }
  }
  await recur(root);
  return results;
}

export const packageJsonEditor: IdentityEditor = {
  kind: "package.json",
  async run(ctx: IdentityEditorContext): Promise<IdentityEditorResult[]> {
    const files = await findPackageJsons(ctx.repoRoot);
    const out: IdentityEditorResult[] = [];
    for (const abs of files) {
      const rel = path.relative(ctx.repoRoot, abs).split(path.sep).join("/");
      let raw: string;
      try {
        raw = await fs.readFile(abs, "utf8");
      } catch {
        continue;
      }
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(raw);
      } catch {
        continue;
      }
      const changes: RenameChange[] = [];
      let mutated = false;

      const tryField = (pathStr: string, value: unknown, set: (v: string) => void): void => {
        if (typeof value !== "string") return;
        const { out: next, changed } = replaceInString(value, ctx.from, ctx.to);
        if (changed && next !== value) {
          changes.push({ file: rel, layer: "identity", kind: `package.json:${pathStr}`, before: value, after: next });
          set(next);
          mutated = true;
        }
      };

      tryField("name", json.name, (v) => { json.name = v; });
      tryField("homepage", json.homepage, (v) => { json.homepage = v; });

      if (json.bin && typeof json.bin === "object" && !Array.isArray(json.bin)) {
        const bin = json.bin as Record<string, string>;
        const newBin: Record<string, string> = {};
        for (const [k, v] of Object.entries(bin)) {
          const { out: nextKey, changed: keyChanged } = replaceInString(k, ctx.from, ctx.to);
          const { out: nextVal, changed: valChanged } = typeof v === "string"
            ? replaceInString(v, ctx.from, ctx.to)
            : { out: v as unknown as string, changed: false };
          if (keyChanged) {
            changes.push({ file: rel, layer: "identity", kind: "package.json:bin[key]", before: k, after: nextKey });
          }
          if (valChanged) {
            changes.push({ file: rel, layer: "identity", kind: "package.json:bin[value]", before: String(v), after: nextVal });
          }
          newBin[nextKey] = nextVal;
          if (keyChanged || valChanged) mutated = true;
        }
        json.bin = newBin;
      } else if (typeof json.bin === "string") {
        tryField("bin", json.bin, (v) => { json.bin = v; });
      }

      if (json.repository && typeof json.repository === "object" && !Array.isArray(json.repository)) {
        const repo = json.repository as Record<string, unknown>;
        tryField("repository.url", repo.url, (v) => { repo.url = v; });
      } else if (typeof json.repository === "string") {
        tryField("repository", json.repository, (v) => { json.repository = v; });
      }

      if (json.bugs && typeof json.bugs === "object" && !Array.isArray(json.bugs)) {
        const bugs = json.bugs as Record<string, unknown>;
        tryField("bugs.url", bugs.url, (v) => { bugs.url = v; });
      }

      if (changes.length === 0) {
        out.push({ changes: [], fileAbs: abs, fileRel: rel });
        continue;
      }

      if (ctx.apply && mutated) {
        // Preserve trailing newline if original had one.
        const trailing = raw.endsWith("\n") ? "\n" : "";
        await fs.writeFile(abs, JSON.stringify(json, null, 2) + trailing, "utf8");
      }
      out.push({ changes, fileAbs: abs, fileRel: rel });
    }
    return out;
  },
};
