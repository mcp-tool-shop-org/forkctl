# Layer 7 v2 — `--brand` mode

> **Status:** DRAFT (design, not yet implemented).
> **Target:** next forkctl release (v2.1.0 or v2.0.x, TBD by scope).
> **Author:** mcp-tool-shop
> **Date:** 2026-04-20
> **Supersedes (scope):** the `v1.2-handoff.md` polyglot-first ordering discarded in the v2.0.0 rename branch. Polyglot bundle is now secondary to this doc.

## 1. Why this exists

Layer 7 v1.1.0 is a **content rename engine**. We learned, by dogfooding it to rename
`forkable` → `forkctl` (shipped as v2.0.0, 2026-04-20), that product-brand renames are
a *superset* of content renames. Layer 7 saved ~50% of the rename work; the other 50%
was a targeted word-boundary sed pass taking ~10 minutes of hand-scripting.

Today's tagline — "AST-aware polyglot rebrand" — oversells what the default mode does
for a product rename. The honest framing is two engines:

- **Content rename engine** (what ships in v1.1.0): word-boundary-disciplined rewrite
  of identifiers, prose, and structured identity. Conservative. Safe default.
- **Product-brand rename engine** (this doc): the superset. Adds categorized targets
  that a product rename needs and a content rename should *not* touch by default.

`--brand <name>` is the opt-in flag that promotes the tool from the first engine to
the second without widening the default behavior.

### What Layer 7 v1.1.0 already nails (and we do NOT regress)

- Structured identity via editors — package.json, astro.config, bin names, repo URLs,
  LICENSE holders. One pass, clean diff.
- Markdown prose via fence-aware text rewrite — catches the bulk of README / handbook
  mentions.
- Word-boundary discipline — `forkableness`, `unforkable`, the English adjective
  `make-forkable` correctly preserved across the whole dogfood run.
- Lockfile regen, case-insensitive path rename two-step, asset-regen manifest.

`--brand` builds on top of these. It never replaces them, never relaxes their word
boundaries, and never rewrites the files they own with looser rules.

## 2. Positioning vs prior art

| Tool | Case-variant aware? | AST-aware? | Categorized brand targets? | Notes |
|---|---|---|---|---|
| tpope/vim-abolish `:Subvert` | Yes (~15 years) | No | No (incidental matches) | Canonical reference for the case-variant primitive. |
| kootenpv/rebrand (Python) | Yes | No | No | Always-on, no opt-in mode. |
| ast-grep with `convert` transform | Yes (hand-authored) | Yes | No | Author builds the matrix per rule. |
| cookiecutter / copier | Yes (author-responsibility Jinja filters) | No | No | Template-time only — wrong layer. |
| comby | Partial (no built-in matrix) | Structural | No (via `where` DSL) | Rule engine we'll borrow from. |
| Nx `@nx/workspace:mv` | No | N/A | N/A | Project-level move, not identifier-level. |
| **forkctl v1.1.0 (today)** | Partial | **Yes (ts-morph + ast-grep)** | No | Conservative default. |
| **forkctl `--brand` (this doc)** | **Yes** | **Yes** | **Yes** | The contribution. |

**The contribution is naming the categories as first-class.** Nobody else treats
`<product>_<snake>` MCP tool names, `UPPERCASE_<PRODUCT>_*` env vars, `<Product>Error`
class suffixes, and product-name markdown-header literals as distinct types of match
with per-category opt-in, deny-list, and dry-run count. vim-abolish catches
`FORKABLE_*` *incidentally* because CONSTANT_CASE is in its matrix — it does not know
the hit is an env var.

## 3. Tool surface

### CLI

```bash
forkctl rename plan  <path> --from <old> --to <new> --brand [--strings <mode>] [--categories <list>]
forkctl rename apply <path> --plan <plan.json>
```

`--brand` without a value is a boolean alias for `--brand <to>` — the new canonical
brand token is the same as `--to` in 99% of cases. Power users can pass `--brand
<other>` if the brand token differs from the package name (rare, e.g. when the package
is `@scope/forkctl` but the brand is just `forkctl`).

### New flags

| Flag | Default | Purpose |
|---|---|---|
| `--brand` | off | Master switch for category-aware rebrand rules. Implies `--strings=safe` unless overridden. |
| `--strings <mode>` | `off` | Four-mode string-literal gate (see §5). Only meaningful with `--brand`. |
| `--categories <list>` | all | Subset of brand categories to apply (comma-sep: `identifiers,env-vars,tool-names,error-classes,headers`). Default is all. |
| `--brand-strings` | off | Legacy alias for `--strings=safe`, retained for flag-ergonomic parity with prior discussion. |

### MCP

The `forkctl_rename_plan` Zod schema gains four optional fields:

```ts
brand?: boolean | string;             // boolean = use `to` as brand token
strings?: "off" | "safe" | "review" | "all";  // default "off"
categories?: BrandCategory[];         // default: all 5 categories
brandConfig?: {
  allow?: string[];                   // glob / function-name allowlist (extends built-ins)
  deny?: string[];                    // glob / path deny list (extends built-ins)
};
```

All four fields flow through `src/dispatch.ts` like every other input — validated once,
audit-logged, never re-parsed downstream.

## 4. Brand categories — first-class targets

Each category has: (a) a detector, (b) a rewrite rule, (c) a deny-list, (d) a dry-run
count, (e) per-hit entries in the plan diff so users can veto a category whole-cloth
or a single hit.

### 4.1 Identifiers — prefix rename (closes the `ForkableError` miss)

**Root cause of the v2.0.0 dogfood miss:** Pass B's ast-grep rule only targeted
`identifier` + `type_identifier` kinds, and had no `transform.replace` block. That
means enum members (`property_identifier`), method-definition positions
(`property_identifier`), and shorthand-property positions
(`shorthand_property_identifier`) were invisible, and even the matches it *did* find
had no prefix-rewrite mechanism — so only full-word `Forkable` hits got rewritten, not
`ForkableError` or `ForkableErrorCode`.

**Fix, two-layer:**

**Pass B (ast-grep) gains a prefix rule:**

```yaml
id: brand-identifier-prefix
language: TypeScript
rule:
  any:
    - kind: identifier
    - kind: type_identifier
    - kind: property_identifier
    - kind: shorthand_property_identifier
  regex: '^<Old>'                     # <Old> is the PascalCase variant
transform:
  NEW:
    replace:
      source: $$$MATCH
      replace: '^<Old>(?<TAIL>.*)'
      by: '<New>$TAIL'
fix: $NEW
```

Three rules per language — PascalCase, camelCase, snake_case — driven by the
`case-anything` matrix (see §6).

**Pass C (ts-morph) gains a declaration-iteration sweep:** walk every `SourceFile`,
collect every `Declaration` whose name starts with the brand's PascalCase prefix, call
`Identifier.rename('<New>' + tail)`. This is the same API VS Code's "Rename Symbol"
uses — it resolves re-exports, barrels, aliased re-exports (`export { X as Y }`), and
shadowing correctly. ts-morph is already a dependency from v1.1.0's Pass C; no new weight.

**Detector runs Pass B first** (cheap, syntactic) **then Pass C** (semantic, slower)
so Pass C can skip files Pass B already flagged clean.

**Deny-list:** `node_modules/**`, `vendor/**`, `dist/**`, built-in lockfile list. No
category-specific deny.

### 4.2 Env vars — `UPPERCASE_<OLD>_*` → `UPPERCASE_<NEW>_*`

**Detector:** identifier kind `identifier` OR `property_identifier` OR string literal
matching regex `^<OLD_UPPER>_[A-Z0-9_]+$`, where `<OLD_UPPER>` is the SCREAMING_SNAKE
variant of the brand.

**Rewrite:** replace the `<OLD_UPPER>_` prefix with `<NEW_UPPER>_`, preserve the tail.

**Deny-list:** values of keys literally named `env`, `ENV`, or matching `/(^|_)ENV$/`
in object literals that are *not* the env object being renamed. This handles cases
where the user intentionally stores external env-var names (e.g. a config that reads
`FORKABLE_API_KEY` from someone *else's* product).

**Plan-diff grouping:** env vars cluster into a single reviewable block so the user
sees "12 env-var renames across 7 files" as one line they can veto with one keystroke.

### 4.3 Tool-name strings — `<old>_<snake>` in MCP tool registries

This is the biggest gap from the v2.0.0 dogfood: all 22 `forkable_*` MCP tool names
were untouched. For MCP-server adopters, these strings are the public API.

**Detector:** string literal (`string_fragment` kind) matching regex
`^<old>_[a-z0-9_]+$`, inside an array literal or object key position inside files
matching the glob set `**/registry.ts`, `**/tools.ts`, `**/server.ts`, `**/mcp.ts`,
`**/*.tool.ts`. The glob set is user-extensible via `brandConfig.toolFilePatterns`.

**Rewrite:** replace the `<old>_` prefix with `<new>_`.

**Deny-list:** any file matching `**/*.test.*`, `**/__fixtures__/**`. Tool-name
fixtures in tests may intentionally assert the old surface (e.g. migration tests).

**Why this is its own category:** the detector uses file-path heuristics on top of AST
position — env-var and identifier categories don't. Keeping it separate means users
with non-MCP projects can disable it via `--categories=identifiers,env-vars,...`
without losing the other categories.

### 4.4 Error-class identifiers — `<Old>Error*` → `<New>Error*`

Technically a subset of 4.1 (prefix rename), but treated as its own category for
**dry-run reportability**: users want to see "3 error-class renames" as a line they can
review independently. Implementation is a specialization of the Pass B + Pass C rules
with `regex: '^<Old>(Error|ErrorCode|Exception)'`.

**Pass C still owns the canonical rename.** Pass B is the textual safety net for files
ts-morph can't reach (comments referencing the class name, markdown docs, `.d.ts` in
dist folders).

### 4.5 Markdown header literals — `# <old> ...` and friends

**Detector:** string literals inside template-literal-free contexts, where the literal
matches regex `^(#{1,6}\s+|\*\*)?<old>\b` **and** the enclosing call is on the
user-facing allowlist (see §5). This catches things like:

```ts
await fs.writeFile(planPath, `# ${oldName} rename plan diff\n...`);
```

**Rewrite:** replace the token, preserve the rest of the template.

**Deny-list:** literals inside `process.env[...]`, `import`/`require` paths, SQL
tagged templates, `**/__fixtures__/**`. See §5 for the full deny set.

## 5. String-literal gate — four modes

Borrowed from i18next-parser / lingui: extraction tools classify literals by
**callsite context, not content**. We invert the same doctrine to classify
brand-safe rewrites.

```
--strings=off     # current v1.1.0 default (no string-literal rewrites)
--strings=safe    # rewrite only when enclosing call is on allowlist; auto-apply
--strings=review  # deny-list wins; ALL other hits stage for per-hunk confirm
                  # (git add -p UX)
--strings=all     # deny-list wins; rewrite everything else automatically
```

### Allowlist (when `--strings=safe`)

Rewrite a literal *only* if its enclosing expression is one of:

- `console.log` / `console.error` / `console.warn` / `console.info`
- `process.stderr.write` / `process.stdout.write`
- `chalk.*` / `ora(...)` / `cli-table` / `kleur.*`
- `throw new Error(...)` / `throw new <anyProductError>(...)` (the class inherits
  Error; detected by `extends Error` lookup through ts-morph)
- `commander.description` / `commander.addHelpText` / yargs `describe` / `usage` /
  `meow` help-string contracts
- `logger.info` / `logger.warn` / `logger.error` / any function name in the user's
  `brandConfig.allow` list
- JSX text content (for Astro landing pages and React handbook fragments) and
  attribute values for `title`, `aria-label`, `placeholder`, `i18nKey`, `description`

### Deny-list (always on, wins over allow)

Never rewrite a literal whose parent is:

- `import_statement`, `import_clause`, `export_statement`, or a `require(...)` /
  dynamic `import(...)` call argument → module path
- A member/index access on `process.env`, `import.meta.env`, or any identifier
  matching `/env|ENV|config|Config/i` → env var key (rename happens via category 4.2, not here)
- A tagged template named `/sql|query|raw/i` → schema identifier
- A key in an object passed to `JSON.stringify` or written to a `.json` / `.yaml` /
  `.toml` file (those are data, not prose)
- A URL regex match whose host/path references the old brand as a canonical URL —
  surfaces to a **separate review queue** rather than auto-rewriting. Canonical URL
  choice is a human call (GitHub auto-redirects, but the user may have external links
  they want preserved).
- Inside files matching `**/*.test.*`, `**/__fixtures__/**`, `**/fixtures/**`,
  `**/*.snap`, `**/testdata/**`

### Why `review` is likely the right default when `--brand` is on

`safe` is conservative enough to miss the `# forkable rename plan diff` header (object
literal inside `fs.writeFile`, not inside an allowlisted call). `all` is too
aggressive. `review` lands the user in a git-add-p-style interactive loop where each
uncategorized hit is a confirmed y/n — this is the same UX that made `git add -p` the
safe default for staging.

**Default: `--brand` sets `--strings=review` unless overridden.** Scripted usage can
downgrade to `safe` for auto-apply.

## 6. Case-variant matrix — `case-anything`

Dependency choice: **`case-anything`** (nano footprint, tree-shakeable, 14 case
functions, pure-regex word splitter). Not `change-case` (heavier, ESM-fragmented
post-v5), not `humps` (camel/snake only — too narrow).

Given `--brand forkctl`, `case-anything` derives the 5 canonical variants used across
every category:

| Variant | Example | Used by |
|---|---|---|
| `camelCase` | `forkctl` | identifiers (value position), tool-name strings |
| `PascalCase` | `Forkctl` | identifiers (type position), error-classes |
| `snake_case` | `fork_ctl` | (rare; included for completeness) |
| `kebab-case` | `fork-ctl` | CLI flags, file paths, npm package fragments |
| `CONSTANT_CASE` | `FORKCTL` / `FORK_CTL` | env vars |

The matrix is built **once per `rename plan` invocation** and threaded through every
pass. Individual passes don't re-derive variants.

### Multi-word brand edge case

If the brand is multi-word (`fork-ctl`, `FooBar`), `case-anything` splits it with its
built-in tokenizer. We trust the library's splitter; we do *not* try to detect
"intended word boundaries" ourselves — that's a rabbit hole and the user can always
pass a pre-tokenized form via `brandConfig.variants` if the auto-split is wrong.

## 7. Plan-diff format — per-category counts

Today's `rename-plan.json` is flat. v2 gains a `brand.categories` block:

```json
{
  "version": "2",
  "brand": {
    "token": "forkctl",
    "variants": {
      "camelCase": "forkctl",
      "PascalCase": "Forkctl",
      "kebab-case": "fork-ctl",
      "CONSTANT_CASE": "FORKCTL"
    },
    "categories": {
      "identifiers": { "hits": 47, "files": 12, "stagedForReview": 0 },
      "envVars":     { "hits": 12, "files":  7, "stagedForReview": 0 },
      "toolNames":   { "hits": 22, "files":  2, "stagedForReview": 0 },
      "errorClasses":{ "hits":  3, "files":  1, "stagedForReview": 0 },
      "headers":     { "hits":  8, "files":  5, "stagedForReview": 8 }
    },
    "stringsMode": "review"
  }
}
```

CLI summary at the end of `plan`:

```
Plan written: .forkctl/rename-plan.json (.diff alongside)

Brand categories:
  identifiers   47 hits across 12 files
  env-vars      12 hits across  7 files
  tool-names    22 hits across  2 files
  error-classes  3 hits across  1 file
  headers        8 hits across  5 files (staged for review)

Next: forkctl rename apply . --plan .forkctl/rename-plan.json
```

Users can veto a category by re-running plan with `--categories` excluding it.

## 8. History and attribution — what we do NOT touch

Two deny-globs ship by default and cannot be disabled without an explicit flag:

1. **`CHANGELOG.md` entries below the first `## [<old-version>]` header** where
   `<old-version>` predates the rename. These reference old product identity for
   historical accuracy; rewriting them is a lie.
2. **`HISTORY.md`** in its entirety.

Override: `--brand-rewrite-history` (destructive). Ships disabled.

This rule is stolen directly from kootenpv/rebrand's "warn on binary/image files"
mentality, applied to a different failure mode: the user will almost never want to
erase the record that the product used to be called something else.

## 9. Rollout plan

### Phase 1 — Pass B/C fixes (hardening the existing engine)

Ship the ast-grep rule correction and ts-morph declaration-iteration sweep **without**
the `--brand` flag. This closes the `ForkableError` / `ForkableErrorCode` /
`makeForkableTool` gap for all users today, on the conservative default.

Impact: the v1.1.0 content rename engine catches *more* identifiers. Not a widening
of scope — a correctness fix for the scope we already claim.

Patch version bump. ~1–2 days including tests.

### Phase 2 — `--brand` flag + categories + case-anything

Add the flag, the category infrastructure, the `case-anything` dependency, and
categories 4.1 (promoted from phase 1) and 4.4 (error classes).

Minor version bump. ~2–3 days.

### Phase 3 — Env vars + tool names

Categories 4.2 and 4.3 — these two are the highest-value for MCP-server adopters and
share the "file-pattern + AST position" detector shape.

Same minor bump, or a `.1` if phase 2 ships first.

### Phase 4 — `--strings` gate (`safe` + `review`)

The four-mode string-literal gate, starting with `safe` and `review`. `all` ships in
the same phase as a power-user escape hatch.

~3–4 days — `review` mode is the most UX-heavy piece (interactive loop, confirm per
hunk, remember deferred hunks across `plan`/`apply` boundary).

### Phase 5 — Polyglot bundle — **SHIPPED**

`@ast-grep/lang-*` dynamic registration via `registerDynamicLanguage`. 11 languages
added as `optionalDependencies`: python, rust, go, java, ruby, csharp, cpp, c, bash,
yaml, json. At module-load the symbols pass tries to dynamically import each package;
successes are registered and added to `RESOLVED_LANGS`; failures fall through to the
existing `RENAME_LANG_UNAVAILABLE` warning path (no regression for users who skip
optional deps). `parse()` is called with the language name string — works uniformly
for built-in and dynamically-registered langs.

Polyglot coverage verified end-to-end for Python, Rust, and Go on a smoke fixture:
all identifier hits rewrite correctly.

## 10. Non-goals

- **Automatic URL canonicalization.** We stage URL rewrites for review; we never auto-decide
  whether `github.com/old-org/old-repo` should become `github.com/new-org/new-repo`.
  GitHub auto-redirects old URLs; many users intentionally keep some external URLs pointed
  at the old name for SEO / inbound-link continuity. Human call.
- **Git history rewrite by default.** `--brand-rewrite-history` exists; it is opt-in
  and destructive.
- **Binary/image rewrite.** Logos and PNG/ICO assets flagged in the asset-regen
  manifest (unchanged from v1.1.0). `--brand` does not alter this.
- **Non-TS language semantic rename.** Phase 5 (polyglot bundle) is ast-grep textual
  only. Semantic rename for Python/Rust/Go would require per-language LSP — not in
  scope for `--brand`.

## 11. Open questions

- Should `--strings=review` persist its "deferred" hits to `.forkctl/rename-plan.json`
  so users can re-run `plan` and pick up where they left off? (Leaning yes.)
- Should the `brandConfig.allow` / `brandConfig.deny` DSL borrow comby's `where`
  syntax verbatim, or roll our own minimal version? (Leaning minimal own — comby's
  `where` is powerful but learning-curve heavy.)
- Is `--brand` the right flag name, or should it be `--rebrand`? (`--brand` is
  shorter; `--rebrand` is clearer. Currently leaning `--brand`.)
- Should the 5-category default include or exclude category 4.3 (tool-names) on
  non-MCP projects? Auto-detection (`package.json` has `@modelcontextprotocol/sdk`)
  is cheap and arguably the right default.

## 12. Prior art and sources

- [tpope/vim-abolish `:Subvert`](https://github.com/tpope/vim-abolish) — canonical
  15-year-old case-variant rewrite primitive.
- [kootenpv/rebrand](https://github.com/kootenpv/rebrand) — Python case-preserving
  refactor tool; always-on, no opt-in mode.
- [case-anything](https://github.com/mesqueeb/case-anything) — case-variant library
  we will take a dependency on.
- [ast-grep Transformation reference](https://ast-grep.github.io/reference/yaml/transformation.html)
  — `transform.replace` with named capture groups (the mechanism Pass B was missing).
- [ast-grep Composite Rule](https://ast-grep.github.io/guide/rule-config/composite-rule.html)
  — `all`/`any`/`not`/`inside`/`has` composition for the string-literal gate.
- [i18next-parser](https://github.com/i18next/i18next-parser) /
  [lingui custom-extractor](https://lingui.dev/guides/custom-extractor) — callsite-
  allowlist doctrine we invert for §5.
- [comby `where` rules](https://comby.dev/docs/advanced-usage) — syntax reference for
  the optional config DSL.
- [repren](https://github.com/jlevy/repren) — casefold-table approach and
  `--dry-run` UX; closest pre-forkctl tool.
- [darkroomengineering/codemods](https://github.com/darkroomengineering/codemods) —
  real-world package rename (`@studio-freight` → `@darkroom.engineering`); read their
  exclusion set for real-world deny-list intuitions.
- [ts-morph rename](https://ts-morph.com/manipulation/renaming) — `Identifier.rename()`
  is the single-API call that closes the Pass C gap.
- `memory/forkctl.md` — the v2.0.0 rename dogfood findings that motivated this doc.
- `memory/forkable-v1.2-handoff.md` — the superseded polyglot-first plan.
