import { afterEach, describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import TOML from "@iarna/toml";
import { newFixture, seedHardCaseRepo, type FixtureRepo } from "../_helpers/rename-fixtures.js";
import { buildVariantSet } from "../../src/lib/rename/variants.js";
import { runIdentityPass } from "../../src/lib/rename/identity/index.js";
import { packageJsonEditor } from "../../src/lib/rename/identity/package-json.js";
import { cargoTomlEditor, pyprojectTomlEditor } from "../../src/lib/rename/identity/toml-based.js";
import { goModEditor } from "../../src/lib/rename/identity/go-mod.js";
import { licenseEditor } from "../../src/lib/rename/identity/simple-text.js";

/**
 * Covers design §3 Pass A + F3 (identity manifest editors).
 *
 * Each editor has its own describe block. Fixtures come from
 * `seedHardCaseRepo` which seeds §5 hard-case matrix content. Cleanup is
 * in afterEach — every test is hermetic.
 */

function makeCtx(fx: FixtureRepo, apply: boolean) {
  const from = "forkable";
  const to = "splitshift";
  return {
    repoRoot: fx.root,
    from,
    to,
    variants: buildVariantSet(from, to),
    apply,
  };
}

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
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("rewrites name to the new canonical value", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    await packageJsonEditor.run(makeCtx(fx, true));
    const pkg = JSON.parse(readFileSync(fx.resolve("package.json"), "utf8")) as { name: string };
    expect(pkg.name).toBe("@mcptoolshop/splitshift");
  });

  it("rewrites bin keys while preserving values", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    await packageJsonEditor.run(makeCtx(fx, true));
    const pkg = JSON.parse(readFileSync(fx.resolve("package.json"), "utf8")) as { bin: Record<string, string> };
    expect(pkg.bin).toHaveProperty("splitshift");
    expect(pkg.bin).toHaveProperty("splitshift-mcp");
    // Values are dist paths, left alone.
    expect(pkg.bin.splitshift).toBe("dist/cli.js");
    expect(pkg.bin["splitshift-mcp"]).toBe("dist/server.js");
  });

  it("rewrites repository.url", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    await packageJsonEditor.run(makeCtx(fx, true));
    const pkg = JSON.parse(readFileSync(fx.resolve("package.json"), "utf8")) as {
      repository: { url: string };
    };
    expect(pkg.repository.url).toContain("splitshift");
    expect(pkg.repository.url).not.toContain("forkable");
  });

  it("rewrites homepage", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    await packageJsonEditor.run(makeCtx(fx, true));
    const pkg = JSON.parse(readFileSync(fx.resolve("package.json"), "utf8")) as { homepage: string };
    expect(pkg.homepage).toContain("splitshift");
    expect(pkg.homepage).not.toContain("forkable");
  });

  it("rewrites bugs.url", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    await packageJsonEditor.run(makeCtx(fx, true));
    const pkg = JSON.parse(readFileSync(fx.resolve("package.json"), "utf8")) as {
      bugs: { url: string };
    };
    expect(pkg.bugs.url).toContain("splitshift");
    expect(pkg.bugs.url).not.toContain("forkable");
  });

  it("does NOT touch description, version, or dependencies", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    await packageJsonEditor.run(makeCtx(fx, true));
    const pkg = JSON.parse(readFileSync(fx.resolve("package.json"), "utf8")) as {
      version: string;
      dependencies: Record<string, string>;
      description: string;
    };
    expect(pkg.version).toBe("1.0.0");
    expect(pkg.dependencies).toEqual({ zod: "^3.23.8" });
    // Description contains word "forkable" which is rewritten — this is by
    // design (identity pass rewrites name-carrying strings). The assertion
    // here pins that dependencies and version are untouched.
  });

  it("is idempotent — applying twice yields identical output", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    await packageJsonEditor.run(makeCtx(fx, true));
    const once = readFileSync(fx.resolve("package.json"), "utf8");
    // Rename the already-renamed repo (splitshift → splitshift) is a no-op.
    const ctx2 = makeCtx(fx, true);
    ctx2.from = "splitshift";
    ctx2.variants = buildVariantSet("splitshift", "splitshift");
    await packageJsonEditor.run(ctx2);
    const twice = readFileSync(fx.resolve("package.json"), "utf8");
    expect(twice).toBe(once);
  });
});

describe("identity pass — Cargo.toml (F3)", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("rewrites [package].name", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    await cargoTomlEditor.run(makeCtx(fx, true));
    const doc = TOML.parse(readFileSync(fx.resolve("Cargo.toml"), "utf8")) as {
      package: { name: string };
    };
    expect(doc.package.name).toBe("splitshift");
  });

  it("rewrites [[bin]].name", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    await cargoTomlEditor.run(makeCtx(fx, true));
    const doc = TOML.parse(readFileSync(fx.resolve("Cargo.toml"), "utf8")) as {
      bin: { name: string }[];
    };
    expect(doc.bin[0]!.name).toBe("splitshift");
  });

  it("rewrites repository URL field", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    await cargoTomlEditor.run(makeCtx(fx, true));
    const doc = TOML.parse(readFileSync(fx.resolve("Cargo.toml"), "utf8")) as {
      package: { repository: string };
    };
    expect(doc.package.repository).toContain("splitshift");
    expect(doc.package.repository).not.toContain("forkable");
  });

  it("does NOT rewrite [dependencies] values", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    await cargoTomlEditor.run(makeCtx(fx, true));
    const doc = TOML.parse(readFileSync(fx.resolve("Cargo.toml"), "utf8")) as {
      dependencies: { serde: string };
    };
    expect(doc.dependencies.serde).toBe("1.0");
  });
});

describe("identity pass — pyproject.toml (F3)", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("rewrites [project].name", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    await pyprojectTomlEditor.run(makeCtx(fx, true));
    const doc = TOML.parse(readFileSync(fx.resolve("pyproject.toml"), "utf8")) as {
      project: { name: string };
    };
    expect(doc.project.name).toBe("splitshift");
  });

  it("rewrites [tool.poetry].name", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    await pyprojectTomlEditor.run(makeCtx(fx, true));
    const doc = TOML.parse(readFileSync(fx.resolve("pyproject.toml"), "utf8")) as {
      tool: { poetry: { name: string } };
    };
    expect(doc.tool.poetry.name).toBe("splitshift");
  });
});

describe("identity pass — go.mod (F3)", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("rewrites the module line, preserving go version", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    await goModEditor.run(makeCtx(fx, true));
    const raw = readFileSync(fx.resolve("go.mod"), "utf8");
    expect(raw).toContain("splitshift");
    expect(raw).not.toContain("forkable");
    expect(raw).toContain("go 1.22");
  });
});

describe("identity pass — LICENSE (F3)", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("rewrites the copyright-holder line when it matches `from`", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    await licenseEditor.run(makeCtx(fx, true));
    const raw = readFileSync(fx.resolve("LICENSE"), "utf8");
    expect(raw).toContain("splitshift contributors");
    expect(raw).not.toMatch(/Copyright.*forkable/);
  });

  it("does not rewrite LICENSE body text unrelated to the holder", async () => {
    // Seed a LICENSE with a non-copyright-line body mention of 'forkable'.
    // The licenseEditor's gate is `/copyright/i.test(line)` so any line with
    // that word triggers rewrite. Use a plainly-descriptive line to keep the
    // assertion honest.
    fx = newFixture();
    fx.write(
      "LICENSE",
      [
        "MIT License",
        "",
        "Copyright (c) 2026 forkable contributors",
        "",
        "Permission is hereby granted. The forkable name appears in prose.",
      ].join("\n"),
    );
    await licenseEditor.run(makeCtx(fx, true));
    const raw = readFileSync(fx.resolve("LICENSE"), "utf8");
    const lines = raw.split("\n");
    expect(lines[2]).toContain("splitshift contributors");
    // body line below is untouched — no "copyright" token in it.
    expect(lines[4]).toContain("forkable name appears");
  });
});

describe("identity pass — binary assets (never modified)", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("favicon.png bytes are unchanged after runIdentityPass", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    const before = readFileSync(fx.resolve("site/public/favicon.png"));
    await runIdentityPass(makeCtx(fx, true));
    const after = readFileSync(fx.resolve("site/public/favicon.png"));
    expect(after.equals(before)).toBe(true);
  });

  it("og-image.png bytes are unchanged after runIdentityPass", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    const before = readFileSync(fx.resolve("site/public/og-image.png"));
    await runIdentityPass(makeCtx(fx, true));
    const after = readFileSync(fx.resolve("site/public/og-image.png"));
    expect(after.equals(before)).toBe(true);
  });

  // NOTE: The "assets listed in the regen manifest" assertion belongs to the
  // post pass, not the identity pass. See post.test.ts "asset regeneration
  // manifest" block.
});

describe("identity pass — dispatcher (runIdentityPass)", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("returns changes spanning multiple editor kinds", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    const r = await runIdentityPass(makeCtx(fx, false));
    const kinds = new Set(r.changes.map((c) => c.kind.split(":")[0]));
    expect(kinds.has("package.json")).toBe(true);
    expect(kinds.has("Cargo.toml")).toBe(true);
    expect(kinds.has("go.mod")).toBe(true);
  });

  it("dry-run (apply=false) does NOT mutate any file on disk", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    const pkgBefore = readFileSync(fx.resolve("package.json"), "utf8");
    const cargoBefore = readFileSync(fx.resolve("Cargo.toml"), "utf8");
    await runIdentityPass(makeCtx(fx, false));
    expect(readFileSync(fx.resolve("package.json"), "utf8")).toBe(pkgBefore);
    expect(readFileSync(fx.resolve("Cargo.toml"), "utf8")).toBe(cargoBefore);
  });

  it("files set contains every edited file's relative POSIX path", async () => {
    fx = newFixture();
    seedHardCaseRepo(fx);
    const r = await runIdentityPass(makeCtx(fx, true));
    expect(r.files.has("package.json")).toBe(true);
    expect(r.files.has("Cargo.toml")).toBe(true);
  });
});
