import { z } from "zod";
import { ProfileIdSchema, RepoRefSchema } from "./common.js";

export const BootstrapInputSchema = z.object({
  destination: RepoRefSchema,
  /** Optional source/upstream for profiles that wire upstream remotes. */
  source: RepoRefSchema.optional(),
  profile: ProfileIdSchema,
  /** When false, only advisory output is produced. Default: true. */
  apply: z.boolean().default(true),
});
export type BootstrapInput = z.infer<typeof BootstrapInputSchema>;

export const ConfigureUpstreamInputSchema = z.object({
  destination: RepoRefSchema,
  source: RepoRefSchema,
  /** Default branch name on the upstream. Default: 'main'. */
  branch: z.string().min(1).max(100).default("main"),
  /** When true, install the sync-upstream workflow file. Default: true. */
  installWorkflow: z.boolean().default(true),
});
export type ConfigureUpstreamInput = z.infer<typeof ConfigureUpstreamInputSchema>;

export const ScanDriftInputSchema = z.object({
  destination: RepoRefSchema,
  /** Original source/template — improves stale-reference detection. */
  source: RepoRefSchema.optional(),
});
export type ScanDriftInput = z.infer<typeof ScanDriftInputSchema>;

export const EmitHandoffInputSchema = z.object({
  destination: RepoRefSchema,
  source: RepoRefSchema.optional(),
  profile: ProfileIdSchema.optional(),
  /** Optional drift findings to include in the caveats section. */
  driftFindings: z
    .array(
      z.object({
        code: z.string(),
        severity: z.enum(["high", "medium", "low"]),
        message: z.string(),
        path: z.string().optional(),
      }),
    )
    .optional(),
});
export type EmitHandoffInput = z.infer<typeof EmitHandoffInputSchema>;
