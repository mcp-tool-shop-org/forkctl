import { afterEach, describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { newFixture, seedHardCaseRepo, type FixtureRepo } from "../_helpers/rename-fixtures.js";

/**
 * Covers design §3 Pass A + F3 (identity manifest editors).
 *
 * These tests document the intended behavior for each identity-editor module.
 * Per the swarm rules we don't `await import` speculative paths — the tests
 * live here as `.todo()` placeholders so the backend agent can replace each
 * with a real assertion once the corresponding module lands. The fixture
 * seed is correct regardless of module name.
 *
 * Module layout (per design §3 Pass A + F3):
 *   src/lib/rename/identity/package-json.ts
 *   src/lib/rename/identity/cargo-toml.ts
 *   src/lib/rename/identity/pyproject-toml.ts
 *   src/lib/rename/identity/go-mod.ts
 *   src/lib/rename/identity/readme.ts
 *   src/lib/rename/identity/license.ts
 *   src/lib/rename/identity/index.ts (barrel + dispatcher)
 */

describe("identity pass — fixture seeding sanity", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("hard-case fixture contains every identity target file", () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    expect(existsSync(fx.resolve("package.json"))).toBe(true);
    expect(existsSync(fx.resolve("Cargo.toml"))).toBe(true);
    expect(existsSync(fx.resolve("pyproject.toml"))).toBe(true);
    expect(existsSync(fx.resolve("go.mod"))).toBe(true);
    expect(existsSync(fx.resolve("README.md"))).toBe(true);
    expect(existsSync(fx.resolve("LICENSE"))).toBe(true);
    expect(existsSync(fx.resolve(".github/workflows/ci.yml"))).toBe(true);
    expect(existsSync(fx.resolve("site/public/favicon.png"))).toBe(true);
    expect(existsSync(fx.resolve("package-lock.json"))).toBe(true);
  });

  it("favicon.png has a valid PNG header in the fixture", () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    const bytes = readFileSync(fx.resolve("site/public/favicon.png"));
    expect(bytes.slice(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });
});

describe("identity pass — package.json (F3)", () => {
  it.todo("rewrites name to the new canonical value");
  it.todo("rewrites bin keys while preserving values");
  it.todo("rewrites repository.url");
  it.todo("rewrites homepage");
  it.todo("rewrites bugs.url");
  it.todo("does NOT touch description, version, or dependencies");
  it.todo("is idempotent — applying twice yields identical output");
});

describe("identity pass — Cargo.toml (F3)", () => {
  it.todo("rewrites [package].name");
  it.todo("rewrites [[bin]].name and [lib].name");
  it.todo("rewrites repository / homepage URL fields");
  it.todo("does NOT rewrite [dependencies] values");
});

describe("identity pass — pyproject.toml (F3)", () => {
  it.todo("rewrites [project].name");
  it.todo("rewrites [tool.poetry].name");
});

describe("identity pass — go.mod (F3)", () => {
  it.todo("rewrites only the module line, preserving go version");
});

describe("identity pass — README.md (F3)", () => {
  it.todo("rewrites the H1 title");
  it.todo("leaves prose hits to the textual pass (bounded scope)");
});

describe("identity pass — LICENSE (F3)", () => {
  it.todo("rewrites the copyright-holder line when it matches `from`");
  it.todo("does not rewrite LICENSE body text unrelated to the holder");
});

describe("identity pass — binary assets (never modified)", () => {
  it.todo("favicon.png bytes are unchanged after an identity run");
  it.todo("og-image.png bytes are unchanged after an identity run");
  it.todo("both are listed in the asset-regen manifest");
});
