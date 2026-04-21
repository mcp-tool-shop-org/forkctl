import { afterEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { newFixture, initGitRepo, type FixtureRepo } from "../_helpers/rename-fixtures.js";
import {
  gcSnapshots,
  rollbackSnapshot,
  takeSnapshot,
} from "../../src/lib/rename/snapshot.js";

/**
 * Covers design §7 (snapshot & rollback) + §5 non-git-repo row.
 *
 * Bounds:
 *   - Snapshots under `.forkctl/snapshots/rename-<ts>-<rand>/`
 *   - git: record pre-rename HEAD SHA + `git stash push --include-untracked`
 *   - non-git: file-tree copy (tarball equivalent for portability)
 *   - Snapshots kept 7 days, GC'd on next forkable command
 */

function hasGit(): boolean {
  try {
    execSync("git --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("snapshot — git repo", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("records pre-rename HEAD SHA under .forkctl/snapshots/rename-*/pre-head.txt", async () => {
    if (!hasGit()) return;
    fx = newFixture();
    fx.write("a.txt", "hello\n");
    await initGitRepo(fx);
    const snap = await takeSnapshot(fx.root);
    expect(snap.mode).toBe("git");
    expect(snap.preHead).toBeDefined();
    expect(snap.preHead!.length).toBeGreaterThanOrEqual(7);
    const preHeadFile = fx.resolve(".forkctl/snapshots", snap.id, "pre-head.txt");
    expect(existsSync(preHeadFile)).toBe(true);
    expect(readFileSync(preHeadFile, "utf8").trim()).toBe(snap.preHead);
  });

  it("captures uncommitted changes via git stash --include-untracked", async () => {
    if (!hasGit()) return;
    fx = newFixture();
    fx.write("a.txt", "tracked\n");
    await initGitRepo(fx);
    // Add a NEW untracked file to force a stash.
    fx.write("b.txt", "untracked\n");
    const snap = await takeSnapshot(fx.root);
    expect(snap.mode).toBe("git");
    expect(snap.stashRef).toBeDefined();
    expect(existsSync(fx.resolve(".forkctl/snapshots", snap.id, "stash-ref.txt"))).toBe(true);
  });

  it("rollback restores HEAD after a post-snapshot mutation", async () => {
    if (!hasGit()) return;
    fx = newFixture();
    fx.write("a.txt", "original\n");
    await initGitRepo(fx);
    const snap = await takeSnapshot(fx.root);
    // Mutate the tracked file post-snapshot.
    writeFileSync(fx.resolve("a.txt"), "mutated\n");
    execSync("git add -A && git commit -q -m mut", { cwd: fx.root });
    // Rollback.
    const r = await rollbackSnapshot({ repoRoot: fx.root, snapshotId: snap.id });
    expect(r.mode).toBe("git");
    expect(readFileSync(fx.resolve("a.txt"), "utf8")).toBe("original\n");
  });
});

describe("snapshot — non-git repo (§5)", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("writes a tree/ directory of the working tree when no .git is present", async () => {
    fx = newFixture();
    fx.write("a.txt", "hello\n");
    fx.write("src/b.txt", "nested\n");
    const snap = await takeSnapshot(fx.root);
    expect(snap.mode).toBe("files");
    const treeDir = fx.resolve(".forkctl/snapshots", snap.id, "tree");
    expect(existsSync(treeDir)).toBe(true);
    expect(existsSync(fx.resolve(".forkctl/snapshots", snap.id, "tree/a.txt"))).toBe(true);
    expect(existsSync(fx.resolve(".forkctl/snapshots", snap.id, "tree/src/b.txt"))).toBe(true);
  });

  it("tree excludes node_modules/, dist/, .git/, .forkctl/", async () => {
    fx = newFixture();
    fx.write("a.txt", "keep\n");
    fx.write("node_modules/x/pkg.json", "skip\n");
    fx.write("dist/x.js", "skip\n");
    const snap = await takeSnapshot(fx.root);
    const base = fx.resolve(".forkctl/snapshots", snap.id, "tree");
    expect(existsSync(`${base}/a.txt`)).toBe(true);
    expect(existsSync(`${base}/node_modules`)).toBe(false);
    expect(existsSync(`${base}/dist`)).toBe(false);
  });

  it("rollback restores the file tree over the working tree", async () => {
    fx = newFixture();
    fx.write("a.txt", "original\n");
    const snap = await takeSnapshot(fx.root);
    writeFileSync(fx.resolve("a.txt"), "mutated\n");
    const r = await rollbackSnapshot({ repoRoot: fx.root, snapshotId: snap.id });
    expect(r.mode).toBe("files");
    expect(readFileSync(fx.resolve("a.txt"), "utf8")).toBe("original\n");
  });

  it("with no snapshot directory → throws RENAME_ROLLBACK_NOT_FOUND", async () => {
    fx = newFixture();
    fx.write("a.txt", "x\n");
    await expect(rollbackSnapshot({ repoRoot: fx.root })).rejects.toMatchObject({
      code: "RENAME_ROLLBACK_NOT_FOUND",
    });
  });

  it("with a non-existent snapshotId → throws RENAME_ROLLBACK_NOT_FOUND", async () => {
    fx = newFixture();
    await expect(
      rollbackSnapshot({ repoRoot: fx.root, snapshotId: "rename-0000" }),
    ).rejects.toMatchObject({ code: "RENAME_ROLLBACK_NOT_FOUND" });
  });
});

describe("snapshot — GC", () => {
  let fx: FixtureRepo;
  afterEach(() => fx?.cleanup());

  it("removes snapshot directories older than 7 days", async () => {
    fx = newFixture();
    // Manually create an "old" snapshot dir — timestamp prefix > 7 days ago.
    const eightDaysAgo = Math.floor((Date.now() - 8 * 24 * 60 * 60 * 1000) / 1000);
    const oldId = `rename-${eightDaysAgo}-old000`;
    mkdirSync(fx.resolve(".forkctl/snapshots", oldId), { recursive: true });
    const recentId = `rename-${Math.floor(Date.now() / 1000)}-new000`;
    mkdirSync(fx.resolve(".forkctl/snapshots", recentId), { recursive: true });

    await gcSnapshots(fx.root);

    expect(existsSync(fx.resolve(".forkctl/snapshots", oldId))).toBe(false);
    expect(existsSync(fx.resolve(".forkctl/snapshots", recentId))).toBe(true);
  });

  it("retains all snapshots when none are older than the cutoff", async () => {
    fx = newFixture();
    const id = `rename-${Math.floor(Date.now() / 1000)}-abc123`;
    mkdirSync(fx.resolve(".forkctl/snapshots", id), { recursive: true });
    await gcSnapshots(fx.root);
    expect(existsSync(fx.resolve(".forkctl/snapshots", id))).toBe(true);
  });

  it("no-op when the snapshots dir does not exist", async () => {
    fx = newFixture();
    await expect(gcSnapshots(fx.root)).resolves.toBeUndefined();
  });
});
