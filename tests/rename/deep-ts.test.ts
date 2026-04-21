import { describe, it } from "vitest";

/**
 * Covers design §3 Pass C (TS deep pass) + F8.
 *
 * F8 (`src/lib/rename/deep-ts.ts`) was intentionally deferred in wave 5 —
 * see F:/AI/dogfood-labs/swarms/swarm-1776672621-c975/wave-5/backend.summary.md:
 *
 *   > F8 (ts-morph deep pass) — not implemented. ast-grep symbols pass (F4)
 *   > already handles the 95% case for TypeScript … Scope of F1–F7 is a
 *   > complete shippable surface. F8 can be slotted as
 *   > `src/lib/rename/deep-ts.ts` with auto-enable on `tsconfig.json`
 *   > presence.
 *
 * `deepTs?: boolean` is already threaded through the input schema + plan
 * fingerprint, so promoting these `.todo()` entries to live tests is an
 * additive change once the module lands. Until then they stay todo with a
 * clear reason so the coordinator's build gate isn't polluted with failing
 * placeholders.
 */

describe("deep-ts pass (F8) — deferred, module not yet implemented", () => {
  it.todo("rewrites re-export specifier `export { Forkable } from './forkable'` (awaits F8: src/lib/rename/deep-ts.ts)");
  it.todo("rewrites the re-export *source filename* pointer so post-pass path move aligns (awaits F8)");
  it.todo("handles barrel files — index.ts that re-exports ./forkable (awaits F8)");
  it.todo("is auto-enabled when tsconfig.json + ts-morph resolve cleanly (awaits F8)");
  it.todo("is skipped when `deepTs: false` input flag is set (awaits F8)");
  it.todo("does NOT rename a shadowed local variable in an unrelated function (awaits F8)");
  it.todo("preserves all non-symbol TS content (types, generics) untouched (awaits F8)");
});
