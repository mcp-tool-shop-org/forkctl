import { describe, it } from "vitest";

/**
 * Covers design §3 Pass D (non-code textual) + F5.
 *
 * Hard-case matrix (§5) rows covered here:
 *   - Markdown code fence containing `forkable` → NOT touched
 *   - `.env.example` with `FORKABLE_API_KEY=xxx` → diff-only (key + value)
 *   - CHANGELOG pre-fork-point entry → preserved
 *   - `<forkable-logo>` in HTML/Astro → rewritten w/ attribute awareness
 *
 * Deferred until `src/lib/rename/textual.ts` lands. Fixtures already live in
 * `seedHardCaseRepo` and can be promoted from todos to real assertions.
 */

describe("textual pass — markdown (F5)", () => {
  it.todo("rewrites `forkable` in plain markdown prose");
  it.todo("rewrites `Forkable` in an H1 when identity pass did not claim it");
  it.todo("does NOT rewrite text inside a ``` code fence");
  it.todo("does NOT rewrite text inside an indented code block");
  it.todo("rewrites inline backticks only when configured (default: skip)");
});

describe("textual pass — YAML (F5)", () => {
  it.todo("rewrites value strings containing `forkable`");
  it.todo("does NOT rewrite YAML *keys* (prevents breaking schemas)");
  it.todo("leaves anchor references and tags untouched");
});

describe("textual pass — .env* diff-only", () => {
  it.todo("emits `.env.example` key `FORKABLE_API_KEY` as a diff entry, NOT auto-applied");
  it.todo("emits the value side too (user sees `xxx` → `xxx` placeholder)");
  it.todo("diff entry has code `ENV_REQUIRES_REVIEW` or equivalent marker");
});

describe("textual pass — CHANGELOG (§5 preserve-history)", () => {
  it.todo("entries dated before fork point are preserved verbatim");
  it.todo("current-release entries have `forkable` rewritten");
  it.todo("--preserve-history is default-on");
});

describe("textual pass — HTML / Astro attribute awareness (§5 <forkable-logo>)", () => {
  it.todo("rewrites a custom element name <forkable-logo>");
  it.todo("rewrites a `class=\"forkable-btn\"` attribute value");
  it.todo("does NOT rewrite tokens that happen to contain the word in a URL path");
});

describe("textual pass — binary safety", () => {
  it.todo("skips files detected as binary by null-byte sniff");
  it.todo("skips files with binary extensions (.png, .ttf, .wasm, etc.)");
});

describe("textual pass — exclusions (§6)", () => {
  it.todo("skips .git/, node_modules/, dist/, build/, .next/, .astro/, target/");
  it.todo("honors caller-provided exclude globs");
});

describe("textual pass — idempotence", () => {
  it.todo("running textual pass twice on the same file yields identical output on the 2nd run");
});
