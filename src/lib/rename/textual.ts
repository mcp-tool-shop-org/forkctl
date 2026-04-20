/**
 * Pass D — non-code textual rewriting.
 *
 * Files covered:
 *   - *.md, *.mdx          (skip code fences; rewrite everything else)
 *   - *.txt                (full-body word-boundary rewrite)
 *   - *.yml, *.yaml        (rewrite values only — keys untouched)
 *   - *.toml (non-identity)(full-body word-boundary rewrite; identity fields were handled in Pass A)
 *   - *.env.example        (values only, keys untouched — diff-only for user review)
 *
 * Word-boundary regex per variant. Longest-first. Uses `rewriteTextual` from
 * variants.ts.
 */

import { promises as fs } from "node:fs";
import { Buffer } from "node:buffer";
import type { RenameChange } from "../../schemas/rename.js";
import type { VariantSet } from "./variants.js";
import { buildWordBoundaryRegex, lookupReplacement, rewriteTextual } from "./variants.js";
import type { WalkedFile } from "./walk.js";
import { isAssetNeedingRegen, isBinaryByExtension, looksBinary } from "./exclusions.js";

export interface TextualPassOptions {
  repoRoot: string;
  variants: VariantSet;
  apply: boolean;
  files: readonly WalkedFile[];
  /** Files already mutated by identity pass — skip them here to avoid double-rewrite. */
  skipFiles?: ReadonlySet<string>;
}

export interface TextualPassResult {
  changes: RenameChange[];
  filesChanged: Set<string>;
  hotspots: string[];
}

function classify(rel: string): "markdown" | "yaml" | "toml" | "text" | "env-example" | null {
  const lower = rel.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".mdx")) return "markdown";
  if (lower.endsWith(".yml") || lower.endsWith(".yaml")) return "yaml";
  if (lower.endsWith(".toml")) return "toml";
  if (lower.endsWith(".txt")) return "text";
  if (/(^|\/)\.env\.example(\..+)?$/.test(lower)) return "env-example";
  return null;
}

/** Rewrite markdown, skipping fenced code blocks. */
function rewriteMarkdown(source: string, variants: VariantSet): { output: string; hits: number } {
  // Walk line-by-line tracking fence state. Skip inline-code spans as well.
  const lines = source.split(/\n/);
  let inFence = false;
  let fenceMarker: string | null = null;
  let hits = 0;
  const out: string[] = [];
  for (const line of lines) {
    const fenceMatch = line.match(/^(\s*)(```+|~~~+)(.*)$/);
    if (fenceMatch) {
      const marker = fenceMatch[2]!;
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
        out.push(line);
        continue;
      } else if (fenceMarker && marker.startsWith(fenceMarker[0]!) && marker.length >= fenceMarker.length) {
        inFence = false;
        fenceMarker = null;
        out.push(line);
        continue;
      }
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    // Outside fence: skip inline-code spans `like this`.
    const processed = line.replace(/(`+)([^`]*)\1/g, (full) => full).split(/(`+[^`]*`+)/g).map((chunk) => {
      if (chunk.startsWith("`")) return chunk;
      const { output, hits: h } = rewriteTextual(chunk, variants);
      hits += h.length;
      return output;
    }).join("");
    out.push(processed);
  }
  return { output: out.join("\n"), hits };
}

/** Rewrite YAML value nodes only. Keys are preserved verbatim. */
function rewriteYaml(source: string, variants: VariantSet): { output: string; hits: number } {
  const lines = source.split(/\n/);
  const re = buildWordBoundaryRegex(variants);
  let hits = 0;
  const out: string[] = [];
  for (const line of lines) {
    // Identify a "key: value" shape; if present, only rewrite the value side.
    const m = line.match(/^(\s*[-]?\s*(?:(?:"[^"]*"|'[^']*'|[A-Za-z_][\w.-]*)\s*:)\s*)(.*)$/);
    if (m) {
      const prefix = m[1]!;
      const rest = m[2]!;
      const rewritten = rest.replace(re, (match) => {
        const to = lookupReplacement(variants, match);
        if (to === undefined) return match;
        hits++;
        return to;
      });
      out.push(prefix + rewritten);
    } else {
      // Bare list item or scalar — apply full rewrite.
      const rewritten = line.replace(re, (match) => {
        const to = lookupReplacement(variants, match);
        if (to === undefined) return match;
        hits++;
        return to;
      });
      out.push(rewritten);
    }
  }
  return { output: out.join("\n"), hits };
}

/** For .env.example — values only. */
function rewriteEnvExample(source: string, variants: VariantSet): { output: string; hits: number } {
  const lines = source.split(/\n/);
  const re = buildWordBoundaryRegex(variants);
  let hits = 0;
  const out: string[] = [];
  for (const line of lines) {
    const m = line.match(/^(\s*[A-Z_][A-Z0-9_]*\s*=\s*)(.*)$/);
    if (m) {
      const prefix = m[1]!;
      const rest = m[2]!;
      const rewritten = rest.replace(re, (match) => {
        const to = lookupReplacement(variants, match);
        if (to === undefined) return match;
        hits++;
        return to;
      });
      out.push(prefix + rewritten);
    } else {
      out.push(line);
    }
  }
  return { output: out.join("\n"), hits };
}

export async function runTextualPass(opts: TextualPassOptions): Promise<TextualPassResult> {
  const changes: RenameChange[] = [];
  const filesChanged = new Set<string>();
  const countsByFile = new Map<string, number>();
  const skip = opts.skipFiles ?? new Set<string>();

  for (const f of opts.files) {
    if (skip.has(f.rel)) continue;
    if (isBinaryByExtension(f.rel)) continue;
    if (isAssetNeedingRegen(f.rel)) continue;
    const kind = classify(f.rel);
    if (!kind) continue;
    let raw: string;
    try {
      raw = await fs.readFile(f.abs, "utf8");
    } catch {
      continue;
    }
    if (looksBinary(Buffer.from(raw.slice(0, 4096)))) continue;

    let output: string;
    let hits: number;
    if (kind === "markdown") {
      const r = rewriteMarkdown(raw, opts.variants);
      output = r.output;
      hits = r.hits;
    } else if (kind === "yaml") {
      const r = rewriteYaml(raw, opts.variants);
      output = r.output;
      hits = r.hits;
    } else if (kind === "env-example") {
      const r = rewriteEnvExample(raw, opts.variants);
      output = r.output;
      hits = r.hits;
    } else {
      // .txt, .toml non-identity
      const r = rewriteTextual(raw, opts.variants);
      output = r.output;
      hits = r.hits.length;
    }

    if (hits === 0) continue;
    changes.push({
      file: f.rel,
      layer: "textual",
      kind: `${kind}:bulk`,
      before: `<${hits} occurrences>`,
      after: `<replaced>`,
    });
    countsByFile.set(f.rel, hits);
    filesChanged.add(f.rel);
    if (opts.apply && output !== raw) {
      try {
        await fs.writeFile(f.abs, output, "utf8");
      } catch {
        // warning surfaced upstream
      }
    }
  }

  const hotspots = Array.from(countsByFile.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([f]) => f);

  return { changes, filesChanged, hotspots };
}

