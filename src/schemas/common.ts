import { z } from "zod";

/** "owner/repo" reference. Validated against GitHub's allowed character set. */
export const RepoRefSchema = z
  .string()
  .min(3)
  .regex(/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/, {
    message: 'Repo reference must be "owner/repo".',
  });

export const GoalSchema = z.enum([
  "contribute_upstream",
  "ship_derivative",
  "internal_seed",
  "client_copy",
  "experiment",
]);

export const VisibilitySchema = z.enum(["public", "private", "internal"]);

export const ProfileIdSchema = z.enum([
  "contributor",
  "starter-kit",
  "internal-seed",
  "client-delivery",
  "experiment",
]);

export const PathChoiceSchema = z.enum(["fork", "template", "import", "clone_detached"]);

export type Goal = z.infer<typeof GoalSchema>;
export type Visibility = z.infer<typeof VisibilitySchema>;
export type ProfileIdInput = z.infer<typeof ProfileIdSchema>;
export type PathChoice = z.infer<typeof PathChoiceSchema>;
