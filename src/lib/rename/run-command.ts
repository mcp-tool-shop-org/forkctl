/**
 * Run one command for the rename passes, with a timeout that actually ends it.
 *
 * Shared by the snapshot/rollback pass and the post-rename pass, which each
 * carried their own copy. A timeout ends the whole process tree (see
 * kill-tree.ts) and the call settles at the deadline plus a short grace, so a
 * timed-out `npm install` cannot go on writing into the tree while the caller
 * rolls back.
 */

import { spawn } from "node:child_process";
import { KILL_GRACE_MS, killTree } from "../kill-tree.js";

export interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  /** True when the timeout fired, whatever the exit code turned out to be. */
  timedOut: boolean;
}

export function runCommand(cwd: string, cmd: string, args: string[], timeoutMs = 120_000): Promise<CommandResult> {
  return new Promise((resolve) => {
    // `shell` on Windows is what resolves npm/pnpm .cmd shims.
    const proc = spawn(cmd, args, { cwd, shell: process.platform === "win32" });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    let grace: NodeJS.Timeout | undefined;

    const finish = (ok: boolean, errText?: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(grace);
      resolve({ ok: ok && !timedOut, stdout, stderr: errText ?? stderr, timedOut });
    };

    proc.stdout?.on("data", (d) => { stdout += d.toString(); });
    proc.stderr?.on("data", (d) => { stderr += d.toString(); });
    timer = setTimeout(() => {
      timedOut = true;
      killTree(proc);
      // The tree is gone and 'exit' follows, but settle anyway if something
      // still holds on: the deadline has passed.
      grace = setTimeout(() => finish(false), KILL_GRACE_MS);
    }, timeoutMs);
    proc.on("error", () => finish(false, stderr || "command failed to start"));
    proc.on("exit", (code) => finish(code === 0));
  });
}
