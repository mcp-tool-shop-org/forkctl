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

describe("symbols pass — Python (Phase 5 polyglot)", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("renames a Python class identifier via @ast-grep/lang-python", async () => {
    fx = newFixture();
    fx.write("src/a.py", "class Forkable:\n    pass\n");
    const r = await runSymbolsPass(await makeOpts(fx));
    if (!r.available) return;
    // Optional dep — if @ast-grep/lang-python isn't installed, the lang falls
    // through to RENAME_LANG_UNAVAILABLE. Only assert the rename when the
    // package resolved.
    const raw = readFileSync(fx.resolve("src/a.py"), "utf8");
    if (raw.includes("Splitshift")) {
      expect(raw).toContain("class Splitshift");
    } else {
      const codes = (r.warnings ?? []).map((w) => w.code);
      expect(codes).toContain("RENAME_LANG_UNAVAILABLE");
    }
  });

  it("renames a Python function identifier", async () => {
    fx = newFixture();
    fx.write("src/b.py", "def forkable():\n    return 1\n");
    const r = await runSymbolsPass(await makeOpts(fx));
    if (!r.available) return;
    const raw = readFileSync(fx.resolve("src/b.py"), "utf8");
    if (raw.includes("splitshift")) {
      expect(raw).toContain("def splitshift");
    } else {
      const codes = (r.warnings ?? []).map((w) => w.code);
      expect(codes).toContain("RENAME_LANG_UNAVAILABLE");
    }
  });
});

describe("symbols pass — Rust (Phase 5 polyglot)", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("renames a Rust pub struct identifier via @ast-grep/lang-rust", async () => {
    fx = newFixture();
    fx.write("src/a.rs", "pub struct Forkable {}\n");
    const r = await runSymbolsPass(await makeOpts(fx));
    if (!r.available) return;
    const raw = readFileSync(fx.resolve("src/a.rs"), "utf8");
    if (raw.includes("Splitshift")) {
      expect(raw).toContain("struct Splitshift");
    } else {
      const codes = (r.warnings ?? []).map((w) => w.code);
      expect(codes).toContain("RENAME_LANG_UNAVAILABLE");
    }
  });

  it("renames a Rust pub fn identifier", async () => {
    fx = newFixture();
    fx.write("src/b.rs", "pub fn forkable() -> i32 { 1 }\n");
    const r = await runSymbolsPass(await makeOpts(fx));
    if (!r.available) return;
    const raw = readFileSync(fx.resolve("src/b.rs"), "utf8");
    if (raw.includes("splitshift")) {
      expect(raw).toContain("fn splitshift");
    } else {
      const codes = (r.warnings ?? []).map((w) => w.code);
      expect(codes).toContain("RENAME_LANG_UNAVAILABLE");
    }
  });
});

describe("symbols pass — Go (Phase 5 polyglot)", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("renames a Go top-level var identifier via @ast-grep/lang-go", async () => {
    fx = newFixture();
    fx.write("src/a.go", "package main\n\nvar forkable = 1\n");
    const r = await runSymbolsPass(await makeOpts(fx));
    if (!r.available) return;
    const raw = readFileSync(fx.resolve("src/a.go"), "utf8");
    if (raw.includes("splitshift")) {
      expect(raw).toContain("var splitshift");
    } else {
      const codes = (r.warnings ?? []).map((w) => w.code);
      expect(codes).toContain("RENAME_LANG_UNAVAILABLE");
    }
  });

  it("renames a Go function declaration identifier", async () => {
    fx = newFixture();
    fx.write("src/b.go", "package main\n\nfunc forkable() int { return 1 }\n");
    const r = await runSymbolsPass(await makeOpts(fx));
    if (!r.available) return;
    const raw = readFileSync(fx.resolve("src/b.go"), "utf8");
    if (raw.includes("splitshift")) {
      expect(raw).toContain("func splitshift");
    } else {
      const codes = (r.warnings ?? []).map((w) => w.code);
      expect(codes).toContain("RENAME_LANG_UNAVAILABLE");
    }
  });
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

  it("rewrites snake_case tool-name string literal (forkable_assess → splitshift_assess)", async () => {
    fx = newFixture();
    fx.write("src/reg.ts", 'export const tools = ["forkable_assess", "forkable_plan"];\n');
    const r = await runSymbolsPass(await makeOpts(fx));
    if (!r.available) return;
    const raw = readFileSync(fx.resolve("src/reg.ts"), "utf8");
    expect(raw).toContain('"splitshift_assess"');
    expect(raw).toContain('"splitshift_plan"');
    expect(raw).not.toContain("forkable_");
  });

  it("rewrites PascalCase compound inside prose string (throws ForkableError)", async () => {
    fx = newFixture();
    fx.write("src/p.ts", 'const msg = "throws ForkableError when branch exists";\n');
    const r = await runSymbolsPass(await makeOpts(fx));
    if (!r.available) return;
    const raw = readFileSync(fx.resolve("src/p.ts"), "utf8");
    expect(raw).toContain("SplitshiftError");
    expect(raw).not.toContain("ForkableError");
  });

  it("rewrites markdown-header-style literal (# forkable rename plan diff)", async () => {
    fx = newFixture();
    fx.write("src/h.ts", 'const header = `# forkable rename plan diff`;\n');
    const r = await runSymbolsPass(await makeOpts(fx));
    if (!r.available) return;
    const raw = readFileSync(fx.resolve("src/h.ts"), "utf8");
    expect(raw).toContain("# splitshift rename plan diff");
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

describe("symbols pass — compound-identifier rewrite (prefix + mid-camelCase)", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("renames class `ForkableError` → `SplitshiftError` (PascalCase-prefix compound)", async () => {
    fx = newFixture();
    fx.write("src/err.ts", "export class ForkableError extends Error {}\n");
    const r = await runSymbolsPass(await makeOpts(fx));
    if (!r.available) return;
    const raw = readFileSync(fx.resolve("src/err.ts"), "utf8");
    expect(raw).toContain("class SplitshiftError");
    expect(raw).not.toContain("ForkableError");
  });

  it("renames enum `ForkableErrorCode` → `SplitshiftErrorCode` (nested PascalCase compound)", async () => {
    fx = newFixture();
    fx.write("src/codes.ts", "export enum ForkableErrorCode { X = 'x' }\n");
    const r = await runSymbolsPass(await makeOpts(fx));
    if (!r.available) return;
    const raw = readFileSync(fx.resolve("src/codes.ts"), "utf8");
    expect(raw).toContain("enum SplitshiftErrorCode");
    expect(raw).not.toContain("ForkableErrorCode");
  });

  it("renames function `makeForkableTool` → `makeSplitshiftTool` (mid-camelCase)", async () => {
    fx = newFixture();
    fx.write("src/mk.ts", "export function makeForkableTool() {}\nmakeForkableTool();\n");
    const r = await runSymbolsPass(await makeOpts(fx));
    if (!r.available) return;
    const raw = readFileSync(fx.resolve("src/mk.ts"), "utf8");
    expect(raw).toContain("function makeSplitshiftTool");
    expect(raw).toContain("makeSplitshiftTool();");
  });

  it("renames SCREAMING_SNAKE env constant `FORKABLE_LOG` → `SPLITSHIFT_LOG`", async () => {
    fx = newFixture();
    fx.write("src/env.ts", "export const FORKABLE_LOG = 'debug';\nconst x = FORKABLE_LOG;\n");
    const r = await runSymbolsPass(await makeOpts(fx));
    if (!r.available) return;
    const raw = readFileSync(fx.resolve("src/env.ts"), "utf8");
    expect(raw).toContain("const SPLITSHIFT_LOG = 'debug'");
    expect(raw).toContain("const x = SPLITSHIFT_LOG");
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

describe("symbols pass — stringsMode gate (Phase 4)", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("stringsMode=off skips string-literal rewrites entirely (identifiers still rename)", async () => {
    fx = newFixture();
    fx.write("src/s.ts", 'const forkable = 1;\nconst msg = "forkable_assess";\n');
    const opts = await makeOpts(fx);
    const r = await runSymbolsPass({ ...opts, stringsMode: "off" });
    if (!r.available) return;
    const raw = readFileSync(fx.resolve("src/s.ts"), "utf8");
    expect(raw).toContain("const splitshift = 1"); // identifier renamed
    expect(raw).toContain('"forkable_assess"'); // string literal NOT rewritten
  });

  it("stringsMode=review emits STRING_REWRITE_PENDING_REVIEW warnings (not STRING_LITERAL_REWRITTEN)", async () => {
    fx = newFixture();
    fx.write("src/s.ts", 'const msg = "forkable_assess";\n');
    const opts = await makeOpts(fx);
    const r = await runSymbolsPass({ ...opts, stringsMode: "review" });
    if (!r.available) return;
    const codes = (r.warnings ?? []).map((w) => w.code);
    expect(codes).toContain("STRING_REWRITE_PENDING_REVIEW");
    expect(codes).not.toContain("STRING_LITERAL_REWRITTEN");
  });

  it("stringsMode=all keeps v1.1.0 STRING_LITERAL_REWRITTEN warning code", async () => {
    fx = newFixture();
    fx.write("src/s.ts", 'const msg = "forkable_assess";\n');
    const opts = await makeOpts(fx);
    const r = await runSymbolsPass({ ...opts, stringsMode: "all" });
    if (!r.available) return;
    const codes = (r.warnings ?? []).map((w) => w.code);
    expect(codes).toContain("STRING_LITERAL_REWRITTEN");
    expect(codes).not.toContain("STRING_REWRITE_PENDING_REVIEW");
  });

  it("default (undefined stringsMode) behaves as 'all' for v1.1.0 compatibility", async () => {
    fx = newFixture();
    fx.write("src/s.ts", 'const msg = "forkable_assess";\n');
    const opts = await makeOpts(fx);
    const r = await runSymbolsPass(opts);
    if (!r.available) return;
    const codes = (r.warnings ?? []).map((w) => w.code);
    expect(codes).toContain("STRING_LITERAL_REWRITTEN");
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
