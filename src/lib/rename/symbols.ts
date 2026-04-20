/**
 * Pass B — code symbols via ast-grep.
 *
 * For each language present in the repo, we run an identifier-kind regex
 * rewrite per casing variant. ast-grep's tree-sitter core guarantees word-
 * boundary semantics (`forkable` never matches inside `forkableness`).
 *
 * We also run a comment-kind match for in-source comments unless
 * `preserveComments` is set (see design §9 open-Q #2).
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
type NapiLang = unknown;
import type { RenameChange } from "../../schemas/rename.js";
import type { VariantSet } from "./variants.js";
import { escapeRegex } from "./variants.js";
import type { WalkedFile } from "./walk.js";

// ast-grep has two shapes across versions; we import defensively.
let napi: typeof import("@ast-grep/napi") | undefined;
async function getNapi(): Promise<typeof import("@ast-grep/napi") | undefined> {
  if (napi) return napi;
  try {
    napi = await import("@ast-grep/napi");
    return napi;
  } catch {
    return undefined;
  }
}

/** ast-grep language enum tokens we actually ship. */
const LANG_MAP: Record<string, string> = {
  TypeScript: "TypeScript",
  JavaScript: "JavaScript",
  Tsx: "Tsx",
  Python: "Python",
  Rust: "Rust",
  Go: "Go",
  Java: "Java",
  Ruby: "Ruby",
  Php: "Php",
  CSharp: "CSharp",
  C: "C",
  Cpp: "Cpp",
  Swift: "Swift",
  Kotlin: "Kotlin",
  Scala: "Scala",
  Lua: "Lua",
  Html: "Html",
  Css: "Css",
};

function resolveLang(
  mod: typeof import("@ast-grep/napi"),
  name: string,
): NapiLang | undefined {
  const key = LANG_MAP[name];
  if (!key) return undefined;
  const langs = (mod as unknown as { Lang?: Record<string, NapiLang> }).Lang;
  if (langs && key in langs) {
    return langs[key];
  }
  return undefined;
}

export interface SymbolsPassOptions {
  repoRoot: string;
  variants: VariantSet;
  apply: boolean;
  preserveComments?: boolean;
  files: readonly WalkedFile[];
  /** Map of language name → list of file rel paths. */
  byLanguage: Record<string, string[]>;
}

export interface SymbolsPassResult {
  changes: RenameChange[];
  filesChanged: Set<string>;
  /** Files per language that yielded at least one change. */
  byLanguage: Record<string, number>;
  /** Whether ast-grep was available. */
  available: boolean;
}

/** Build a longest-first alternation from variant `from` values. */
function buildAlternation(variants: VariantSet): { alt: string; map: Map<string, string> } | null {
  const map = new Map<string, string>();
  for (const v of Object.values(variants)) {
    if (!v.enabled) continue;
    if (!map.has(v.from)) map.set(v.from, v.to);
  }
  if (map.size === 0) return null;
  const froms = Array.from(map.keys()).sort((a, b) => b.length - a.length);
  const alt = froms.map(escapeRegex).join("|");
  return { alt, map };
}

/**
 * Run the symbols pass. If ast-grep is unavailable or a language isn't
 * resolvable, that language is quietly skipped; higher layers can surface a
 * warning via the plan's warnings list.
 */
export async function runSymbolsPass(opts: SymbolsPassOptions): Promise<SymbolsPassResult> {
  const result: SymbolsPassResult = {
    changes: [],
    filesChanged: new Set(),
    byLanguage: {},
    available: false,
  };
  const mod = await getNapi();
  if (!mod) return result;
  result.available = true;

  const alternation = buildAlternation(opts.variants);
  if (!alternation) return result;

  for (const [langName, relPaths] of Object.entries(opts.byLanguage)) {
    const lang = resolveLang(mod, langName);
    if (!lang) continue;

    for (const rel of relPaths) {
      const abs = path.join(opts.repoRoot, rel);
      let source: string;
      try {
        source = await fs.readFile(abs, "utf8");
      } catch {
        continue;
      }
      const sg = (mod as unknown as {
        parse: (lang: NapiLang, src: string) => { root: () => { findAll: (rule: unknown) => { text: () => string; range: () => { start: { line: number; column: number }; end: { line: number; column: number } } }[] } };
      });
      let root;
      try {
        const parsed = sg.parse(lang, source);
        root = parsed.root();
      } catch {
        continue;
      }

      const fileChanges: RenameChange[] = [];
      // Collect matches: identifiers equal to any variant.
      let identMatches: { text: string; line: number; startOffset: number; endOffset: number }[] = [];
      try {
        const rule = {
          rule: {
            kind: "identifier",
            regex: `^(${alternation.alt})$`,
          },
        };
        const matches = root.findAll(rule) as unknown as Array<{
          text: () => string;
          range: () => { start: { line: number; column: number; index?: number }; end: { line: number; column: number; index?: number } };
        }>;
        identMatches = matches.map((m) => {
          const r = m.range();
          const startOff = (r.start as { index?: number }).index ?? offsetFromLineCol(source, r.start.line, r.start.column);
          const endOff = (r.end as { index?: number }).index ?? offsetFromLineCol(source, r.end.line, r.end.column);
          return { text: m.text(), line: r.start.line + 1, startOffset: startOff, endOffset: endOff };
        });
      } catch {
        identMatches = [];
      }

      if (identMatches.length === 0 && opts.preserveComments) {
        continue;
      }

      // Collect comment-kind matches with word-boundary regex if not preserving.
      let commentHits: { before: string; after: string; line: number; startOffset: number; endOffset: number }[] = [];
      if (!opts.preserveComments) {
        try {
          const commentRule = { rule: { kind: "comment" } };
          const commentMatches = root.findAll(commentRule) as unknown as Array<{
            text: () => string;
            range: () => { start: { line: number; column: number; index?: number }; end: { line: number; column: number; index?: number } };
          }>;
          const re = new RegExp(`\\b(${alternation.alt})\\b`, "g");
          for (const m of commentMatches) {
            const text = m.text();
            const r = m.range();
            const startOff = (r.start as { index?: number }).index ?? offsetFromLineCol(source, r.start.line, r.start.column);
            const endOff = (r.end as { index?: number }).index ?? offsetFromLineCol(source, r.end.line, r.end.column);
            const replaced = text.replace(re, (match) => alternation.map.get(match) ?? match);
            if (replaced !== text) {
              commentHits.push({ before: text, after: replaced, line: r.start.line + 1, startOffset: startOff, endOffset: endOff });
            }
          }
        } catch {
          commentHits = [];
        }
      }

      if (identMatches.length === 0 && commentHits.length === 0) continue;

      // Convert identifier matches to edits.
      const edits: { startOffset: number; endOffset: number; replacement: string }[] = [];
      for (const m of identMatches) {
        const to = alternation.map.get(m.text);
        if (!to) continue;
        edits.push({ startOffset: m.startOffset, endOffset: m.endOffset, replacement: to });
        fileChanges.push({
          file: rel,
          layer: "symbols",
          kind: `${langName}:identifier`,
          line: m.line,
          before: m.text,
          after: to,
        });
      }
      for (const h of commentHits) {
        edits.push({ startOffset: h.startOffset, endOffset: h.endOffset, replacement: h.after });
        fileChanges.push({
          file: rel,
          layer: "symbols",
          kind: `${langName}:comment`,
          line: h.line,
          before: h.before,
          after: h.after,
        });
      }

      if (fileChanges.length === 0) continue;

      if (opts.apply) {
        // Apply edits back-to-front to preserve offsets.
        edits.sort((a, b) => b.startOffset - a.startOffset);
        let next = source;
        for (const e of edits) {
          next = next.slice(0, e.startOffset) + e.replacement + next.slice(e.endOffset);
        }
        try {
          await fs.writeFile(abs, next, "utf8");
        } catch {
          // swallow — warning surfaced by caller
        }
      }

      result.changes.push(...fileChanges);
      result.filesChanged.add(rel);
      result.byLanguage[langName] = (result.byLanguage[langName] ?? 0) + 1;
    }
  }

  return result;
}

function offsetFromLineCol(source: string, line: number, column: number): number {
  let off = 0;
  let cur = 0;
  for (let i = 0; i < source.length && cur < line; i++) {
    if (source[i] === "\n") cur++;
    off = i + 1;
  }
  return off + column;
}
