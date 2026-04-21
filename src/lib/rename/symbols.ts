/**
 * Pass B — code symbols via ast-grep.
 *
 * For each language present in the repo, we run an identifier-kind regex
 * rewrite per casing variant. ast-grep's tree-sitter core guarantees word-
 * boundary semantics (`forkctl` never matches inside `forkableness`).
 *
 * We also run a comment-kind match for in-source comments unless
 * `preserveComments` is set (see design §9 open-Q #2).
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
type NapiLang = unknown;
import type { RenameChange, RenameWarning } from "../../schemas/rename.js";
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

/**
 * ast-grep language enum tokens we actually ship in v1.1.0.
 *
 * The default `@ast-grep/napi` build ships tree-sitter bindings only for
 * JavaScript, TypeScript, Tsx, Html, and Css. The broader polyglot set
 * documented in the Bug 3 report (Python/Rust/Go/Java/Ruby/Php/CSharp/C/Cpp/
 * Swift/Kotlin/Scala/Lua) is bundled behind optional `@ast-grep/lang-*`
 * packages that we have NOT yet added as runtime dependencies — forkctl
 * v1.1.0 narrows the claim to the native set and emits a
 * `RENAME_LANG_UNAVAILABLE` warning when source files of an unsupported
 * language are encountered. Wider polyglot coverage is v1.2.0 work.
 *
 * See design/rename.md §3 Pass B.
 */
const LANG_MAP: Record<string, string> = {
  TypeScript: "TypeScript",
  JavaScript: "JavaScript",
  Tsx: "Tsx",
  Html: "Html",
  Css: "Css",
};

/** TypeScript/Tsx-specific kinds where class/interface/type-alias names live. */
const TYPE_IDENTIFIER_LANGS = new Set(["TypeScript", "Tsx"]);

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
  /** Non-fatal warnings (unavailable language bindings, string-literal rewrites, etc.). */
  warnings: RenameWarning[];
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
 * Run the symbols pass. If ast-grep is unavailable, all languages are skipped
 * and `available` is false — the plan layer emits `RENAME_SYMBOLS_UNAVAILABLE`.
 * If ast-grep is loaded but a specific language binding is not in the default
 * napi build (e.g. Python/Rust/Go in v1.1.0), that language is skipped and a
 * `RENAME_LANG_UNAVAILABLE` warning is emitted so the user is never silently
 * no-op'd on source files.
 */
export async function runSymbolsPass(opts: SymbolsPassOptions): Promise<SymbolsPassResult> {
  const result: SymbolsPassResult = {
    changes: [],
    filesChanged: new Set(),
    byLanguage: {},
    available: false,
    warnings: [],
  };
  const mod = await getNapi();
  if (!mod) return result;
  result.available = true;

  const alternation = buildAlternation(opts.variants);
  if (!alternation) return result;

  // Track languages we've already warned about so we don't spam one warning
  // per file — one warning per unsupported language, with the file count.
  const unavailableWarned = new Set<string>();

  for (const [langName, relPaths] of Object.entries(opts.byLanguage)) {
    const lang = resolveLang(mod, langName);
    if (!lang) {
      // Language not supported in the shipped napi bindings. Emit one
      // aggregate warning per language listing the file count.
      if (!unavailableWarned.has(langName)) {
        unavailableWarned.add(langName);
        result.warnings.push({
          code: "RENAME_LANG_UNAVAILABLE",
          message:
            `Language '${langName}' is not available in the shipped ast-grep bindings ` +
            `(${relPaths.length} file${relPaths.length === 1 ? "" : "s"} skipped). ` +
            `Identifier-level rewrites are not performed for these files in v1.1.0.`,
        });
      }
      continue;
    }

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

      interface HitRange {
        text: string;
        line: number;
        startOffset: number;
        endOffset: number;
      }

      const fileChanges: RenameChange[] = [];

      /**
       * Helper — run findAll for a given rule and normalize to HitRange[].
       * Any per-kind failure swallows back to an empty list; the outer loop
       * continues across other kinds.
       */
      const findKind = (rule: unknown): HitRange[] => {
        try {
          const matches = root.findAll(rule) as unknown as Array<{
            text: () => string;
            range: () => { start: { line: number; column: number; index?: number }; end: { line: number; column: number; index?: number } };
          }>;
          return matches.map((m) => {
            const r = m.range();
            const startOff = (r.start as { index?: number }).index ?? offsetFromLineCol(source, r.start.line, r.start.column);
            const endOff = (r.end as { index?: number }).index ?? offsetFromLineCol(source, r.end.line, r.end.column);
            return { text: m.text(), line: r.start.line + 1, startOffset: startOff, endOffset: endOff };
          });
        } catch {
          return [];
        }
      };

      /** Dedupe overlapping matches by offset range. */
      const pushUnique = (target: HitRange[], hits: HitRange[]) => {
        for (const h of hits) {
          const dup = target.some(
            (t) => t.startOffset === h.startOffset && t.endOffset === h.endOffset,
          );
          if (!dup) target.push(h);
        }
      };

      // ---- Identifier-kind matches (functions, consts, imports, etc.) ----
      const identMatches: HitRange[] = [];
      pushUnique(
        identMatches,
        findKind({ rule: { kind: "identifier", regex: `^(${alternation.alt})$` } }),
      );
      // For TS/Tsx, class and interface names use kind: type_identifier.
      // Without this, `class Forkctl {}` and `interface Forkctl {}` are missed
      // entirely. See Bug 1 in tests-found-bugs.md.
      if (TYPE_IDENTIFIER_LANGS.has(langName)) {
        pushUnique(
          identMatches,
          findKind({ rule: { kind: "type_identifier", regex: `^(${alternation.alt})$` } }),
        );
      }

      // ---- Comment-kind matches (skipped under preserveComments). ----
      const commentHits: { before: string; after: string; line: number; startOffset: number; endOffset: number }[] = [];
      if (!opts.preserveComments) {
        try {
          const commentMatches = root.findAll({ rule: { kind: "comment" } }) as unknown as Array<{
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
          // silent — no comment-kind support in this language
        }
      }

      // ---- String-literal rewrites (Bug 2 / §9.3 default-on). ----
      // We rewrite inside `string_fragment` (preferred; gives us the unquoted
      // content) and fall back to `string` / `template_string` where the
      // language grammar doesn't expose fragments. Each rewritten occurrence
      // emits a STRING_LITERAL_REWRITTEN warning so the user can review.
      interface StringHit { before: string; after: string; line: number; startOffset: number; endOffset: number }
      const stringHits: StringHit[] = [];
      const wordRe = new RegExp(`\\b(${alternation.alt})\\b`, "g");

      const stringFragmentMatches = findKind({ rule: { kind: "string_fragment" } });
      const seenFragmentOffsets = new Set<string>();
      for (const m of stringFragmentMatches) {
        const replaced = m.text.replace(wordRe, (match) => alternation.map.get(match) ?? match);
        if (replaced !== m.text) {
          stringHits.push({ before: m.text, after: replaced, line: m.line, startOffset: m.startOffset, endOffset: m.endOffset });
          seenFragmentOffsets.add(`${m.startOffset}:${m.endOffset}`);
        }
      }
      // Fallback for languages/grammars that don't expose string_fragment —
      // operate on the string node itself, but only rewrite the interior to
      // avoid clobbering the quote characters.
      for (const kind of ["string", "template_string"]) {
        const stringNodeMatches = findKind({ rule: { kind } });
        for (const m of stringNodeMatches) {
          // Skip if a fragment inside this string already covered the rewrite.
          const hasFragmentInside = stringFragmentMatches.some(
            (f) => f.startOffset >= m.startOffset && f.endOffset <= m.endOffset,
          );
          if (hasFragmentInside) continue;
          if (seenFragmentOffsets.has(`${m.startOffset}:${m.endOffset}`)) continue;
          // Heuristic: preserve first and last char (quote / backtick) and
          // rewrite only the body.
          if (m.text.length < 2) continue;
          const first = m.text[0];
          const last = m.text[m.text.length - 1];
          const body = m.text.slice(1, -1);
          const replacedBody = body.replace(wordRe, (match) => alternation.map.get(match) ?? match);
          if (replacedBody !== body) {
            stringHits.push({
              before: m.text,
              after: `${first}${replacedBody}${last}`,
              line: m.line,
              startOffset: m.startOffset,
              endOffset: m.endOffset,
            });
          }
        }
      }

      if (identMatches.length === 0 && commentHits.length === 0 && stringHits.length === 0) continue;

      // ---- Build edits. Dedupe by offset range. ----
      const edits: { startOffset: number; endOffset: number; replacement: string }[] = [];
      const seenEdit = new Set<string>();
      const pushEdit = (startOffset: number, endOffset: number, replacement: string) => {
        const key = `${startOffset}:${endOffset}`;
        if (seenEdit.has(key)) return;
        seenEdit.add(key);
        edits.push({ startOffset, endOffset, replacement });
      };

      for (const m of identMatches) {
        const to = alternation.map.get(m.text);
        if (!to) continue;
        pushEdit(m.startOffset, m.endOffset, to);
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
        pushEdit(h.startOffset, h.endOffset, h.after);
        fileChanges.push({
          file: rel,
          layer: "symbols",
          kind: `${langName}:comment`,
          line: h.line,
          before: h.before,
          after: h.after,
        });
      }
      for (const h of stringHits) {
        pushEdit(h.startOffset, h.endOffset, h.after);
        fileChanges.push({
          file: rel,
          layer: "symbols",
          kind: `${langName}:string`,
          line: h.line,
          before: h.before,
          after: h.after,
        });
        result.warnings.push({
          code: "STRING_LITERAL_REWRITTEN",
          message: `Rewrote string literal '${h.before}' → '${h.after}' at ${rel}:${h.line}. Review to confirm this is not an incidental mention.`,
          file: rel,
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
