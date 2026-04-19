import { z } from "zod";
import { RepoRefSchema } from "./common.js";

export const SyncInputSchema = z.object({
  fork: RepoRefSchema,
  /** Branch to sync. Defaults to the fork's default branch. */
  branch: z.string().min(1).max(100).optional(),
});
export type SyncInput = z.infer<typeof SyncInputSchema>;

export const DiagnoseDivergenceInputSchema = z.object({
  fork: RepoRefSchema,
  branch: z.string().min(1).max(100).optional(),
});
export type DiagnoseDivergenceInput = z.infer<typeof DiagnoseDivergenceInputSchema>;

export const ProposeSyncPrInputSchema = z.object({
  fork: RepoRefSchema,
  branch: z.string().min(1).max(100).optional(),
  syncBranch: z.string().min(1).max(100).default("forkable/sync-from-upstream"),
  prTitle: z.string().min(1).max(120).default("forkable: sync from upstream"),
});
export type ProposeSyncPrInput = z.infer<typeof ProposeSyncPrInputSchema>;
