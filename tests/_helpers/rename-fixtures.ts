import { mkdirSync, mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Fixture helpers for Layer 7 rename tests.
 *
 * Each fixture is a self-contained tmpdir "repo" with well-known content that
 * exercises one or more cases from design/rename.md §5 hard-case matrix.
 *
 * Ownership: the caller owns the returned directory and MUST call `cleanup()`
 * in afterEach. Fixtures never leak into the repo's working tree — they live
 * under `os.tmpdir()`.
 */

export interface FixtureRepo {
  /** Absolute path to the fixture root. */
  root: string;
  /** Remove the entire fixture tree. Safe to call twice. */
  cleanup: () => void;
  /** Absolute path helper relative to root. */
  resolve: (...segments: string[]) => string;
  /** Write a file (creating parents) relative to root. */
  write: (relPath: string, content: string | Buffer) => void;
  /** Does a file exist (relative to root)? */
  exists: (relPath: string) => boolean;
}

export function newFixture(prefix = "forkable-rename-"): FixtureRepo {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const resolve = (...segments: string[]) => join(root, ...segments);
  const write = (relPath: string, content: string | Buffer) => {
    const abs = resolve(relPath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  };
  const exists = (relPath: string) => existsSync(resolve(relPath));
  const cleanup = () => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // best-effort on Windows where open handles may linger briefly
    }
  };
  return { root, cleanup, resolve, write, exists };
}

/**
 * Seed a fixture with the §5 hard-case matrix content: a mini forkable-style
 * repo with every trap the design calls out.
 */
export function seedHardCaseRepo(fx: FixtureRepo, name = "forkable"): void {
  // Identity layer files --------------------------------------------------
  fx.write(
    "package.json",
    JSON.stringify(
      {
        name: `@mcptoolshop/${name}`,
        version: "1.0.0",
        description: `${name} — a tool`,
        bin: { [name]: "dist/cli.js", [`${name}-mcp`]: "dist/server.js" },
        repository: { type: "git", url: `git+https://github.com/mcp-tool-shop-org/${name}.git` },
        homepage: `https://github.com/mcp-tool-shop-org/${name}`,
        bugs: { url: `https://github.com/mcp-tool-shop-org/${name}/issues` },
        dependencies: { zod: "^3.23.8" },
      },
      null,
      2,
    ) + "\n",
  );
  fx.write(
    "Cargo.toml",
    [
      "[package]",
      `name = "${name}"`,
      'version = "1.0.0"',
      `repository = "https://github.com/mcp-tool-shop-org/${name}"`,
      "",
      "[[bin]]",
      `name = "${name}"`,
      'path = "src/main.rs"',
      "",
      "[lib]",
      `name = "${name}_lib"`,
      "",
      "[dependencies]",
      'serde = "1.0"',
      "",
    ].join("\n"),
  );
  fx.write(
    "pyproject.toml",
    [
      "[project]",
      `name = "${name}"`,
      'version = "1.0.0"',
      "",
      "[tool.poetry]",
      `name = "${name}"`,
      'description = "a tool"',
      "",
    ].join("\n"),
  );
  fx.write("go.mod", `module github.com/mcp-tool-shop-org/${name}\n\ngo 1.22\n`);
  fx.write(
    "README.md",
    [
      `# ${name.charAt(0).toUpperCase()}${name.slice(1)}`,
      "",
      "A rebrand-ready tool.",
      "",
      "## Usage",
      "",
      "```bash",
      // Code fence — §5: not rewritten in textual pass",
      `npx ${name} rename plan .`,
      "```",
      "",
      `See [${name} docs](https://github.com/mcp-tool-shop-org/${name}).`,
      "",
    ].join("\n"),
  );
  fx.write("LICENSE", `MIT License\n\nCopyright (c) 2026 ${name} contributors\n`);

  // §5: CHANGELOG pre-fork-point entry should be preserved
  fx.write(
    "CHANGELOG.md",
    [
      "# Changelog",
      "",
      "## [1.0.0] - 2026-04-19",
      `- Initial ${name} release.`,
      "",
      "## [0.1.0] - 2026-01-01  <!-- pre-fork-point -->",
      `- Original ${name} prototype.`,
      "",
    ].join("\n"),
  );

  // Source files (Pass B — symbols) --------------------------------------
  fx.write(
    "src/index.ts",
    [
      `// ${name} core module`,
      // §5: textual comment pass rewrites this, ast-grep comment kind rewrites it too
      `/** A ${name} service. */`,
      `export class ${name.charAt(0).toUpperCase()}${name.slice(1)} {`,
      `  readonly name = "${name}";`,
      "  // §5 hard-case: starship should NOT be touched",
      '  readonly unrelated = "starship";',
      "  // Partial-match hazards: neither should be touched",
      '  readonly also = "unforkableness forkableness";',
      "}",
      "",
      `export const ${name.toUpperCase()}_VERSION = "1.0.0";`,
      "",
      // §5: re-export — ast-grep + deep-ts should handle both specifier and file
      `export { ${name.charAt(0).toUpperCase()}${name.slice(1)} as Service } from "./${name}.js";`,
      "",
    ].join("\n"),
  );

  fx.write(
    `src/${name}.ts`,
    [
      `// ${name}.ts — the core impl`,
      `export const ${name} = (x: number) => x * 2;`,
      "",
    ].join("\n"),
  );

  // §5: directory `src/forkable/` gets git-mv'd to `src/splitshift/`
  fx.write(
    `src/${name}/engine.py`,
    [
      `# ${name} engine`,
      `class ${name.charAt(0).toUpperCase()}${name.slice(1)}Engine:`,
      "    def run(self):",
      `        return "${name}"  # string literal — default: rewritten with warning`,
      "",
      "# starship is untouched",
      "",
    ].join("\n"),
  );

  fx.write(
    "src/lib.rs",
    [
      `pub struct ${name.charAt(0).toUpperCase()}${name.slice(1)} {}`,
      "",
      `pub fn ${name}_init() {}`,
      "",
    ].join("\n"),
  );

  fx.write(
    "cmd/main.go",
    [
      "package main",
      "",
      `var ${name.charAt(0).toUpperCase()}${name.slice(1)}Version = "1.0.0"`,
      "",
      `func ${name.charAt(0).toUpperCase()}${name.slice(1)}Init() {}`,
      "",
    ].join("\n"),
  );

  fx.write(
    "scripts/hello.js",
    [
      `const ${name} = "hello";`,
      `console.log(${name});`,
      "",
    ].join("\n"),
  );

  // §5: .env.example key+value surfaced in diff-only output
  fx.write(
    ".env.example",
    [
      `${name.toUpperCase()}_API_KEY=xxx`,
      `${name.toUpperCase()}_URL=https://example.com`,
      "# unrelated",
      "NODE_ENV=development",
      "",
    ].join("\n"),
  );

  // §5: YAML — keys preserved, values rewritten
  fx.write(
    "config.yaml",
    [
      `${name}: enabled`,
      `displayName: "${name} runtime"`,
      "",
    ].join("\n"),
  );

  // §5: Astro/HTML textual pass with attribute awareness
  fx.write(
    "site/src/pages/index.astro",
    [
      "---",
      `import Logo from "../components/${name}-logo.astro";`,
      "---",
      `<${name}-logo size="sm" />`,
      `<h1>${name.charAt(0).toUpperCase()}${name.slice(1)}</h1>`,
      "",
    ].join("\n"),
  );

  // §5: lockfiles — deleted + regenerated in post, never rewritten
  fx.write(
    "package-lock.json",
    JSON.stringify(
      {
        name: `@mcptoolshop/${name}`,
        lockfileVersion: 3,
        packages: { "": { name: `@mcptoolshop/${name}`, version: "1.0.0" } },
      },
      null,
      2,
    ),
  );

  // §5: binary asset (PNG header) — never modified, added to manifest
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  fx.write("site/public/favicon.png", pngHeader);
  fx.write("site/public/og-image.png", pngHeader);

  // .github workflow
  fx.write(
    ".github/workflows/ci.yml",
    [
      `name: ${name}-ci`,
      "on: [push, workflow_dispatch]",
      "jobs:",
      "  test:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: actions/checkout@v4",
      "",
    ].join("\n"),
  );
}

/**
 * Seed an empty git repo at the fixture root (for snapshot/rollback tests).
 * Uses node:child_process.execSync so it stays synchronous for test setup.
 */
export async function initGitRepo(fx: FixtureRepo): Promise<void> {
  const { execSync } = await import("node:child_process");
  execSync("git init -q -b main", { cwd: fx.root });
  // Disable autocrlf so Windows CI doesn't rewrite \n → \r\n in checkout
  // (the rollback test compares file contents byte-for-byte).
  execSync("git config core.autocrlf false", { cwd: fx.root });
  execSync("git config user.email \"test@example.com\"", { cwd: fx.root });
  execSync("git config user.name \"Test\"", { cwd: fx.root });
  execSync("git add -A", { cwd: fx.root });
  execSync("git commit -q -m \"initial\" --allow-empty", { cwd: fx.root });
}

/**
 * Ensure a nested directory exists under the fixture. Rarely needed — `write`
 * already does this — but handy for empty-dir scenarios.
 */
export async function ensureDir(fx: FixtureRepo, rel: string): Promise<void> {
  await mkdir(fx.resolve(rel), { recursive: true });
}
