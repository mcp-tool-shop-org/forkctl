/**
 * Pass E — post-rename operations.
 *
 * 1. Lockfile regeneration.
 * 2. Path renames (git mv, two-step on case-insensitive FS).
 * 3. Asset regeneration manifest.
 * 4. Verify hook (best-effort; never fails the rename).
 *
 * Idempotent: a second apply on a clean state is a no-op.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import type { RenameChange, RenameWarning } from "../../schemas/rename.js";
import type { VariantSet } from "./variants.js";
import type { WalkedFile } from "./walk.js";
import { isAssetNeedingRegen } from "./exclusions.js";

export interface PostPassOptions {
  repoRoot: string;
  variants: VariantSet;
  from: string;
  to: string;
  apply: boolean;
  lockfileStrategy: "regenerate" | "skip";
  runVerify: boolean;
  files: readonly WalkedFile[];
}

export interface PostPassResult {
  changes: RenameChange[];
  lockfilesToRegenerate: string[];
  pathsToMove: { from: string; to: string }[];
  assetsToRegen: string[];
  lockfilesRegenerated: string[];
  pathsMoved: { from: string; to: string }[];
  assetRegenManifestPath?: string;
  verify?: { ran: boolean; ok: boolean; output?: string };
  warnings: RenameWarning[];
}

/** Known lockfiles and their regen command. */
const LOCKFILES: { file: string; install: { cmd: string; args: string[] } }[] = [
  { file: "package-lock.json", install: { cmd: "npm", args: ["install"] } },
  { file: "pnpm-lock.yaml", install: { cmd: "pnpm", args: ["install"] } },
  { file: "yarn.lock", install: { cmd: "yarn", args: ["install"] } },
  { file: "Cargo.lock", install: { cmd: "cargo", args: ["generate-lockfile"] } },
  { file: "poetry.lock", install: { cmd: "poetry", args: ["lock", "--no-update"] } },
  { file: "uv.lock", install: { cmd: "uv", args: ["sync"] } },
];

async function fileExists(abs: string): Promise<boolean> {
  try {
    await fs.access(abs);
    return true;
  } catch {
    return false;
  }
}

function runCommand(
  cwd: string,
  cmd: string,
  args: string[],
  timeoutMs = 120_000,
): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { cwd, shell: process.platform === "win32" });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d) => { stdout += d.toString(); });
    proc.stderr?.on("data", (d) => { stderr += d.toString(); });
    const timer = setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch { /* ignore */ }
    }, timeoutMs);
    proc.on("error", () => {
      clearTimeout(timer);
      resolve({ ok: false, output: stderr || "command failed to start" });
    });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      const ok = code === 0;
      const output = (stdout + "\n" + stderr).trim();
      resolve({ ok, output });
    });
  });
}

/**
 * Detect paths (files + directories) whose name contains any variant of `from`.
 * Returns proposed moves (from → to).
 */
async function detectPathMoves(
  repoRoot: string,
  variants: VariantSet,
): Promise<{ from: string; to: string }[]> {
  const moves: { from: string; to: string }[] = [];
  const ignore = new Set(["node_modules", ".git", "target", "dist", "build", "__pycache__", ".venv", "venv", "coverage", ".forkctl"]);
  async function recur(dir: string, parts: string[]): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (ignore.has(entry.name)) continue;
      const childParts = [...parts, entry.name];
      const rel = childParts.join("/");
      const full = path.join(dir, entry.name);
      // Check if name contains any variant's `from`
      const replaced = renamePathSegment(entry.name, variants);
      if (replaced !== entry.name) {
        moves.push({ from: rel, to: [...parts, replaced].join("/") });
        // Don't recurse into renamed dirs — the move itself handles contents.
        if (entry.isDirectory()) continue;
      }
      if (entry.isDirectory()) {
        await recur(full, childParts);
      }
    }
  }
  await recur(repoRoot, []);
  return moves;
}

function renamePathSegment(segment: string, variants: VariantSet): string {
  let next = segment;
  for (const v of Object.values(variants)) {
    if (!v.enabled) continue;
    if (!next.includes(v.from)) continue;
    // Word-boundary-ish: require non-alphanumeric on either side or the ends.
    const re = new RegExp(`(^|[^A-Za-z0-9_])${escape(v.from)}(?=[^A-Za-z0-9_]|$)`, "g");
    next = next.replace(re, (_m, pre: string) => `${pre}${v.to}`);
  }
  return next;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function isGitRepo(root: string): Promise<boolean> {
  return fileExists(path.join(root, ".git"));
}

async function performMove(root: string, from: string, to: string, gitAvailable: boolean): Promise<{ ok: boolean; error?: string }> {
  const src = path.join(root, from);
  const dst = path.join(root, to);
  // Two-step for case-insensitive FS (Windows/macOS default).
  if (src.toLowerCase() === dst.toLowerCase()) {
    const tmp = dst + ".forkctl.tmp";
    try {
      if (gitAvailable) {
        const r1 = await runCommand(root, "git", ["mv", from, path.basename(tmp)]);
        if (!r1.ok) return { ok: false, error: r1.output };
        const r2 = await runCommand(root, "git", ["mv", path.basename(tmp), to]);
        if (!r2.ok) return { ok: false, error: r2.output };
      } else {
        await fs.rename(src, tmp);
        await fs.rename(tmp, dst);
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
  try {
    if (gitAvailable) {
      const r = await runCommand(root, "git", ["mv", from, to]);
      if (!r.ok) {
        // Fallback: plain rename.
        await fs.mkdir(path.dirname(dst), { recursive: true });
        await fs.rename(src, dst);
      }
    } else {
      await fs.mkdir(path.dirname(dst), { recursive: true });
      await fs.rename(src, dst);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function runPostPass(opts: PostPassOptions): Promise<PostPassResult> {
  const warnings: RenameWarning[] = [];
  const changes: RenameChange[] = [];

  // 1) Lockfile detection.
  const lockfilesToRegenerate: string[] = [];
  for (const lf of LOCKFILES) {
    if (await fileExists(path.join(opts.repoRoot, lf.file))) {
      lockfilesToRegenerate.push(lf.file);
    }
  }

  // 2) Path moves.
  const pathsToMove = await detectPathMoves(opts.repoRoot, opts.variants);

  // 3) Asset regeneration manifest candidates.
  const assetsToRegen = opts.files.filter((f) => isAssetNeedingRegen(f.rel)).map((f) => f.rel);

  // Apply changes only when apply=true.
  const result: PostPassResult = {
    changes,
    lockfilesToRegenerate,
    pathsToMove,
    assetsToRegen,
    lockfilesRegenerated: [],
    pathsMoved: [],
    warnings,
  };

  if (!opts.apply) {
    return result;
  }

  // 2a) Path moves.
  const gitAvailable = await isGitRepo(opts.repoRoot);
  // Sort deepest-first so renaming a child doesn't break a parent path rename.
  pathsToMove.sort((a, b) => b.from.split("/").length - a.from.split("/").length);
  for (const m of pathsToMove) {
    const r = await performMove(opts.repoRoot, m.from, m.to, gitAvailable);
    if (r.ok) {
      result.pathsMoved.push(m);
      changes.push({ file: m.from, layer: "post", kind: "path:rename", before: m.from, after: m.to });
    } else {
      warnings.push({ code: "RENAME_PATH_MOVE_FAILED", message: r.error ?? "move failed", file: m.from });
    }
  }

  // 1a) Lockfile regeneration.
  if (opts.lockfileStrategy === "regenerate") {
    for (const lf of LOCKFILES) {
      if (!lockfilesToRegenerate.includes(lf.file)) continue;
      const abs = path.join(opts.repoRoot, lf.file);
      try {
        await fs.unlink(abs);
      } catch {
        warnings.push({ code: "RENAME_LOCKFILE_REGEN_FAILED", message: `could not remove ${lf.file}`, file: lf.file });
        continue;
      }
      const r = await runCommand(opts.repoRoot, lf.install.cmd, lf.install.args, 180_000);
      if (r.ok) {
        result.lockfilesRegenerated.push(lf.file);
        changes.push({ file: lf.file, layer: "post", kind: "lockfile:regenerate", before: "stale", after: "regenerated" });
      } else {
        warnings.push({ code: "RENAME_LOCKFILE_REGEN_FAILED", message: r.output || `${lf.install.cmd} failed`, file: lf.file });
      }
    }
  }

  // 3a) Asset regen manifest.
  if (assetsToRegen.length > 0) {
    const manifestDir = path.join(opts.repoRoot, ".forkctl");
    await fs.mkdir(manifestDir, { recursive: true });
    const manifestPath = path.join(manifestDir, "asset-regen.json");
    const manifest = {
      generatedAt: new Date().toISOString(),
      from: opts.from,
      to: opts.to,
      note: "These assets were NOT modified by `forkctl rename`. Regenerate manually with your design pipeline.",
      assets: assetsToRegen,
    };
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
    result.assetRegenManifestPath = path.relative(opts.repoRoot, manifestPath).split(path.sep).join("/");
    changes.push({ file: result.assetRegenManifestPath, layer: "post", kind: "asset:manifest", before: "<none>", after: `${assetsToRegen.length} assets listed` });
  }

  // 4) Verify hook.
  if (opts.runVerify) {
    const verify = await detectAndRunVerify(opts.repoRoot);
    if (verify) result.verify = verify;
  }

  return result;
}

async function detectAndRunVerify(root: string): Promise<{ ran: boolean; ok: boolean; output?: string } | undefined> {
  // npm run verify if package.json has it.
  const pkgPath = path.join(root, "package.json");
  if (await fileExists(pkgPath)) {
    try {
      const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8")) as { scripts?: Record<string, string> };
      if (pkg.scripts && pkg.scripts.verify) {
        const r = await runCommand(root, "npm", ["run", "verify"], 240_000);
        return { ran: true, ok: r.ok, output: r.output.slice(0, 8192) };
      }
    } catch { /* fall through */ }
  }
  // Makefile with `verify` target.
  const makefile = path.join(root, "Makefile");
  if (await fileExists(makefile)) {
    const content = await fs.readFile(makefile, "utf8").catch(() => "");
    if (/^verify\s*:/m.test(content)) {
      const r = await runCommand(root, "make", ["verify"], 240_000);
      return { ran: true, ok: r.ok, output: r.output.slice(0, 8192) };
    }
  }
  // Cargo check if Cargo.toml present.
  if (await fileExists(path.join(root, "Cargo.toml"))) {
    const r = await runCommand(root, "cargo", ["check"], 240_000);
    return { ran: true, ok: r.ok, output: r.output.slice(0, 8192) };
  }
  return undefined;
}
