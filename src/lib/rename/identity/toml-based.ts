import { promises as fs } from "node:fs";
import * as path from "node:path";
import TOML from "@iarna/toml";
import type { RenameChange } from "../../../schemas/rename.js";
import type { IdentityEditor, IdentityEditorContext, IdentityEditorResult } from "./types.js";

/**
 * Common helpers and editors for TOML-based identity files:
 *   - Cargo.toml (Rust)
 *   - pyproject.toml (Python — PEP 621 + Poetry)
 */

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceField(
  value: unknown,
  from: string,
  to: string,
): { next: string; changed: boolean } | null {
  if (typeof value !== "string") return null;
  if (value === from) return { next: to, changed: true };
  const re = new RegExp(`(^|[^A-Za-z0-9_])(${escapeRegex(from)})(?=[^A-Za-z0-9_]|$)`, "g");
  let changed = false;
  const next = value.replace(re, (_m, pre: string) => {
    changed = true;
    return `${pre}${to}`;
  });
  return changed ? { next, changed: true } : { next: value, changed: false };
}

async function findFile(root: string, name: string): Promise<string[]> {
  const results: string[] = [];
  const ignore = new Set(["node_modules", ".git", "target", "dist", "build", "__pycache__", ".venv", "venv", ".forkctl"]);
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

interface TomlFieldRewrite {
  pathStr: string;
  newValue: string;
  oldValue: string;
}

/** Walk a TOML JSON tree applying `replaceField` to listed field paths. Returns changes + mutated doc. */
function rewriteTomlFields(
  doc: Record<string, unknown>,
  fieldPaths: readonly string[],
  from: string,
  to: string,
): { doc: Record<string, unknown>; rewrites: TomlFieldRewrite[] } {
  const rewrites: TomlFieldRewrite[] = [];

  for (const fp of fieldPaths) {
    const segments = fp.split(".");
    let obj: unknown = doc;
    for (let i = 0; i < segments.length - 1; i++) {
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) { obj = undefined; break; }
      obj = (obj as Record<string, unknown>)[segments[i]!];
    }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) continue;
    const parent = obj as Record<string, unknown>;
    const lastKey = segments[segments.length - 1]!;
    const r = replaceField(parent[lastKey], from, to);
    if (r && r.changed) {
      rewrites.push({ pathStr: fp, newValue: r.next, oldValue: parent[lastKey] as string });
      parent[lastKey] = r.next;
    }
  }
  return { doc, rewrites };
}

function rewriteArrayOfTables(
  doc: Record<string, unknown>,
  arrKey: string,
  innerField: string,
  from: string,
  to: string,
): TomlFieldRewrite[] {
  const arr = doc[arrKey];
  if (!Array.isArray(arr)) return [];
  const rewrites: TomlFieldRewrite[] = [];
  for (const entry of arr) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const r = replaceField(rec[innerField], from, to);
    if (r && r.changed) {
      rewrites.push({ pathStr: `${arrKey}.${innerField}`, newValue: r.next, oldValue: rec[innerField] as string });
      rec[innerField] = r.next;
    }
  }
  return rewrites;
}

function emitChanges(file: string, rewrites: TomlFieldRewrite[], prefix: string): RenameChange[] {
  return rewrites.map((r) => ({
    file,
    layer: "identity" as const,
    kind: `${prefix}:${r.pathStr}`,
    before: r.oldValue,
    after: r.newValue,
  }));
}

async function runTomlEditor(
  ctx: IdentityEditorContext,
  filename: string,
  prefix: string,
  apply: (doc: Record<string, unknown>, from: string, to: string) => TomlFieldRewrite[],
): Promise<IdentityEditorResult[]> {
  const files = await findFile(ctx.repoRoot, filename);
  const out: IdentityEditorResult[] = [];
  for (const abs of files) {
    const rel = path.relative(ctx.repoRoot, abs).split(path.sep).join("/");
    let raw: string;
    try {
      raw = await fs.readFile(abs, "utf8");
    } catch {
      continue;
    }
    let doc: Record<string, unknown>;
    try {
      doc = TOML.parse(raw) as Record<string, unknown>;
    } catch {
      continue;
    }
    const rewrites = apply(doc, ctx.from, ctx.to);
    const changes = emitChanges(rel, rewrites, prefix);
    if (changes.length === 0) {
      out.push({ changes: [], fileAbs: abs, fileRel: rel });
      continue;
    }
    if (ctx.apply) {
      try {
        const stringified = TOML.stringify(doc as TOML.JsonMap);
        await fs.writeFile(abs, stringified, "utf8");
      } catch {
        // Fall back: leave file untouched, emit warning via higher layer.
      }
    }
    out.push({ changes, fileAbs: abs, fileRel: rel });
  }
  return out;
}

export const cargoTomlEditor: IdentityEditor = {
  kind: "Cargo.toml",
  run(ctx) {
    return runTomlEditor(ctx, "Cargo.toml", "Cargo.toml", (doc, from, to) => {
      const all: TomlFieldRewrite[] = [];
      const { rewrites } = rewriteTomlFields(
        doc,
        ["package.name", "package.repository", "package.homepage", "package.documentation", "lib.name"],
        from,
        to,
      );
      all.push(...rewrites);
      all.push(...rewriteArrayOfTables(doc, "bin", "name", from, to));
      return all;
    });
  },
};

export const pyprojectTomlEditor: IdentityEditor = {
  kind: "pyproject.toml",
  run(ctx) {
    return runTomlEditor(ctx, "pyproject.toml", "pyproject.toml", (doc, from, to) => {
      const all: TomlFieldRewrite[] = [];
      const { rewrites: a } = rewriteTomlFields(
        doc,
        [
          "project.name",
          "project.urls.Homepage",
          "project.urls.Repository",
          "project.urls.Documentation",
          "project.urls.Issues",
          "tool.poetry.name",
          "tool.poetry.repository",
          "tool.poetry.homepage",
          "tool.poetry.documentation",
        ],
        from,
        to,
      );
      all.push(...a);
      return all;
    });
  },
};
