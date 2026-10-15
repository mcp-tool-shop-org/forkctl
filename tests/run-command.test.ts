import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommand } from "../src/lib/rename/run-command.js";
import { KILL_GRACE_MS } from "../src/lib/kill-tree.js";

// The rename passes run npm, git, cargo and make with a timeout. On Windows the
// child they hold is cmd.exe (shell: true), so `child.kill()` used to end only
// cmd.exe: the real command went on running after the timeout was reported, and
// the caller carried on (rollback, git reset --hard) while it still wrote into
// the tree. The holder below starts a grandchild that shares its stdio, then
// both sleep: the shape of a command that outlives its shell.
const SLEEP_MS = 20_000;
const TIMEOUT_MS = 2_000;
// Deadline + grace + room for a slow runner, and still well short of SLEEP_MS.
const SETTLE_BOUND_MS = TIMEOUT_MS + KILL_GRACE_MS + 2_500;
const HOLDER = `
const { spawn } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const g = spawn(process.execPath, ["-e", "setTimeout(() => {}, ${SLEEP_MS})"], { stdio: "inherit" });
writeFileSync(process.argv[2], String(g.pid));
setTimeout(() => {}, ${SLEEP_MS});
`;

let dir: string | null = null;
let pids: number[] = [];

afterEach(async () => {
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
  pids = [];
  if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  dir = null;
});

/** A temp dir holding the given scripts; commands run with it as cwd, so paths stay bare. */
async function scripts(files: Record<string, string>): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), "run-command-"));
  for (const [name, body] of Object.entries(files)) await writeFile(join(dir, name), body, "utf8");
  return dir;
}

/** The grandchild's pid, registered for cleanup; null if the holder never got that far. */
async function grandchild(cwd: string): Promise<number | null> {
  try {
    const pid = Number(await readFile(join(cwd, "grandchild.pid"), "utf8"));
    pids.push(pid);
    return pid;
  } catch {
    return null;
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("runCommand, ordinary runs", () => {
  it("reports success with the command's stdout", async () => {
    const cwd = await scripts({ "ok.cjs": `process.stdout.write("hello")` });
    const r = await runCommand(cwd, "node", ["ok.cjs"], 30_000);
    expect(r.ok).toBe(true);
    expect(r.timedOut).toBe(false);
    expect(r.stdout).toBe("hello");
  });

  it("reports a non-zero exit with its stderr", async () => {
    const cwd = await scripts({ "fail.cjs": `process.stderr.write("boom"); process.exit(3)` });
    const r = await runCommand(cwd, "node", ["fail.cjs"], 30_000);
    expect(r.ok).toBe(false);
    expect(r.timedOut).toBe(false);
    expect(r.stderr).toContain("boom");
  });

  it("fails cleanly for a command that does not exist", async () => {
    const cwd = await scripts({});
    const r = await runCommand(cwd, "forkctl-no-such-command-xyz", [], 30_000);
    expect(r.ok).toBe(false);
    expect(r.timedOut).toBe(false);
    expect(r.stderr.length).toBeGreaterThan(0);
  });
});

describe("a timed-out command settles at its deadline", () => {
  it("a plain sleeper", async () => {
    const cwd = await scripts({ "sleep.cjs": `setTimeout(() => {}, ${SLEEP_MS})` });
    const started = Date.now();
    const r = await runCommand(cwd, "node", ["sleep.cjs"], TIMEOUT_MS);
    const elapsed = Date.now() - started;
    expect(r.timedOut).toBe(true);
    expect(r.ok).toBe(false);
    expect(elapsed).toBeGreaterThanOrEqual(TIMEOUT_MS - 50);
    expect(elapsed).toBeLessThan(SETTLE_BOUND_MS);
  }, 15_000);

  it("even when a grandchild holds the pipes", async () => {
    const cwd = await scripts({ "holder.cjs": HOLDER });
    const started = Date.now();
    const r = await runCommand(cwd, "node", ["holder.cjs", "grandchild.pid"], TIMEOUT_MS);
    const elapsed = Date.now() - started;
    await grandchild(cwd);
    expect(r.timedOut).toBe(true);
    expect(r.ok).toBe(false);
    expect(elapsed).toBeGreaterThanOrEqual(TIMEOUT_MS - 50);
    expect(elapsed).toBeLessThan(SETTLE_BOUND_MS);
  }, 15_000);

  it.skipIf(process.platform !== "win32")("[win32] the timeout ends the whole tree, grandchild included", async () => {
    const cwd = await scripts({ "holder.cjs": HOLDER });
    await runCommand(cwd, "node", ["holder.cjs", "grandchild.pid"], TIMEOUT_MS);
    const pid = await grandchild(cwd);
    expect(pid, "the holder never started its grandchild").not.toBeNull();
    // taskkill runs on its own; give it a moment to finish. Before the fix the
    // command was still running here, with SLEEP_MS left to go.
    await new Promise((r) => setTimeout(r, 1_000));
    expect(alive(pid!)).toBe(false);
  }, 15_000);
});
