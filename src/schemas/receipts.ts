import { z } from "zod";

export const ReceiptInputSchema = z.object({
  operationId: z.string().min(1),
});
export type ReceiptInput = z.infer<typeof ReceiptInputSchema>;

export const AuditLogInputSchema = z.object({
  tool: z.string().min(1).max(100).optional(),
  operationId: z.string().min(1).optional(),
  ok: z.boolean().optional(),
  sinceMs: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(1000).default(50),
});
export type AuditLogInput = z.infer<typeof AuditLogInputSchema>;
