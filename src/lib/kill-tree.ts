/**
 * Ending a timed-out child process, everywhere.
 *
 * On Windows the rename passes run their command with `shell: true`, so the
 * child they hold is cmd.exe and the real command is cmd.exe's child.
 * `child.kill()` ends cmd.exe only: the command keeps running, keeps the stdio
 * pipes open, and goes on writing into the working tree after the timeout was
 * reported. (Git for Windows' git.exe is itself a launcher with the same shape.)
 *
 * `killTree` ends the whole tree on Windows (`taskkill /T /F`). Elsewhere the
 * child is the command itself, so SIGKILL ends it; anything the command
 * started can still hold the pipes, so callers also settle KILL_GRACE_MS after
 * the kill instead of waiting for the child to finish on its own.
 */

import { spawn, type ChildProcess } from "node:child_process";

/** How long a caller waits after killing a timed-out child before settling anyway. */
export const KILL_GRACE_MS = 2_000;

export function killTree(child: ChildProcess): void {
  if (process.platform === "win32" && child.pid !== undefined) {
    const tk = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    tk.on("error", () => killChild(child));
    return;
  }
  killChild(child);
}

function killChild(child: ChildProcess): void {
  try {
    child.kill("SIGKILL");
  } catch {
    /* already gone */
  }
}
