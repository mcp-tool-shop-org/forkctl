import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { newFixture, type FixtureRepo } from "../_helpers/rename-fixtures.js";
import { buildVariantSet } from "../../src/lib/rename/variants.js";
import { runSymbolsPass } from "../../src/lib/rename/symbols.js";
import { buildLanguageManifest, walkRepo } from "../../src/lib/rename/walk.js";

/**
 * Covers design §3 Pass B (ast-grep symbols) + F4.
 *
 * Realities exposed by `@ast-grep/napi` v0.42.1:
 *   - Only JavaScript, TypeScript, Tsx, Html, Css languages ship in the
 *     default napi bindings — Python/Rust/Go/Java/Ruby/Php/CSharp/C/Cpp all
 *     fail with a StringExpected error at parse time. Those languages are
 *     silently skipped by resolveLang(), so the symbols pass is a no-op for
 *     them. Tests for those languages are kept as `.todo()` with a comment
 *     pointing at the bug note.
 *   - In TypeScript tree-sitter, `class Forkable` and `interface IForkable`
 *     emit `type_identifier` kind, not `identifier`. The current
 *     `rule.kind: 'identifier'` configuration misses class/interface names
 *     entirely. That's a live bug — see tests-found-bugs.md.
 *
 * What the current symbols pass DOES cover (the green path):
 *   - JS/TS `const` and `function` declarations (kind: identifier)
 *   - JS/TS import specifiers (kind: identifier)
 *   - Source-code comments (kind: comment) when preserveComments=false
 *   - Word-boundary semantics via the regex alternation
 */

async function makeOpts(fx: FixtureRepo, preserveComments = false) {
  const variants = buildVariantSet("forkable", "splitshift");
  const walked = await walkRepo(fx.root, { exclude: [] });
  const langMan = buildLanguageManifest(walked);
  return {
    repoRoot: fx.root,
    variants,
    apply: true,
    preserveComments,
    files: walked,
    byLanguage: langMan.byLanguage,
  };
}

describe("symbols pass — TypeScript (F4)", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("renames a function declaration identifier (forkable-init → splitshift-init)", async () => {
    fx = newFixture();
    fx.write("src/a.ts", "function forkable() { return 1; }\nforkable();\n");
    const r = await runSymbolsPass(await makeOpts(fx));
    if (!r.available) {
      // ast-grep not available — skip assertion content; the unavailable path
      // is pinned in a dedicated test below.
      return;
    }
    const raw = readFileSync(fx.resolve("src/a.ts"), "utf8");
    expect(raw).toContain("function splitshift()");
    expect(raw).toContain("splitshift();");
  });

  it("renames a `const` binding identifier", async () => {
    fx = newFixture();
    fx.write("src/b.ts", "const forkable = 42;\nexport { forkable };\n");
    const r = await runSymbolsPass(await makeOpts(fx));
    if (!r.available) return;
    const raw = readFileSync(fx.resolve("src/b.ts"), "utf8");
    expect(raw).toContain("const splitshift = 42");
  });

  it("renames an import specifier (named import)", async () => {
    fx = newFixture();
    fx.write("src/c.ts", "import { forkable } from './lib';\nforkable();\n");
    const r = await runSymbolsPass(await makeOpts(fx));
    if (!r.available) return;
    const raw = readFileSync(fx.resolve("src/c.ts"), "utf8");
    expect(raw).toContain("{ splitshift }");
  });

  it("does NOT rename `starship` (word boundary holds)", async () => {
    fx = newFixture();
    fx.write("src/d.ts", "const starship = 1;\nconst unforkable = 2;\nconst forkableness = 3;\nconst forkable = 4;\n");
    const r = await runSymbolsPass(await makeOpts(fx));
    if (!r.available) return;
    const raw = readFileSync(fx.resolve("src/d.ts"), "utf8");
    expect(raw).toContain("const starship = 1");
    expect(raw).toContain("const unforkable = 2");
    expect(raw).toContain("const forkableness = 3");
    expect(raw).toContain("const splitshift = 4");
  });

  // KNOWN BUG — class/interface names are `type_identifier` in tree-sitter TS.
  // Current symbols.ts only matches `kind: identifier` and misses them.
  // See tests-found-bugs.md row "TS class identifier unmatched".
  it("renames a class identifier (Forkable → Splitshift) via type_identifier (EXPECTED FAIL — backend bug)", async () => {
    fx = newFixture();
    fx.write("src/e.ts", "export class Forkable {}\n");
    const r = await runSymbolsPass(await makeOpts(fx));
    if (!r.available) return;
    const raw = readFileSync(fx.resolve("src/e.ts"), "utf8");
    // This is what the spec requires — when backend is fixed, this passes.
    expect(raw).toContain("class Splitshift");
  });

  it("renames an interface identifier via type_identifier (EXPECTED FAIL — backend bug)", async () => {
    fx = newFixture();
    fx.write("src/f.ts", "export interface Forkable { id: string; }\n");
    const r = await runSymbolsPass(await makeOpts(fx));
    if (!r.available) return;
    const raw = readFileSync(fx.resolve("src/f.ts"), "utf8");
    expect(raw).toContain("interface Splitshift");
  });
});

describe("symbols pass — JavaScript (F4)", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("renames at least one identifier in a .js file", async () => {
    fx = newFixture();
    fx.write("scripts/a.js", "const forkable = 'hello';\nconsole.log(forkable);\n");
    const r = await runSymbolsPass(await makeOpts(fx));
    if (!r.available) return;
    const raw = readFileSync(fx.resolve("scripts/a.js"), "utf8");
    expect(raw).toContain("const splitshift = 'hello'");
    expect(raw).toContain("console.log(splitshift)");
  });
});

describe("symbols pass — Python (F4) — deferred: language not in napi", () => {
  // @ast-grep/napi default build only ships JS/TS/Tsx/Html/Css. Python parse
  // throws StringExpected because m.Lang.Python is undefined. The resolveLang
  // helper silently returns undefined and the file is skipped. Keep these as
  // todos until we ship a napi build with tree-sitter-python (or drop the
  // python rename claim from the v1.1 design).
  it.todo("renames a Python class identifier (awaits napi python bindings)");
  it.todo("renames a Python function identifier (awaits napi python bindings)");
});

describe("symbols pass — Rust (F4) — deferred: language not in napi", () => {
  it.todo("renames a pub struct identifier (awaits napi rust bindings)");
  it.todo("renames a pub fn identifier (awaits napi rust bindings)");
});

describe("symbols pass — Go (F4) — deferred: language not in napi", () => {
  it.todo("renames a top-level var identifier (awaits napi go bindings)");
  it.todo("renames a function declaration identifier (awaits napi go bindings)");
});

describe("symbols pass — comments (§9.2 default-on)", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("rewrites `forkable` inside a line comment", async () => {
    fx = newFixture();
    fx.write("src/c1.ts", "// a forkable line comment\nconst x = 1;\n");
    const r = await runSymbolsPass(await makeOpts(fx, false));
    if (!r.available) return;
    const raw = readFileSync(fx.resolve("src/c1.ts"), "utf8");
    expect(raw).toContain("// a splitshift line comment");
  });

  it("rewrites `forkable` inside a block comment", async () => {
    fx = newFixture();
    fx.write("src/c2.ts", "/* forkable block */\nconst x = 1;\n");
    const r = await runSymbolsPass(await makeOpts(fx, false));
    if (!r.available) return;
    const raw = readFileSync(fx.resolve("src/c2.ts"), "utf8");
    expect(raw).toContain("splitshift block");
  });

  it("does NOT rewrite comments when preserveComments=true", async () => {
    fx = newFixture();
    fx.write("src/c3.ts", "// a forkable line comment\nconst forkable = 1;\n");
    const r = await runSymbolsPass(await makeOpts(fx, true));
    if (!r.available) return;
    const raw = readFileSync(fx.resolve("src/c3.ts"), "utf8");
    expect(raw).toContain("// a forkable line comment");
    // but the identifier is still renamed.
    expect(raw).toContain("const splitshift = 1");
  });
});

describe("symbols pass — source-code string literals (§9.3 default-on)", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  // Design §5: string literals in source code default to REWRITE + warning.
  // Current symbols.ts does NOT handle string literals — only identifier and
  // comment kinds. That's a live gap. tests-found-bugs.md records it.
  // Design §9.3: string literals in source code default to REWRITE + warning.
  // Landed in wave 7 (symbols.ts string-fragment matcher).
  it("rewrites `\"forkable\"` inside a source-code string literal", async () => {
    fx = newFixture();
    fx.write("src/s1.ts", 'const name = "forkable";\n');
    const r = await runSymbolsPass(await makeOpts(fx));
    if (!r.available) return;
    const raw = readFileSync(fx.resolve("src/s1.ts"), "utf8");
    expect(raw).toContain('"splitshift"');
    expect(raw).not.toContain('"forkable"');
  });

  it("emits a STRING_LITERAL_REWRITTEN warning for each string-literal rewrite", async () => {
    fx = newFixture();
    fx.write("src/s1.ts", 'const name = "forkable";\nconst kind = "not-related";\n');
    const r = await runSymbolsPass(await makeOpts(fx));
    if (!r.available) return;
    const codes = (r.warnings ?? []).map((w) => w.code);
    expect(codes).toContain("STRING_LITERAL_REWRITTEN");
  });
});

describe("symbols pass — partial-match safety", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("regex `^Forkable$` rejects `Forkableness` identifier (word boundary via regex anchor)", async () => {
    fx = newFixture();
    fx.write("src/p1.ts", "const Forkableness = 1;\nconst unforkable = 2;\n");
    const r = await runSymbolsPass(await makeOpts(fx));
    if (!r.available) return;
    const raw = readFileSync(fx.resolve("src/p1.ts"), "utf8");
    expect(raw).toContain("const Forkableness = 1");
    expect(raw).toContain("const unforkable = 2");
  });
});

describe("symbols pass — availability contract", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("returns a SymbolsPassResult shape whether or not ast-grep is resolvable", async () => {
    fx = newFixture();
    fx.write("src/x.ts", "const forkable = 1;\n");
    const r = await runSymbolsPass(await makeOpts(fx));
    expect(r).toHaveProperty("changes");
    expect(r).toHaveProperty("filesChanged");
    expect(r).toHaveProperty("byLanguage");
    expect(r).toHaveProperty("available");
    expect(typeof r.available).toBe("boolean");
  });

  it("when ast-grep is available, records renamed files in filesChanged", async () => {
    fx = newFixture();
    fx.write("src/y.ts", "const forkable = 1;\nexport { forkable };\n");
    const r = await runSymbolsPass(await makeOpts(fx));
    if (!r.available) return;
    expect(r.filesChanged.has("src/y.ts")).toBe(true);
    expect(r.byLanguage.TypeScript).toBeGreaterThanOrEqual(1);
  });
});
