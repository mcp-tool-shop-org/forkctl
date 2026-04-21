import { z } from "zod";
import { GoalSchema, RepoRefSchema } from "./common.js";

export const AssessInputSchema = z.object({
  repo: RepoRefSchema,
  goal: GoalSchema.optional(),
});

export type AssessInput = z.infer<typeof AssessInputSchema>;

export const ChoosePathInputSchema = z.object({
  repo: RepoRefSchema,
  goal: GoalSchema,
});
export type ChoosePathInput = z.infer<typeof ChoosePathInputSchema>;

export const MakeForkableInputSchema = z.object({
  repo: RepoRefSchema,
  mode: z.enum(["plan", "pr"]).default("plan"),
  branch: z.string().min(1).max(100).default("forkctl/adoption-fixes"),
});
export type MakeForkableInput = z.infer<typeof MakeForkableInputSchema>;
