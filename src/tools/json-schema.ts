import { z } from "zod";

/**
 * The JSON Schema an MCP client sees for a tool's input.
 *
 * Keeps the contract forkctl advertised under zod 3 and zod-to-json-schema:
 * every object that does not opt into extra keys says
 * `additionalProperties: false`. zod 4's `z.toJSONSchema` leaves that out for
 * input schemas, which would tell clients extra keys are allowed.
 */
export function toolInputJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, {
    target: "draft-7",
    io: "input",
    override: (ctx) => {
      const s = ctx.jsonSchema as Record<string, unknown>;
      if (s.type === "object" && s.additionalProperties === undefined) {
        s.additionalProperties = false;
      }
    },
  }) as Record<string, unknown>;
}
