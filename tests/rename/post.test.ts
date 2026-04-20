import { describe, it } from "vitest";

/**
 * Covers design §3 Pass E (post-rename) + F6.
 *
 * Hard-case matrix (§5) rows covered here:
 *   - `package-lock.json` → deleted + regenerated
 *   - Directory `src/forkable/` → `git mv` to `src/splitshift/`, imports updated
 *   - Case-insensitive FS rename `foo` → `Foo` via `.tmp` suffix
 *   - `favicon.png` → listed in asset-regen manifest
 *
 * Deferred until `src/lib/rename/post.ts` lands. The fixture already ships
 * with `package-lock.json`, `src/forkable/*`, and `site/public/favicon.png`
 * so these todos can be promoted without changing the fixture.
 */

describe("post pass — lockfile regeneration (F6)", () => {
  it.todo("detects npm (package-lock.json), deletes, runs `npm install`");
  it.todo("detects pnpm (pnpm-lock.yaml), deletes, runs `pnpm install`");
  it.todo("detects yarn (yarn.lock), deletes, runs `yarn install`");
  it.todo("detects cargo (Cargo.lock), deletes, runs `cargo generate-lockfile`");
  it.todo("detects poetry (poetry.lock), deletes, runs `poetry lock`");
  it.todo("detects uv (uv.lock), deletes, runs `uv lock`");
  it.todo("when `lockfileStrategy: skip`, does NOT delete or regenerate");
  it.todo("on regen failure, surfaces RENAME_LOCKFILE_REGEN_FAILED with stderr in details");
});

describe("post pass — path renames (F6)", () => {
  it.todo("git-mv's `src/forkable/` → `src/splitshift/` in a git repo");
  it.todo("falls back to fs rename in a non-git repo");
  it.todo("updates import specifiers that pointed at the old path");
  it.todo("handles case-only rename `foo` → `Foo` via `.tmp` two-step");
  it.todo("normalizes Windows path separators to POSIX internally, converts on write");
});

describe("post pass — asset regeneration manifest (F6)", () => {
  it.todo("writes `.forkable/asset-regen.json` listing favicon.png + og-image.png");
  it.todo("manifest entries carry path, detected kind, and rationale");
  it.todo("never modifies the binary assets themselves");
});

describe("post pass — verify hook (F6)", () => {
  it.todo("invokes `npm run verify` when scripts.verify exists");
  it.todo("records verify output on the receipt's perLayer.post.verify");
  it.todo("verify failure does NOT fail the rename — reported as post-condition");
});

describe("post pass — idempotence", () => {
  it.todo("running post pass a second time on an already-renamed tree is a no-op");
});
