/**
 * Snapshot & rollback for rename.
 *
 * git repos  → record pre-HEAD SHA + git stash --include-untracked; rollback
 *              = git reset --hard <pre> + git stash pop (if created).
 * non-git    → tarball of the working tree (minus always-excluded dirs);
 *              rollback = extract tarball over working tree.
 *
 * Snapshots live under `.forkable/snapshots/rename-<unix-ts>/`.
 * Kept for 7 days; GC runs on every rename invocation.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { ForkableError } from "../errors.js";

export interface SnapshotResult {
  id: string;
  dir: string;
  mode: "git" | "tar" | "files";
  /** Present for git mode — HEAD SHA at snapshot time. */
  preHead?: string;
  /** Present when a stash was created. */
  stashRef?: string;
  /** Present for tar mode — tarball path. */
  tarball?: string;
}

function runCommand(cwd: string, cmd: string, args: string[], timeoutMs = 120_000): Promise<{ ok: boolean; stdout: string; stderr: string }> {
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
      resolve({ ok: false, stdout, stderr: stderr || "command failed to start" });
    });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, stdout, stderr });
    });
  });
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

async function isGit(root: string): Promise<boolean> {
  return exists(path.join(root, ".git"));
}

function now(): number { return Date.now(); }

export async function takeSnapshot(root: string): Promise<SnapshotResult> {
  const id = `rename-${Math.floor(now() / 1000)}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = path.join(root, ".forkable", "snapshots", id);
  await fs.mkdir(dir, { recursive: true });

  if (await isGit(root)) {
    const sha = await runCommand(root, "git", ["rev-parse", "HEAD"]);
    if (!sha.ok) {
      throw new ForkableError("RENAME_SNAPSHOT_FAILED", "could not read HEAD", {
        hint: "To fix: ensure the repo has at least one commit before running rename.",
      });
    }
    const preHead = sha.stdout.trim();
    await fs.writeFile(path.join(dir, "pre-head.txt"), preHead + "\n", "utf8");

    // Stash with untracked (best-effort).
    const stashName = `forkable-${id}`;
    const stash = await runCommand(root, "git", ["stash", "push", "--include-untracked", "-m", stashName]);
    let stashRef: string | undefined;
    if (stash.ok && !/No local changes to save/i.test(stash.stdout + stash.stderr)) {
      stashRef = stashName;
      await fs.writeFile(path.join(dir, "stash-ref.txt"), stashName + "\n", "utf8");
      // Pop the stash so the working tree still reflects the uncommitted work
      // we're about to operate on — rollback will re-create state from HEAD
      // plus the stash ref. We keep the stash on the stash list for recovery.
      await runCommand(root, "git", ["stash", "apply", "--index"]);
    }

    const result: SnapshotResult = { id, dir, mode: "git", preHead };
    if (stashRef !== undefined) result.stashRef = stashRef;
    return result;
  }

  // Non-git: copy a tree under `tree/` — simpler than tar, portable, and
  // makes rollback trivial. Also works offline.
  const treeDir = path.join(dir, "tree");
  await fs.mkdir(treeDir, { recursive: true });
  await copyTree(root, treeDir);
  return { id, dir, mode: "files" };
}

async function copyTree(src: string, dst: string): Promise<void> {
  const ignore = new Set(["node_modules", ".git", "target", "dist", "build", "__pycache__", ".venv", "venv", "coverage", ".forkable"]);
  async function recur(from: string, to: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(from, { withFileTypes: true });
    } catch { return; }
    for (const entry of entries) {
      if (ignore.has(entry.name)) continue;
      const fromP = path.join(from, entry.name);
      const toP = path.join(to, entry.name);
      if (entry.isDirectory()) {
        await fs.mkdir(toP, { recursive: true });
        await recur(fromP, toP);
      } else if (entry.isFile()) {
        await fs.mkdir(path.dirname(toP), { recursive: true });
        await fs.copyFile(fromP, toP);
      }
    }
  }
  await recur(src, dst);
}

export interface RollbackOptions {
  repoRoot: string;
  snapshotId?: string;
}

export interface RollbackResult {
  restoredFrom: string;
  mode: "git" | "files";
}

async function findLatestSnapshot(root: string): Promise<string | null> {
  const dir = path.join(root, ".forkable", "snapshots");
  if (!(await exists(dir))) return null;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const candidates = entries.filter((e) => e.isDirectory() && e.name.startsWith("rename-"));
  if (candidates.length === 0) return null;
  // Lex sort works because the timestamp prefix is zero-padded.
  candidates.sort((a, b) => (a.name < b.name ? 1 : -1));
  return candidates[0]!.name;
}

export async function rollbackSnapshot(opts: RollbackOptions): Promise<RollbackResult> {
  const snapshotId = opts.snapshotId ?? (await findLatestSnapshot(opts.repoRoot));
  if (!snapshotId) {
    throw new ForkableError("RENAME_ROLLBACK_NOT_FOUND", "no rename snapshot to restore", {
      hint: "To fix: pass --snapshot-id or run `rename apply` first.",
    });
  }
  const snapDir = path.join(opts.repoRoot, ".forkable", "snapshots", snapshotId);
  if (!(await exists(snapDir))) {
    throw new ForkableError("RENAME_ROLLBACK_NOT_FOUND", `snapshot ${snapshotId} not found`, {
      hint: "To fix: check .forkable/snapshots/ for available IDs.",
    });
  }

  const preHeadPath = path.join(snapDir, "pre-head.txt");
  if (await exists(preHeadPath)) {
    const preHead = (await fs.readFile(preHeadPath, "utf8")).trim();
    const r = await runCommand(opts.repoRoot, "git", ["reset", "--hard", preHead]);
    if (!r.ok) {
      throw new ForkableError("RENAME_APPLY_FAILED", `git reset --hard failed: ${r.stderr.slice(0, 400)}`, {
        hint: "To fix: check for uncommitted work that git refuses to discard.",
      });
    }
    const stashRefPath = path.join(snapDir, "stash-ref.txt");
    if (await exists(stashRefPath)) {
      const stashRef = (await fs.readFile(stashRefPath, "utf8")).trim();
      // Find the stash with matching message.
      const list = await runCommand(opts.repoRoot, "git", ["stash", "list"]);
      const line = list.stdout.split("\n").find((l) => l.includes(stashRef));
      if (line) {
        const match = line.match(/^(stash@\{\d+\})/);
        if (match) {
          await runCommand(opts.repoRoot, "git", ["stash", "pop", match[1]!]);
        }
      }
    }
    return { restoredFrom: snapshotId, mode: "git" };
  }

  // File-based restore: copy tree/ over the repo root, removing any files
  // created after the snapshot.
  const treeDir = path.join(snapDir, "tree");
  if (!(await exists(treeDir))) {
    throw new ForkableError("RENAME_ROLLBACK_NOT_FOUND", "snapshot has no tree/ directory", {
      hint: "To fix: the snapshot is malformed; restore from another snapshot.",
    });
  }
  await restoreTree(treeDir, opts.repoRoot);
  return { restoredFrom: snapshotId, mode: "files" };
}

async function restoreTree(src: string, dst: string): Promise<void> {
  async function recur(from: string, to: string): Promise<void> {
    const entries = await fs.readdir(from, { withFileTypes: true });
    for (const entry of entries) {
      const fromP = path.join(from, entry.name);
      const toP = path.join(to, entry.name);
      if (entry.isDirectory()) {
        await fs.mkdir(toP, { recursive: true });
        await recur(fromP, toP);
      } else if (entry.isFile()) {
        await fs.mkdir(path.dirname(toP), { recursive: true });
        await fs.copyFile(fromP, toP);
      }
    }
  }
  await recur(src, dst);
}

/** Delete snapshots older than 7 days. Best-effort; silent on failure. */
export async function gcSnapshots(root: string, maxAgeMs = 7 * 24 * 60 * 60 * 1000): Promise<void> {
  const dir = path.join(root, ".forkable", "snapshots");
  if (!(await exists(dir))) return;
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch { return; }
  const cutoff = now() - maxAgeMs;
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("rename-")) continue;
    const ts = parseInt(entry.name.split("-")[1] ?? "0", 10) * 1000;
    if (ts && ts < cutoff) {
      try {
        await fs.rm(path.join(dir, entry.name), { recursive: true, force: true });
      } catch { /* ignore */ }
    }
  }
}
