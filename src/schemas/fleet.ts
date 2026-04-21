import { z } from "zod";
import { RepoRefSchema } from "./common.js";

export const ListForksInputSchema = z.object({
  /** Filter to forks of a specific source repo. Omit to list all of the authenticated user's forks. */
  source: RepoRefSchema.optional(),
  /** Cap returned entries. Default 100. */
  limit: z.number().int().min(1).max(1000).default(100),
});
export type ListForksInput = z.infer<typeof ListForksInputSchema>;

export const FleetHealthInputSchema = z.object({
  /** Explicit list of forks to check. Omit to scan all of the authenticated user's forks. */
  forks: z.array(RepoRefSchema).max(100).optional(),
  limit: z.number().int().min(1).max(100).default(25),
});
export type FleetHealthInput = z.infer<typeof FleetHealthInputSchema>;

export const BatchSyncInputSchema = z.object({
  forks: z.array(RepoRefSchema).min(1).max(50),
  /** Branch override applied to every fork. Omit to use each fork's default branch. */
  branch: z.string().min(1).max(100).optional(),
  /** Stop the batch after this many failures. Default 3. */
  failFastAfter: z.number().int().min(1).max(50).default(3),
});
export type BatchSyncInput = z.infer<typeof BatchSyncInputSchema>;
