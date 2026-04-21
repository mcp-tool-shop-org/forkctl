import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { RenameChange } from "../../../schemas/rename.js";
import type { IdentityEditor, IdentityEditorContext, IdentityEditorResult } from "./types.js";

/**
 * A collection of simple text-based identity editors. These treat the file as
 * text with a word-boundary regex — for cases where no structured parser is
 * really worth the dependency (composer.json is JSON but gets the same
 * treatment as others), or where the "identity" surface is a few lines.
 *
 * Covered:
 *   - composer.json (name, bin)   — JSON pass through JSON parser
 *   - pom.xml                     — groupId / artifactId textual rewrite
 *   - build.gradle / .kts         — rootProject.name / group / artifact
 *   - README.md (+ translations)  — H1, repo URLs (bounded rewrites)
 *   - LICENSE                     — copyright holder line
 *   - .github/workflows/*         — workflow `name:` + repo URL refs
 *   - astro.config.*              — identity strings
 */

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Word-boundary replace: matches `from` when flanked by non-identifier chars. */
function wbReplace(text: string, from: string, to: string): { output: string; hits: number } {
  const re = new RegExp(`(^|[^A-Za-z0-9_])(${escapeRegex(from)})(?=[^A-Za-z0-9_]|$)`, "g");
  let hits = 0;
  const output = text.replace(re, (_m, pre: string) => {
    hits++;
    return `${pre}${to}`;
  });
  return { output, hits };
}

async function findByName(root: string, name: string): Promise<string[]> {
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

async function findByGlob(root: string, predicate: (rel: string) => boolean): Promise<string[]> {
  const results: string[] = [];
  const ignore = new Set(["node_modules", ".git", "target", "dist", "build", "__pycache__", ".venv", "venv", ".forkctl"]);
  async function recur(dir: string, parts: string[]): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (ignore.has(entry.name)) continue;
        await recur(path.join(dir, entry.name), [...parts, entry.name]);
      } else if (entry.isFile()) {
        const rel = [...parts, entry.name].join("/");
        if (predicate(rel)) results.push(path.join(dir, entry.name));
      }
    }
  }
  await recur(root, []);
  return results;
}

async function processTextFiles(
  ctx: IdentityEditorContext,
  files: string[],
  kind: string,
): Promise<IdentityEditorResult[]> {
  const out: IdentityEditorResult[] = [];
  for (const abs of files) {
    const rel = path.relative(ctx.repoRoot, abs).split(path.sep).join("/");
    let raw: string;
    try {
      raw = await fs.readFile(abs, "utf8");
    } catch {
      continue;
    }
    const { output, hits } = wbReplace(raw, ctx.from, ctx.to);
    if (hits === 0) {
      out.push({ changes: [], fileAbs: abs, fileRel: rel });
      continue;
    }
    const changes: RenameChange[] = [
      { file: rel, layer: "identity", kind, before: `<${hits} occurrences of "${ctx.from}">`, after: `<replaced with "${ctx.to}">` },
    ];
    if (ctx.apply) {
      await fs.writeFile(abs, output, "utf8");
    }
    out.push({ changes, fileAbs: abs, fileRel: rel });
  }
  return out;
}

export const composerJsonEditor: IdentityEditor = {
  kind: "composer.json",
  async run(ctx) {
    const files = await findByName(ctx.repoRoot, "composer.json");
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
      if (typeof json.name === "string") {
        const { output, hits } = wbReplace(json.name, ctx.from, ctx.to);
        if (hits > 0) {
          changes.push({ file: rel, layer: "identity", kind: "composer.json:name", before: json.name, after: output });
          json.name = output;
        }
      }
      if (Array.isArray(json.bin)) {
        const newBin: string[] = [];
        for (const b of json.bin) {
          if (typeof b === "string") {
            const { output, hits } = wbReplace(b, ctx.from, ctx.to);
            if (hits > 0) {
              changes.push({ file: rel, layer: "identity", kind: "composer.json:bin", before: b, after: output });
            }
            newBin.push(output);
          } else {
            newBin.push(b as string);
          }
        }
        json.bin = newBin;
      }
      if (changes.length > 0 && ctx.apply) {
        const trailing = raw.endsWith("\n") ? "\n" : "";
        await fs.writeFile(abs, JSON.stringify(json, null, 2) + trailing, "utf8");
      }
      out.push({ changes, fileAbs: abs, fileRel: rel });
    }
    return out;
  },
};

export const pomXmlEditor: IdentityEditor = {
  kind: "pom.xml",
  async run(ctx) {
    const files = await findByName(ctx.repoRoot, "pom.xml");
    // pom.xml is XML. For identity-level, the safest move is a bounded text
    // pass on <groupId>, <artifactId>, <name>, and <url> contents.
    const out: IdentityEditorResult[] = [];
    for (const abs of files) {
      const rel = path.relative(ctx.repoRoot, abs).split(path.sep).join("/");
      let raw: string;
      try {
        raw = await fs.readFile(abs, "utf8");
      } catch {
        continue;
      }
      const tags = ["groupId", "artifactId", "name", "url", "scm", "connection"];
      const changes: RenameChange[] = [];
      let next = raw;
      for (const tag of tags) {
        const re = new RegExp(`(<${tag}>)([^<]*)(</${tag}>)`, "g");
        next = next.replace(re, (_m, open: string, inner: string, close: string) => {
          const { output, hits } = wbReplace(inner, ctx.from, ctx.to);
          if (hits > 0) {
            changes.push({ file: rel, layer: "identity", kind: `pom.xml:<${tag}>`, before: inner, after: output });
            return `${open}${output}${close}`;
          }
          return `${open}${inner}${close}`;
        });
      }
      if (changes.length > 0 && ctx.apply) {
        await fs.writeFile(abs, next, "utf8");
      }
      out.push({ changes, fileAbs: abs, fileRel: rel });
    }
    return out;
  },
};

export const gradleEditor: IdentityEditor = {
  kind: "build.gradle",
  async run(ctx) {
    const files = [
      ...(await findByName(ctx.repoRoot, "build.gradle")),
      ...(await findByName(ctx.repoRoot, "build.gradle.kts")),
      ...(await findByName(ctx.repoRoot, "settings.gradle")),
      ...(await findByName(ctx.repoRoot, "settings.gradle.kts")),
    ];
    return processTextFiles(ctx, files, "gradle:identity");
  },
};

export const readmeMdEditor: IdentityEditor = {
  kind: "README.md",
  async run(ctx) {
    // README.md + translated variants (README.ja.md, etc.)
    const files = await findByGlob(ctx.repoRoot, (rel) => /(^|\/)(README|readme)(\.[a-zA-Z\-]+)?\.(md|mdx)$/.test(rel));
    return processTextFiles(ctx, files, "README.md");
  },
};

export const licenseEditor: IdentityEditor = {
  kind: "LICENSE",
  async run(ctx) {
    // LICENSE / LICENSE.md / LICENCE variants.
    const files = await findByGlob(ctx.repoRoot, (rel) => /(^|\/)(LICEN[SC]E)(\.[a-zA-Z]+)?$/.test(rel));
    const out: IdentityEditorResult[] = [];
    // Only rewrite when the string appears on a "Copyright" line, to avoid
    // mangling the body of unfamiliar license texts.
    for (const abs of files) {
      const rel = path.relative(ctx.repoRoot, abs).split(path.sep).join("/");
      let raw: string;
      try {
        raw = await fs.readFile(abs, "utf8");
      } catch {
        continue;
      }
      const changes: RenameChange[] = [];
      const lines = raw.split(/\r?\n/);
      let mutated = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (!/copyright/i.test(line)) continue;
        const { output, hits } = wbReplace(line, ctx.from, ctx.to);
        if (hits > 0) {
          changes.push({ file: rel, layer: "identity", kind: "LICENSE:copyright", line: i + 1, before: line, after: output });
          lines[i] = output;
          mutated = true;
        }
      }
      if (mutated && ctx.apply) {
        await fs.writeFile(abs, lines.join("\n"), "utf8");
      }
      out.push({ changes, fileAbs: abs, fileRel: rel });
    }
    return out;
  },
};

export const githubWorkflowsEditor: IdentityEditor = {
  kind: ".github/workflows",
  async run(ctx) {
    const files = await findByGlob(ctx.repoRoot, (rel) => /^\.github\/workflows\/.+\.(yml|yaml)$/.test(rel));
    return processTextFiles(ctx, files, "github-workflow:identity");
  },
};

export const astroConfigEditor: IdentityEditor = {
  kind: "astro.config",
  async run(ctx) {
    const files = await findByGlob(ctx.repoRoot, (rel) => /(^|\/)astro\.config\.(mjs|js|ts|cjs)$/.test(rel));
    return processTextFiles(ctx, files, "astro.config:identity");
  },
};
