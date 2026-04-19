import { z } from "zod";
import { RepoRefSchema } from "./common.js";

export const PreflightPolicyInputSchema = z.object({
  repo: RepoRefSchema,
});
export type PreflightPolicyInput = z.infer<typeof PreflightPolicyInputSchema>;

export const CreateForkInputSchema = z.object({
  source: RepoRefSchema,
  /** Destination organization. Omit to fork into the authenticated user's account. */
  destinationOrg: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9._-]+$/)
    .optional(),
  /** Override fork name. Defaults to the source repo name. */
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9._-]+$/)
    .optional(),
  /** Fork only the default branch (faster for big repos). */
  defaultBranchOnly: z.boolean().default(false),
});
export type CreateForkInput = z.infer<typeof CreateForkInputSchema>;

export const CreateFromTemplateInputSchema = z.object({
  template: RepoRefSchema,
  /** Owner (user or org) for the new repo. */
  owner: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9._-]+$/),
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9._-]+$/),
  description: z.string().max(350).optional(),
  private: z.boolean().default(false),
  includeAllBranches: z.boolean().default(false),
});
export type CreateFromTemplateInput = z.infer<typeof CreateFromTemplateInputSchema>;

export const CheckOperationInputSchema = z.object({
  operationId: z.string().min(1),
});
export type CheckOperationInput = z.infer<typeof CheckOperationInputSchema>;
