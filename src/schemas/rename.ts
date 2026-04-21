import { z } from "zod";

/**
 * Schemas for the rename layer (L7 — v1.1.0).
 *
 * User-facing inputs: `from` / `to` names + path. Everything else has sensible
 * defaults. Plan/apply/rollback share the path; apply consumes a plan artifact.
 */

/** A canonical product name. No whitespace, no path separators, 1-80 chars. */
const NameSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, {
    message:
      "Name must start with a letter or digit and contain only letters, digits, dot, underscore, or hyphen.",
  });

/** The set of passes we execute. `identity` → A, `symbols` → B, `deep-ts` → C, `textual` → D, `post` → E. */
export const RenameLayerSchema = z.enum([
  "identity",
  "symbols",
  "deep-ts",
  "textual",
  "post",
]);
export type RenameLayer = z.infer<typeof RenameLayerSchema>;

/**
 * `--strings` gate (design §5). Controls the string-literal rewrite mode of
 * the symbols pass.
 *   off     — no string-literal rewrites at all.
 *   safe    — reserved for callsite-allowlist mode (same as `review` today).
 *   review  — rewrites apply but emit STRING_REWRITE_PENDING_REVIEW warnings
 *             per hit so users can audit before apply.
 *   all     — current v1.1.0 behavior: rewrite everything, warn per hit.
 */
export const StringsModeSchema = z.enum(["off", "safe", "review", "all"]);
export type StringsMode = z.infer<typeof StringsModeSchema>;

export const RenamePlanInputSchema = z.object({
  path: z.string().min(1),
  from: NameSchema,
  to: NameSchema,
  layers: z
    .array(RenameLayerSchema)
    .optional()
    .default(["identity", "symbols", "textual", "post"]),
  exclude: z.array(z.string()).optional().default([]),
  lockfileStrategy: z.enum(["regenerate", "skip"]).optional().default("regenerate"),
  historyRewrite: z.boolean().optional().default(false),
  deepTs: z.boolean().optional(),
  lspTier: z.boolean().optional().default(false),
  preserveComments: z.boolean().optional().default(false),
  preserveHistory: z.boolean().optional().default(true),
  /**
   * Product-brand rename mode (design/brand-mode.md). When true, per-category
   * counts are emitted in the plan output, enabling veto-by-category via
   * `--categories`. Default `false` — conservative behavior unchanged.
   */
  brand: z.boolean().optional().default(false),
  /**
   * String-literal rewrite gate. Default is `all` (v1.1.0 behavior). When
   * `brand` is true and `stringsMode` is not explicitly set, the plan builder
   * defaults to `review` so users opt into aggressive string rewrites.
   */
  stringsMode: StringsModeSchema.optional(),
});
export type RenamePlanInput = z.infer<typeof RenamePlanInputSchema>;

export const RenameApplyInputSchema = z.object({
  path: z.string().min(1),
  plan: z.string().min(1).describe("Path to a rename-plan.json file produced by `plan`."),
  verify: z.boolean().optional().default(true),
});
export type RenameApplyInput = z.infer<typeof RenameApplyInputSchema>;

export const RenameRollbackInputSchema = z.object({
  path: z.string().min(1),
  snapshotId: z.string().optional(),
});
export type RenameRollbackInput = z.infer<typeof RenameRollbackInputSchema>;

/** A casing variant entry — "from" form + "to" form + whether user opted out. */
export const VariantEntrySchema = z.object({
  from: z.string(),
  to: z.string(),
  enabled: z.boolean().default(true),
});
export type VariantEntry = z.infer<typeof VariantEntrySchema>;

export const VariantKeySchema = z.enum([
  "kebab-case",
  "snake_case",
  "camelCase",
  "PascalCase",
  "SCREAMING_SNAKE",
  "dot.case",
  "Title Case",
]);
export type VariantKey = z.infer<typeof VariantKeySchema>;

/**
 * A single unit of change emitted by any pass. Identity / symbols / textual
 * each return `RenameChange[]` in dry-run and apply mode.
 */
export const RenameChangeSchema = z.object({
  file: z.string(),
  layer: RenameLayerSchema,
  /** Human-readable kind — e.g. `package.json:name`, `identifier`, `comment`, `markdown-text`. */
  kind: z.string(),
  /** Optional line number in source (1-based), when the pass has one. */
  line: z.number().int().positive().optional(),
  /** The string value being replaced. */
  before: z.string(),
  /** The string value being written. */
  after: z.string(),
});
export type RenameChange = z.infer<typeof RenameChangeSchema>;

export const RenameWarningSchema = z.object({
  code: z.string(),
  message: z.string(),
  file: z.string().optional(),
});
export type RenameWarning = z.infer<typeof RenameWarningSchema>;

export const RenamePlanSchema = z.object({
  from: z.string(),
  to: z.string(),
  path: z.string(),
  createdAt: z.string(),
  variants: z.record(VariantKeySchema, VariantEntrySchema),
  layers: z.object({
    identity: z
      .object({
        files: z.number().int().nonnegative(),
        hotspots: z.array(z.string()),
        changes: z.array(RenameChangeSchema).optional(),
      })
      .optional(),
    symbols: z
      .object({
        files: z.number().int().nonnegative(),
        byLanguage: z.record(z.string(), z.number().int().nonnegative()),
        changes: z.array(RenameChangeSchema).optional(),
      })
      .optional(),
    deepTs: z
      .object({
        files: z.number().int().nonnegative(),
        changes: z.array(RenameChangeSchema).optional(),
      })
      .optional(),
    textual: z
      .object({
        files: z.number().int().nonnegative(),
        hotspots: z.array(z.string()),
        changes: z.array(RenameChangeSchema).optional(),
      })
      .optional(),
    post: z
      .object({
        lockfilesToRegenerate: z.array(z.string()),
        pathsToMove: z.array(z.object({ from: z.string(), to: z.string() })),
        assetsToRegen: z.array(z.string()),
      })
      .optional(),
  }),
  excluded: z.array(z.string()),
  warnings: z.array(RenameWarningSchema),
  /** Where the diff file was written (if any). */
  diffPath: z.string().optional(),
  /**
   * Per-brand-category counts of changes (design/brand-mode.md §4).
   * Populated when `brand: true` in the input; omitted otherwise to keep
   * the v1.1.0 plan shape stable for non-brand consumers.
   */
  brand: z
    .object({
      token: z.string(),
      stringsMode: StringsModeSchema,
      categories: z.object({
        identifier: z.object({
          hits: z.number().int().nonnegative(),
          files: z.number().int().nonnegative(),
        }),
        envVar: z.object({
          hits: z.number().int().nonnegative(),
          files: z.number().int().nonnegative(),
        }),
        toolName: z.object({
          hits: z.number().int().nonnegative(),
          files: z.number().int().nonnegative(),
        }),
        errorClass: z.object({
          hits: z.number().int().nonnegative(),
          files: z.number().int().nonnegative(),
        }),
        header: z.object({
          hits: z.number().int().nonnegative(),
          files: z.number().int().nonnegative(),
        }),
        other: z.object({
          hits: z.number().int().nonnegative(),
          files: z.number().int().nonnegative(),
        }),
      }),
    })
    .optional(),
  /** Total number of files touched across all layers. */
  totalFiles: z.number().int().nonnegative(),
  /** Selected layers (after defaults). */
  selectedLayers: z.array(RenameLayerSchema),
  lockfileStrategy: z.enum(["regenerate", "skip"]),
  /**
   * Fingerprint of the plan's input — a hash of {from,to,layers,path}. Used
   * by `apply` to detect a stale plan (e.g. user ran `plan`, edited the repo,
   * then ran `apply` — the plan no longer matches reality).
   */
  fingerprint: z.string(),
});
export type RenamePlan = z.infer<typeof RenamePlanSchema>;

export const RenameReceiptSchema = z.object({
  path: z.string(),
  from: z.string(),
  to: z.string(),
  startedAt: z.string(),
  completedAt: z.string(),
  snapshotId: z.string(),
  snapshotDir: z.string(),
  layersApplied: z.array(RenameLayerSchema),
  filesChanged: z.number().int().nonnegative(),
  perLayer: z.object({
    identity: z.number().int().nonnegative().optional(),
    symbols: z.number().int().nonnegative().optional(),
    deepTs: z.number().int().nonnegative().optional(),
    textual: z.number().int().nonnegative().optional(),
    post: z
      .object({
        lockfilesRegenerated: z.array(z.string()),
        pathsMoved: z.array(z.object({ from: z.string(), to: z.string() })),
        assetRegenManifest: z.string().optional(),
        verify: z
          .object({ ran: z.boolean(), ok: z.boolean(), output: z.string().optional() })
          .optional(),
      })
      .optional(),
  }),
  warnings: z.array(RenameWarningSchema),
});
export type RenameReceipt = z.infer<typeof RenameReceiptSchema>;
