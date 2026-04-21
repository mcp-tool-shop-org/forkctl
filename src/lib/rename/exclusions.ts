/**
 * Always-excluded directories and file patterns (per design §6).
 *
 * Used by every pass that walks the filesystem. Built-in set is non-negotiable;
 * users can add additional glob patterns via the `exclude` input.
 */

export const ALWAYS_EXCLUDED_DIRS: readonly string[] = [
  ".git",
  "node_modules",
  "bower_components",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".astro",
  "target",
  "__pycache__",
  ".venv",
  "venv",
  "env",
  "coverage",
  ".forkctl",
];

export const BINARY_EXTENSIONS: readonly string[] = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".webp",
  ".bmp",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".wasm",
  ".so",
  ".dll",
  ".dylib",
  ".exe",
  ".bin",
  ".mp3",
  ".mp4",
  ".webm",
  ".ogg",
  ".wav",
  ".pdf",
  ".zip",
  ".tar",
  ".tar.gz",
  ".tgz",
  ".gz",
  ".br",
  ".7z",
  ".rar",
  ".class",
];

export const MINIFIED_SUFFIXES: readonly string[] = [
  ".min.js",
  ".min.css",
  ".map",
];

/** Assets that are never rewritten — listed in the regen manifest instead. */
export const ASSET_REGEN_EXTENSIONS: readonly string[] = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".webp",
  ".svg",
];

/** Asset filename stems that always go to the regen manifest (even if svg). */
export const ASSET_REGEN_STEMS: readonly string[] = [
  "favicon",
  "og-image",
  "og_image",
  "logo",
  "icon",
];

/** Returns true if the given POSIX-style path segment list hits an excluded dir. */
export function isInExcludedDir(parts: readonly string[]): boolean {
  for (const p of parts) {
    if (ALWAYS_EXCLUDED_DIRS.includes(p)) return true;
  }
  return false;
}

/** Returns true if the file extension is in the binary denylist. */
export function isBinaryByExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  if (MINIFIED_SUFFIXES.some((s) => lower.endsWith(s))) return true;
  for (const ext of BINARY_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

export function isAssetNeedingRegen(filename: string): boolean {
  const lower = filename.toLowerCase();
  const stem = lower.replace(/\.[^.]+$/, "");
  if (ASSET_REGEN_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    // All bitmap images. Also SVG if the stem matches the known brand-asset list.
    if (lower.endsWith(".svg")) {
      return ASSET_REGEN_STEMS.some((s) => stem === s || stem.endsWith(`/${s}`));
    }
    return true;
  }
  return false;
}

/**
 * Quickest dumb check: read first 4KB, return true if a null byte appears.
 * Catches binaries that slip past the extension allowlist.
 */
export function looksBinary(buf: Buffer): boolean {
  const end = Math.min(buf.length, 4096);
  for (let i = 0; i < end; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}
