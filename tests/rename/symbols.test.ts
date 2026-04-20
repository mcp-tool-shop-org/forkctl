import { describe, it } from "vitest";

/**
 * Covers design §3 Pass B (ast-grep symbols) + F4.
 *
 * Tests are `.todo()` until `src/lib/rename/symbols.ts` lands. The design
 * specifies the shape: it accepts a file path + variant set and returns a
 * `RenameChange[]` for identifiers, comments, and string literals.
 *
 * Hard-case matrix (§5) rows covered here:
 *   - `star` inside `starship` — NOT renamed (identifier kind + word boundary)
 *   - `Forkable` class name — renamed to PascalCase target
 *   - `"forkable"` in source-code comment — renamed (kind: comment)
 *   - `"forkable"` in source-code string literal — renamed, warning emitted
 *   - Partial matches `unforkable` / `forkableness` — NOT renamed
 */

describe("symbols pass — TypeScript (F4)", () => {
  it.todo("renames a class identifier (Forkable → Splitshift) via PascalCase rule");
  it.todo("renames a function declaration identifier");
  it.todo("renames a `const` binding identifier");
  it.todo("renames an interface identifier");
  it.todo("renames an import specifier (named import)");
  it.todo("renames default-export identifiers");
  it.todo("does NOT rename `star` inside `starship` (word boundary holds)");
  it.todo("does NOT rename `unforkable` or `forkableness` (partial match safety)");
});

describe("symbols pass — JavaScript (F4)", () => {
  it.todo("renames at least one identifier in a .js file");
});

describe("symbols pass — Python (F4)", () => {
  it.todo("renames a class identifier (Forkable → Splitshift)");
  it.todo("renames a function identifier");
});

describe("symbols pass — Rust (F4)", () => {
  it.todo("renames a pub struct identifier");
  it.todo("renames a pub fn identifier");
});

describe("symbols pass — Go (F4)", () => {
  it.todo("renames a top-level var identifier");
  it.todo("renames a function declaration identifier");
});

describe("symbols pass — comments (§9.2 default-on)", () => {
  it.todo("rewrites `forkable` inside a line comment");
  it.todo("rewrites `forkable` inside a block comment");
  it.todo("does NOT rewrite when --preserve-comments is set");
});

describe("symbols pass — source-code string literals (§9.3 default-on)", () => {
  it.todo("rewrites `\"forkable\"` inside a source-code string literal");
  it.todo("emits a warning for each string-literal rewrite (user can review)");
});

describe("symbols pass — partial-match safety", () => {
  it.todo("rule regex `^Forkable$` rejects `Forkableness`");
  it.todo("rule regex `^forkable$` rejects `unforkable`");
});
