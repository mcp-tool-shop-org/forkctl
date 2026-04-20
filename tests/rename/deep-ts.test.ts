import { describe, it } from "vitest";

/**
 * Covers design §3 Pass C (TS deep pass) + F8.
 *
 * TS deep pass uses `ts-morph` for scope-aware rename — re-exports, barrels,
 * shadowing edge cases. Auto-enabled when `tsconfig.json` + `ts-morph`
 * resolve cleanly. Explicit `--no-deep-ts` opts out.
 *
 * Deferred until `src/lib/rename/deep-ts.ts` lands. These todos document
 * intent from §3 Pass C + §5 re-export row.
 */

describe("deep-ts pass (F8)", () => {
  it.todo("rewrites re-export specifier `export { Forkable } from './forkable'`");
  it.todo("rewrites the re-export *source filename* pointer so post-pass path move aligns");
  it.todo("handles barrel files — index.ts that re-exports ./forkable");
  it.todo("is auto-enabled when tsconfig.json + ts-morph resolve cleanly");
  it.todo("is skipped when `deepTs: false` input flag is set");
  it.todo("does NOT rename a shadowed local variable in an unrelated function");
  it.todo("preserves all non-symbol TS content (types, generics) untouched");
});
