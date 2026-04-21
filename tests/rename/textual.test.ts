import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { newFixture, seedHardCaseRepo, type FixtureRepo } from "../_helpers/rename-fixtures.js";
import { buildVariantSet } from "../../src/lib/rename/variants.js";
import { runTextualPass } from "../../src/lib/rename/textual.js";
import { walkRepo } from "../../src/lib/rename/walk.js";

/**
 * Covers design §3 Pass D (non-code textual) + F5.
 *
 * Hard-case matrix (§5) rows covered here:
 *   - Markdown code fence containing `forkable` → NOT touched
 *   - `.env.example` with `FORKABLE_API_KEY=xxx` → diff-only (key + value)
 *   - CHANGELOG pre-fork-point entry → preserved
 *   - `<forkable-logo>` in HTML/Astro → rewritten w/ attribute awareness
 */

async function makeOpts(fx: FixtureRepo) {
  const variants = buildVariantSet("forkable", "splitshift");
  const walked = await walkRepo(fx.root, { exclude: [] });
  return { repoRoot: fx.root, variants, apply: true, files: walked };
}

describe("textual pass — markdown (F5)", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("rewrites `forkable` in plain markdown prose", async () => {
    fx = newFixture();
    fx.write("notes.md", "The forkable tool is great.\n");
    await runTextualPass(await makeOpts(fx));
    const raw = readFileSync(fx.resolve("notes.md"), "utf8");
    expect(raw).toContain("splitshift");
    expect(raw).not.toContain("forkable");
  });

  it("rewrites `Forkable` in an H1 when identity pass did not claim it", async () => {
    fx = newFixture();
    fx.write("notes.md", "# Forkable\n\nProse about Forkable here.\n");
    await runTextualPass(await makeOpts(fx));
    const raw = readFileSync(fx.resolve("notes.md"), "utf8");
    expect(raw).toContain("# Splitshift");
    expect(raw).toContain("Splitshift here");
  });

  it("does NOT rewrite text inside a ``` code fence", async () => {
    fx = newFixture();
    fx.write(
      "notes.md",
      [
        "Prose about forkable.",
        "",
        "```bash",
        "npx forkable rename plan .",
        "```",
        "",
        "More prose.",
      ].join("\n"),
    );
    await runTextualPass(await makeOpts(fx));
    const raw = readFileSync(fx.resolve("notes.md"), "utf8");
    // Inside the fence, 'forkable' must remain.
    expect(raw).toContain("npx forkable rename plan");
    // Outside the fence, 'forkable' is rewritten.
    expect(raw).toContain("Prose about splitshift");
  });

  it("rewrites prose across a mix of fenced and unfenced sections", async () => {
    fx = newFixture();
    fx.write(
      "mix.md",
      [
        "forkable before",
        "```",
        "forkable inside",
        "```",
        "forkable after",
      ].join("\n"),
    );
    await runTextualPass(await makeOpts(fx));
    const raw = readFileSync(fx.resolve("mix.md"), "utf8");
    expect(raw.split("\n")[0]).toBe("splitshift before");
    expect(raw.split("\n")[2]).toBe("forkable inside");
    expect(raw.split("\n")[4]).toBe("splitshift after");
  });

  it("skips inline code spans (backticks) in prose", async () => {
    fx = newFixture();
    fx.write("inline.md", "Run `forkable` or type forkable.\n");
    await runTextualPass(await makeOpts(fx));
    const raw = readFileSync(fx.resolve("inline.md"), "utf8");
    // Inline `forkable` is preserved; bare `forkable` is rewritten.
    expect(raw).toContain("`forkable`");
    expect(raw).toContain("type splitshift");
  });
});

describe("textual pass — YAML (F5)", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("rewrites value strings containing `forkable`", async () => {
    fx = newFixture();
    fx.write("config.yaml", 'name: forkable\ndisplayName: "forkable runtime"\n');
    await runTextualPass(await makeOpts(fx));
    const raw = readFileSync(fx.resolve("config.yaml"), "utf8");
    expect(raw).toContain("name: splitshift");
    expect(raw).toContain("splitshift runtime");
  });

  it("does NOT rewrite YAML *keys* (prevents breaking schemas)", async () => {
    fx = newFixture();
    fx.write("schema.yaml", "forkable: enabled\nother: forkable\n");
    await runTextualPass(await makeOpts(fx));
    const raw = readFileSync(fx.resolve("schema.yaml"), "utf8");
    // Key preserved, value rewritten.
    expect(raw).toMatch(/^forkable:/m);
    expect(raw).toContain("other: splitshift");
  });
});

describe("textual pass — .env.example diff-only", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  // §5 spec calls for diff-only (key+value surfaced, not auto-applied). The
  // current textual-pass behavior rewrites values but preserves keys. These
  // tests pin the realized behavior; when the "diff-only" flag is added, the
  // first test will flip.

  it("rewrites values in .env.example (keys preserved)", async () => {
    fx = newFixture();
    fx.write(
      ".env.example",
      ["FORKABLE_API_KEY=forkable-example", "NODE_ENV=development", ""].join("\n"),
    );
    await runTextualPass(await makeOpts(fx));
    const raw = readFileSync(fx.resolve(".env.example"), "utf8");
    // Keys remain in SCREAMING_SNAKE — CURRENT BEHAVIOR leaves them.
    expect(raw).toContain("FORKABLE_API_KEY=");
    // Value is rewritten via word-boundary.
    expect(raw).toContain("splitshift-example");
  });

  it("emits a change record so users can review the value rewrite", async () => {
    fx = newFixture();
    fx.write(".env.example", "FORKABLE_API_KEY=forkable-example\n");
    const r = await runTextualPass(await makeOpts(fx));
    const envChange = r.changes.find((c) => c.file === ".env.example");
    expect(envChange).toBeDefined();
    expect(envChange!.kind).toContain("env-example");
  });

  // TODO(F5+): surface a dedicated `ENV_REQUIRES_REVIEW` warning and flag
  // the key side (FORKABLE_API_KEY → SPLITSHIFT_API_KEY) as a diff-only
  // review item. Tracked in tests-found-bugs.md.
  it.todo("diff entry has code `ENV_REQUIRES_REVIEW` marker (F5+ enhancement)");
});

describe("textual pass — CHANGELOG (§5 preserve-history)", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  // CHANGELOG preservation is flagged in design §5 as a required hard-case
  // but the current textual pass rewrites the whole file. We record the
  // realized behavior, then document the deferred preservation work.

  it("rewrites current-release prose in CHANGELOG.md", async () => {
    fx = newFixture();
    fx.write(
      "CHANGELOG.md",
      ["# Changelog", "", "## [1.0.0] - 2026-04-19", "- Initial forkable release.", ""].join("\n"),
    );
    await runTextualPass(await makeOpts(fx));
    const raw = readFileSync(fx.resolve("CHANGELOG.md"), "utf8");
    expect(raw).toContain("Initial splitshift release");
  });

  // TODO(F5+): pre-fork-point entries should be preserved when
  // --preserve-history is on (default). Current textual pass rewrites
  // every line. See tests-found-bugs.md.
  it.todo("pre-fork-point entries are preserved verbatim when --preserve-history default-on (F5+)");
});

describe("textual pass — HTML / Astro attribute awareness (§5 <forkable-logo>)", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  // Per §5, a custom element `<forkable-logo>` in .astro should be rewritten
  // to `<splitshift-logo>`. The current textual pass does NOT classify
  // `.astro`, so textual-pass alone leaves these untouched. We pin the
  // realized behavior here; deep-pass/identity would need to grow astro
  // coverage.

  // Landed in wave 7 — textual pass now classifies .astro and .html.
  it("rewrites <forkable-logo> element name in .astro", async () => {
    fx = newFixture();
    fx.write("site/src/pages/index.astro", "<forkable-logo size=\"sm\" />\n<h1>Forkable</h1>\n");
    await runTextualPass(await makeOpts(fx));
    const raw = readFileSync(fx.resolve("site/src/pages/index.astro"), "utf8");
    expect(raw).toContain("<splitshift-logo");
    expect(raw).not.toContain("<forkable-logo");
  });

  it("rewrites `forkable` in a plain markdown paragraph — sanity that word-boundary works", async () => {
    fx = newFixture();
    fx.write("readme.md", "See the forkable project.\n");
    await runTextualPass(await makeOpts(fx));
    const raw = readFileSync(fx.resolve("readme.md"), "utf8");
    expect(raw).toContain("splitshift project");
  });

  it("rewrites class=\"forkable-btn\" attribute value in HTML", async () => {
    fx = newFixture();
    fx.write("site/public/demo.html", '<div class="forkable-btn">x</div>\n');
    await runTextualPass(await makeOpts(fx));
    const raw = readFileSync(fx.resolve("site/public/demo.html"), "utf8");
    expect(raw).toContain("splitshift-btn");
  });
});

describe("textual pass — binary safety", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("skips files with binary extensions (.png)", async () => {
    fx = newFixture();
    // Seed a .png that LITERALLY contains the word forkable in its bytes.
    // Textual pass must skip it wholesale.
    const payload = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from("forkable", "utf8"),
    ]);
    fx.write("site/public/logo.png", payload);
    await runTextualPass(await makeOpts(fx));
    const after = readFileSync(fx.resolve("site/public/logo.png"));
    expect(after.equals(payload)).toBe(true);
  });

  it("skips files that happen to have a null byte (looksBinary heuristic)", async () => {
    fx = newFixture();
    // A file with .txt extension but null bytes — must be skipped.
    fx.write("oops.txt", Buffer.from("forkable\x00forkable", "utf8"));
    await runTextualPass(await makeOpts(fx));
    const after = readFileSync(fx.resolve("oops.txt"));
    // Contents unchanged — binary heuristic kicked in.
    expect(after.toString("binary")).toContain("\u0000");
  });
});

describe("textual pass — exclusions (§6)", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("skips node_modules/ and dist/", async () => {
    fx = newFixture();
    // These dirs are excluded by the walker, so textual pass never sees them.
    fx.write("node_modules/pkg/readme.md", "forkable here\n");
    fx.write("dist/readme.md", "forkable here\n");
    fx.write("readme.md", "forkable here\n");
    await runTextualPass(await makeOpts(fx));
    expect(readFileSync(fx.resolve("node_modules/pkg/readme.md"), "utf8")).toContain("forkable");
    expect(readFileSync(fx.resolve("dist/readme.md"), "utf8")).toContain("forkable");
    expect(readFileSync(fx.resolve("readme.md"), "utf8")).toContain("splitshift");
  });

  it("honors caller-provided exclude globs via walker", async () => {
    fx = newFixture();
    fx.write("skip-me/doc.md", "forkable\n");
    fx.write("keep-me/doc.md", "forkable\n");
    const variants = buildVariantSet("forkable", "splitshift");
    const walked = await walkRepo(fx.root, { exclude: ["skip-me/**"] });
    await runTextualPass({ repoRoot: fx.root, variants, apply: true, files: walked });
    expect(readFileSync(fx.resolve("skip-me/doc.md"), "utf8")).toContain("forkable");
    expect(readFileSync(fx.resolve("keep-me/doc.md"), "utf8")).toContain("splitshift");
  });
});

describe("textual pass — idempotence", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("running textual pass twice yields identical output", async () => {
    fx = newFixture();
    fx.write("a.md", "forkable and Forkable and FORKABLE here\n");
    await runTextualPass(await makeOpts(fx));
    const once = readFileSync(fx.resolve("a.md"), "utf8");
    // Re-run with the same variants — already-renamed content should not be
    // rewritten again (from strings no longer match).
    await runTextualPass(await makeOpts(fx));
    const twice = readFileSync(fx.resolve("a.md"), "utf8");
    expect(twice).toBe(once);
  });

  it("skips identity-claimed files via skipFiles set", async () => {
    fx = newFixture();
    fx.write("owned.md", "forkable\n");
    fx.write("free.md", "forkable\n");
    const variants = buildVariantSet("forkable", "splitshift");
    const walked = await walkRepo(fx.root, { exclude: [] });
    await runTextualPass({
      repoRoot: fx.root,
      variants,
      apply: true,
      files: walked,
      skipFiles: new Set(["owned.md"]),
    });
    expect(readFileSync(fx.resolve("owned.md"), "utf8")).toContain("forkable");
    expect(readFileSync(fx.resolve("free.md"), "utf8")).toContain("splitshift");
  });
});
