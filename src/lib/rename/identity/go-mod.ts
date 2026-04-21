import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { RenameChange } from "../../../schemas/rename.js";
import type { IdentityEditor, IdentityEditorContext, IdentityEditorResult } from "./types.js";

/** Rewrite the `module` line in every `go.mod` file. */
async function findFile(root: string, name: string): Promise<string[]> {
  const results: string[] = [];
  const ignore = new Set(["node_modules", ".git", "vendor", "dist", "build", ".forkctl"]);
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
      } else if (entry.isFile() && entry.name === name) {
        results.push(path.join(dir, entry.name));
      }
    }
  }
  await recur(root);
  return results;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const goModEditor: IdentityEditor = {
  kind: "go.mod",
  async run(ctx: IdentityEditorContext): Promise<IdentityEditorResult[]> {
    const files = await findFile(ctx.repoRoot, "go.mod");
    const out: IdentityEditorResult[] = [];
    const re = new RegExp(`^(module\\s+)(.*?${escapeRegex(ctx.from)}.*?)$`, "m");
    for (const abs of files) {
      const rel = path.relative(ctx.repoRoot, abs).split(path.sep).join("/");
      let raw: string;
      try {
        raw = await fs.readFile(abs, "utf8");
      } catch {
        continue;
      }
      const m = raw.match(re);
      if (!m) {
        out.push({ changes: [], fileAbs: abs, fileRel: rel });
        continue;
      }
      const oldLine = m[2]!;
      const substRe = new RegExp(`(^|[^A-Za-z0-9_])${escapeRegex(ctx.from)}(?=[^A-Za-z0-9_]|$)`, "g");
      const newLine = oldLine.replace(substRe, (_mm, pre: string) => `${pre}${ctx.to}`);
      if (newLine === oldLine) {
        out.push({ changes: [], fileAbs: abs, fileRel: rel });
        continue;
      }
      const changes: RenameChange[] = [
        { file: rel, layer: "identity", kind: "go.mod:module", before: oldLine, after: newLine },
      ];
      if (ctx.apply) {
        const next = raw.replace(re, `$1${newLine}`);
        await fs.writeFile(abs, next, "utf8");
      }
      out.push({ changes, fileAbs: abs, fileRel: rel });
    }
    return out;
  },
};
