/**
 * Casing variant engine.
 *
 * Given a canonical `from`/`to` pair, produce the full variant set that the
 * identity/symbols/textual passes need. All seven cases enumerated in the
 * design §3 Pass B table are emitted, even when two collapse to the same
 * string (e.g. all-lowercase `forkctl` kebab == snake). The engine
 * deduplicates downstream by the *from* string at match time.
 */

import {
  camelCase,
  kebabCase,
  noCase,
  pascalCase,
  snakeCase,
  capitalCase,
} from "change-case";
import type { VariantKey } from "../../schemas/rename.js";

export interface VariantEntry {
  from: string;
  to: string;
  enabled: boolean;
}

export type VariantSet = Record<VariantKey, VariantEntry>;

/**
 * Normalize an input name into a list of "tokens" (lowercased), handling
 * acronyms and already-cased inputs. `URLLoader` → ["url","loader"].
 * `forkctl-v2` → ["forkctl","v2"]. `FORKCTL` → ["forkctl"].
 */
function tokens(name: string): string[] {
  // change-case.noCase normalizes to space-separated lowercase words.
  return noCase(name).split(/\s+/).filter(Boolean);
}

function screamingSnake(name: string): string {
  return snakeCase(name).toUpperCase();
}

function dotCase(name: string): string {
  return tokens(name).join(".");
}

function titleCase(name: string): string {
  // `capitalCase` from change-case gives "Title Case" with spaces.
  return capitalCase(name);
}

/**
 * Build every variant-pair for a single (from, to). The returned object is
 * keyed by VariantKey and each entry has matched casings for both sides.
 */
export function buildVariantSet(from: string, to: string): VariantSet {
  const set: VariantSet = {
    "kebab-case": { from: kebabCase(from), to: kebabCase(to), enabled: true },
    snake_case: { from: snakeCase(from), to: snakeCase(to), enabled: true },
    camelCase: { from: camelCase(from), to: camelCase(to), enabled: true },
    PascalCase: { from: pascalCase(from), to: pascalCase(to), enabled: true },
    SCREAMING_SNAKE: {
      from: screamingSnake(from),
      to: screamingSnake(to),
      enabled: true,
    },
    "dot.case": { from: dotCase(from), to: dotCase(to), enabled: true },
    "Title Case": { from: titleCase(from), to: titleCase(to), enabled: true },
  };
  return set;
}

/**
 * Escape a string for safe embedding in a RegExp.
 */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a word-boundary regex that matches any enabled variant's `from`
 * value. Longest-first to prevent camelCase masking PascalCase matches.
 */
export function buildWordBoundaryRegex(variants: VariantSet): RegExp {
  const enabled = Object.values(variants).filter((v) => v.enabled);
  const froms = Array.from(new Set(enabled.map((v) => v.from)));
  froms.sort((a, b) => b.length - a.length);
  if (froms.length === 0) {
    // Never match anything.
    return /(?!)/g;
  }
  const body = froms.map(escapeRegex).join("|");
  return new RegExp(`\\b(${body})\\b`, "g");
}

/**
 * Look up the `to` value for a matched `from` value. Returns undefined if the
 * string isn't a known variant (defensive — a word-boundary regex built from
 * the same set is guaranteed to produce known matches).
 */
export function lookupReplacement(
  variants: VariantSet,
  fromMatch: string,
): string | undefined {
  for (const entry of Object.values(variants)) {
    if (entry.enabled && entry.from === fromMatch) return entry.to;
  }
  return undefined;
}

/**
 * Replace all variant occurrences in `text` using word boundaries. Returns
 * the rewritten string plus the list of (before,after) pairs observed.
 */
export function rewriteTextual(
  text: string,
  variants: VariantSet,
): { output: string; hits: { before: string; after: string; index: number }[] } {
  const re = buildWordBoundaryRegex(variants);
  const hits: { before: string; after: string; index: number }[] = [];
  const output = text.replace(re, (match, _g1, offset: number) => {
    const to = lookupReplacement(variants, match);
    if (to === undefined) return match;
    hits.push({ before: match, after: to, index: offset });
    return to;
  });
  return { output, hits };
}
