import { afterEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { newFixture, type FixtureRepo } from "../_helpers/rename-fixtures.js";
import { buildVariantSet } from "../../src/lib/rename/variants.js";
import { runPostPass, type PostPassOptions } from "../../src/lib/rename/post.js";
import { walkRepo } from "../../src/lib/rename/walk.js";

/**
 * Covers design §3 Pass E (post-rename) + F6.
 *
 * Tests avoid invoking real package managers (`npm install` etc) because
 * they're network-dependent, slow, and would fail in CI. Instead we assert
 * the DETECTION + MANIFEST surface with `lockfileStrategy: "skip"`, plus
 * path rename + asset-regen + idempotence without triggering install.
 *
 * The actual install-exec path is a shell-out — out of scope for unit-level
 * tests; it's exercised by higher-level integration tests on the CI runner.
 */

async function makeOpts(
  fx: FixtureRepo,
  overrides: Partial<PostPassOptions> = {},
): Promise<PostPassOptions> {
  const variants = buildVariantSet("forkable", "splitshift");
  const walked = await walkRepo(fx.root, { exclude: [] });
  return {
    repoRoot: fx.root,
    variants,
    from: "forkable",
    to: "splitshift",
    apply: false,
    lockfileStrategy: "skip",
    runVerify: false,
    files: walked,
    ...overrides,
  };
}

describe("post pass — lockfile detection (F6)", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("detects package-lock.json", async () => {
    fx = newFixture();
    fx.write("package-lock.json", "{}\n");
    const r = await runPostPass(await makeOpts(fx));
    expect(r.lockfilesToRegenerate).toContain("package-lock.json");
  });

  it("detects pnpm-lock.yaml", async () => {
    fx = newFixture();
    fx.write("pnpm-lock.yaml", "lockfileVersion: 7.0\n");
    const r = await runPostPass(await makeOpts(fx));
    expect(r.lockfilesToRegenerate).toContain("pnpm-lock.yaml");
  });

  it("detects yarn.lock", async () => {
    fx = newFixture();
    fx.write("yarn.lock", "# yarn\n");
    const r = await runPostPass(await makeOpts(fx));
    expect(r.lockfilesToRegenerate).toContain("yarn.lock");
  });

  it("detects Cargo.lock", async () => {
    fx = newFixture();
    fx.write("Cargo.lock", "# cargo\n");
    const r = await runPostPass(await makeOpts(fx));
    expect(r.lockfilesToRegenerate).toContain("Cargo.lock");
  });

  it("detects poetry.lock", async () => {
    fx = newFixture();
    fx.write("poetry.lock", "# poetry\n");
    const r = await runPostPass(await makeOpts(fx));
    expect(r.lockfilesToRegenerate).toContain("poetry.lock");
  });

  it("detects uv.lock", async () => {
    fx = newFixture();
    fx.write("uv.lock", "# uv\n");
    const r = await runPostPass(await makeOpts(fx));
    expect(r.lockfilesToRegenerate).toContain("uv.lock");
  });

  it("when `lockfileStrategy: skip` and apply=true, does NOT delete lockfile", async () => {
    fx = newFixture();
    fx.write("package-lock.json", "{}\n");
    await runPostPass(await makeOpts(fx, { apply: true, lockfileStrategy: "skip" }));
    expect(existsSync(fx.resolve("package-lock.json"))).toBe(true);
  });

  // Lockfile regen failure (RENAME_LOCKFILE_REGEN_FAILED warning) is surfaced
  // when the install command fails. That requires invoking a package manager,
  // which we deliberately avoid here.
  it.todo("on regen failure, surfaces RENAME_LOCKFILE_REGEN_FAILED with stderr (integration-level)");
});

describe("post pass — path rename detection (F6)", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("detects a directory whose name matches a variant", async () => {
    fx = newFixture();
    fx.write("src/forkable/a.ts", "// x\n");
    const r = await runPostPass(await makeOpts(fx));
    const move = r.pathsToMove.find((m) => m.from === "src/forkable");
    expect(move).toBeDefined();
    expect(move!.to).toBe("src/splitshift");
  });

  it("detects a file whose name matches a variant", async () => {
    fx = newFixture();
    fx.write("src/forkable.ts", "// x\n");
    const r = await runPostPass(await makeOpts(fx));
    const move = r.pathsToMove.find((m) => m.from === "src/forkable.ts");
    expect(move).toBeDefined();
    expect(move!.to).toBe("src/splitshift.ts");
  });

  it("does NOT detect a path whose name contains the token as a partial (starship)", async () => {
    fx = newFixture();
    fx.write("src/starship/a.ts", "// x\n");
    const r = await runPostPass(await makeOpts(fx));
    expect(r.pathsToMove.find((m) => m.from.startsWith("src/starship"))).toBeUndefined();
  });

  it("applies a directory rename in a non-git repo (fs.rename fallback)", async () => {
    fx = newFixture();
    fx.write("src/forkable/a.ts", "// content\n");
    await runPostPass(await makeOpts(fx, { apply: true }));
    expect(existsSync(fx.resolve("src/forkable"))).toBe(false);
    expect(existsSync(fx.resolve("src/splitshift/a.ts"))).toBe(true);
  });

  it("applies a file rename in a non-git repo", async () => {
    fx = newFixture();
    fx.write("src/forkable.ts", "// content\n");
    await runPostPass(await makeOpts(fx, { apply: true }));
    expect(existsSync(fx.resolve("src/forkable.ts"))).toBe(false);
    expect(existsSync(fx.resolve("src/splitshift.ts"))).toBe(true);
  });

  // The two-step case-only rename is relevant on case-insensitive FS
  // (Windows/macOS default). On case-SENSITIVE FS (most CI Linux) the
  // straight rename works in one shot, so the two-step path isn't
  // exercised. We record the expected behavior as a todo for a future
  // case-insensitive-FS-aware test harness.
  it.todo("case-only rename `foo` → `Foo` uses the .forkable.tmp two-step on case-insensitive FS");
  it.todo("updates import specifiers that pointed at the old path (belongs to symbols pass, not post)");
});

describe("post pass — asset regeneration manifest (F6)", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("lists favicon.png + og-image.png as assets to regenerate", async () => {
    fx = newFixture();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    fx.write("site/public/favicon.png", png);
    fx.write("site/public/og-image.png", png);
    const r = await runPostPass(await makeOpts(fx));
    expect(r.assetsToRegen).toContain("site/public/favicon.png");
    expect(r.assetsToRegen).toContain("site/public/og-image.png");
  });

  it("writes .forkctl/asset-regen.json on apply", async () => {
    fx = newFixture();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    fx.write("site/public/favicon.png", png);
    await runPostPass(await makeOpts(fx, { apply: true }));
    const manifestPath = fx.resolve(".forkctl/asset-regen.json");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      from: string;
      to: string;
      assets: string[];
      note: string;
    };
    expect(manifest.from).toBe("forkable");
    expect(manifest.to).toBe("splitshift");
    expect(manifest.assets).toContain("site/public/favicon.png");
    expect(manifest.note.length).toBeGreaterThan(10);
  });

  it("never modifies the binary asset bytes themselves", async () => {
    fx = newFixture();
    const payload = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    fx.write("site/public/favicon.png", payload);
    await runPostPass(await makeOpts(fx, { apply: true }));
    const after = readFileSync(fx.resolve("site/public/favicon.png"));
    expect(after.equals(payload)).toBe(true);
  });
});

describe("post pass — verify hook (F6)", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("records nothing when runVerify=false (default for plan)", async () => {
    fx = newFixture();
    fx.write("package.json", JSON.stringify({ name: "x", scripts: { verify: "echo ok" } }));
    const r = await runPostPass(await makeOpts(fx, { apply: true, runVerify: false }));
    expect(r.verify).toBeUndefined();
  });

  // Running npm run verify requires an actual npm install to resolve the
  // script — covered by higher-level integration tests; unit tests skip.
  it.todo("invokes `npm run verify` when scripts.verify exists (integration-level)");
  it.todo("verify failure does NOT fail the rename — reported as post-condition (integration-level)");
});

describe("post pass — idempotence", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("running post pass a second time on an already-renamed tree is a no-op for paths", async () => {
    fx = newFixture();
    fx.write("src/forkable/a.ts", "// x\n");
    await runPostPass(await makeOpts(fx, { apply: true }));
    // Second run — there's no forkable dir anymore, so no new moves proposed.
    const r2 = await runPostPass(await makeOpts(fx, { apply: true }));
    expect(r2.pathsToMove).toEqual([]);
    expect(r2.pathsMoved).toEqual([]);
  });
});

describe("post pass — dry-run contract", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("apply=false never mutates the working tree", async () => {
    fx = newFixture();
    fx.write("src/forkable/a.ts", "// x\n");
    fx.write("package-lock.json", "{}\n");
    fx.write("site/public/favicon.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const r = await runPostPass(await makeOpts(fx, { apply: false }));
    expect(existsSync(fx.resolve("src/forkable/a.ts"))).toBe(true);
    expect(existsSync(fx.resolve("src/splitshift"))).toBe(false);
    expect(existsSync(fx.resolve("package-lock.json"))).toBe(true);
    expect(existsSync(fx.resolve(".forkctl/asset-regen.json"))).toBe(false);
    // But the plan reports are populated.
    expect(r.lockfilesToRegenerate).toContain("package-lock.json");
    expect(r.pathsToMove.length).toBeGreaterThan(0);
  });
});
