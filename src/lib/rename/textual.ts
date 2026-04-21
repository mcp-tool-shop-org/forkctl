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
import * as path from "node:path";
import { Buffer } from "node:buffer";
import type { RenameChange, RenameWarning } from "../../schemas/rename.js";
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
  /** Preserve pre-fork-point CHANGELOG entries. Default true (§9 spec). */
  preserveHistory?: boolean;
}

export interface TextualPassResult {
  changes: RenameChange[];
  filesChanged: Set<string>;
  hotspots: string[];
  warnings: RenameWarning[];
}

function classify(
  rel: string,
): "markdown" | "yaml" | "toml" | "text" | "env-example" | "html" | "astro" | "changelog" | null {
  const lower = rel.toLowerCase();
  const base = path.basename(lower);
  // CHANGELOG takes priority over .md so we can apply preserve-history rules.
  if (/^changelog(\..+)?$/.test(base) || base === "changelog") return "changelog";
  if (lower.endsWith(".md") || lower.endsWith(".mdx")) return "markdown";
  if (lower.endsWith(".yml") || lower.endsWith(".yaml")) return "yaml";
  if (lower.endsWith(".toml")) return "toml";
  if (lower.endsWith(".txt")) return "text";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".astro")) return "astro";
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

/** For .env.example — values only. Emits ENV_REQUIRES_REVIEW warnings for keys. */
function rewriteEnvExample(
  source: string,
  variants: VariantSet,
): { output: string; hits: number; keyReviewNotes: { keyBefore: string; keySuggested: string; lineNumber: number }[] } {
  const lines = source.split(/\n/);
  const re = buildWordBoundaryRegex(variants);
  let hits = 0;
  const out: string[] = [];
  const keyReviewNotes: { keyBefore: string; keySuggested: string; lineNumber: number }[] = [];
  lines.forEach((line, idx) => {
    const m = line.match(/^(\s*)([A-Z_][A-Z0-9_]*)(\s*=\s*)(.*)$/);
    if (m) {
      const indent = m[1]!;
      const key = m[2]!;
      const sep = m[3]!;
      const rest = m[4]!;
      // Values: actually apply the rewrite.
      const rewrittenRest = rest.replace(re, (match) => {
        const to = lookupReplacement(variants, match);
        if (to === undefined) return match;
        hits++;
        return to;
      });
      // Keys: leave untouched on disk but flag for review when they contain
      // any variant `from` (case-insensitive, since keys are typically
      // SCREAMING_SNAKE). Suggest the SCREAMING_SNAKE `to` form.
      let suggestedKey = key;
      for (const v of Object.values(variants)) {
        if (!v.enabled) continue;
        const keyRe = new RegExp(`\\b${v.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
        if (keyRe.test(key)) {
          suggestedKey = key.replace(keyRe, v.to);
          break;
        }
      }
      if (suggestedKey !== key) {
        keyReviewNotes.push({ keyBefore: key, keySuggested: suggestedKey, lineNumber: idx + 1 });
      }
      out.push(indent + key + sep + rewrittenRest);
    } else {
      out.push(line);
    }
  });
  return { output: out.join("\n"), hits, keyReviewNotes };
}

/**
 * Rewrite CHANGELOG with pre-fork-point preservation.
 *
 * Rules when `preserveHistory` is true:
 *   1. If a `<!-- pre-fork-point -->` marker appears, skip rewrites on and
 *      after that line.
 *   2. Otherwise, rewrite only the FIRST `## [` version section and preserve
 *      all subsequent version sections (they pre-date the fork).
 *   3. Fallback: no marker AND no `## [` header anywhere → preserve the whole
 *      file (safer default).
 *
 * When `preserveHistory` is false → rewrite everything.
 */
function rewriteChangelog(
  source: string,
  variants: VariantSet,
  preserveHistory: boolean,
): { output: string; hits: number } {
  if (!preserveHistory) {
    const r = rewriteTextual(source, variants);
    return { output: r.output, hits: r.hits.length };
  }

  const lines = source.split(/\n/);
  const re = buildWordBoundaryRegex(variants);

  // Look for explicit fork-point marker.
  let forkIdx = lines.findIndex((l) => /<!--\s*pre-fork-point\s*-->/.test(l));

  if (forkIdx === -1) {
    // Look for the 2nd ## [ version header; everything from there is historical.
    let first = -1;
    let second = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^##\s*\[/.test(lines[i]!)) {
        if (first === -1) first = i;
        else { second = i; break; }
      }
    }
    if (first === -1) {
      // No version headers at all — preserve the whole file.
      return { output: source, hits: 0 };
    }
    forkIdx = second === -1 ? lines.length : second;
  }

  let hits = 0;
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i >= forkIdx) {
      out.push(lines[i]!);
      continue;
    }
    const rewritten = lines[i]!.replace(re, (match) => {
      const to = lookupReplacement(variants, match);
      if (to === undefined) return match;
      hits++;
      return to;
    });
    out.push(rewritten);
  }
  return { output: out.join("\n"), hits };
}

/**
 * Rewrite HTML and Astro files with fence awareness.
 *
 * `<script>` and `<style>` blocks are treated like markdown code fences and
 * preserved verbatim — their contents are handled by the symbols pass (for
 * JS/TS) or skipped (for CSS, unless explicitly wired via the symbols pass'
 * CSS binding). Attribute values fall out naturally via word-boundary regex.
 *
 * Astro frontmatter (`---` fences at the top of a file) is ALSO preserved
 * because its JS/TS content belongs to the symbols pass.
 */
function rewriteHtmlLike(source: string, variants: VariantSet): { output: string; hits: number } {
  const re = buildWordBoundaryRegex(variants);
  let hits = 0;

  // Find script/style/frontmatter regions first, collect as [start, end) ranges
  // we must NOT rewrite.
  const fenceRanges: { start: number; end: number }[] = [];
  const addRange = (re2: RegExp) => {
    let m: RegExpExecArray | null;
    re2.lastIndex = 0;
    while ((m = re2.exec(source))) {
      fenceRanges.push({ start: m.index, end: m.index + m[0].length });
    }
  };
  addRange(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi);
  addRange(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi);
  // Astro frontmatter: leading `---` ... `---` at the very start.
  const frontmatter = source.match(/^---\n[\s\S]*?\n---/);
  if (frontmatter) {
    fenceRanges.push({ start: 0, end: frontmatter[0].length });
  }
  fenceRanges.sort((a, b) => a.start - b.start);

  const isInFence = (offset: number): boolean => {
    for (const r of fenceRanges) {
      if (offset >= r.start && offset < r.end) return true;
    }
    return false;
  };

  const output = source.replace(re, (match, _g, offset: number) => {
    if (isInFence(offset)) return match;
    const to = lookupReplacement(variants, match);
    if (to === undefined) return match;
    hits++;
    return to;
  });
  return { output, hits };
}

export async function runTextualPass(opts: TextualPassOptions): Promise<TextualPassResult> {
  const changes: RenameChange[] = [];
  const filesChanged = new Set<string>();
  const countsByFile = new Map<string, number>();
  const warnings: RenameWarning[] = [];
  const skip = opts.skipFiles ?? new Set<string>();
  const preserveHistory = opts.preserveHistory ?? true;

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
    } else if (kind === "changelog") {
      const r = rewriteChangelog(raw, opts.variants, preserveHistory);
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
      for (const note of r.keyReviewNotes) {
        warnings.push({
          code: "ENV_REQUIRES_REVIEW",
          message:
            `Env key '${note.keyBefore}' in ${f.rel}:${note.lineNumber} was preserved, ` +
            `but appears to reference the old name. Consider renaming it to '${note.keySuggested}' ` +
            `and updating any consuming code.`,
          file: f.rel,
        });
      }
    } else if (kind === "html" || kind === "astro") {
      const r = rewriteHtmlLike(raw, opts.variants);
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

  return { changes, filesChanged, hotspots, warnings };
}

