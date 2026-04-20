import { describe, it } from "vitest";

/**
 * Covers design §7 (snapshot & rollback) + §5 non-git-repo row.
 *
 * Deferred until `src/lib/rename/snapshot.ts` (or equivalent) lands. The
 * fixture helper `initGitRepo()` already exists for git-repo tests; non-git
 * tests just skip the `git init`.
 *
 * Bounds:
 *   - Snapshots written under `.forkable/snapshots/rename-<ts>/`
 *   - git: record pre-rename HEAD SHA + `git stash push --include-untracked`
 *   - non-git: tarball of working tree (excluding standard excludes)
 *   - Snapshots kept 7 days, GC'd on next forkable command
 */

describe("snapshot — git repo", () => {
  it.todo("records pre-rename HEAD SHA under .forkable/snapshots/rename-<ts>/");
  it.todo("captures uncommitted changes via git stash push --include-untracked");
  it.todo("rollback restores HEAD and pops the stash when one exists");
});

describe("snapshot — non-git repo (§5)", () => {
  it.todo("writes a tarball of the working tree");
  it.todo("tarball excludes node_modules/, dist/, .git/");
  it.todo("rollback extracts the tarball over the working tree");
});

describe("snapshot — GC", () => {
  it.todo("removes snapshot directories older than 7 days on next forkable command");
  it.todo("retains recent snapshots untouched");
});
