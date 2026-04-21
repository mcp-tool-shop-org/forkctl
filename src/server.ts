#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { dispatch } from "./dispatch.js";
import { buildOctokit } from "./lib/github.js";
import { openState } from "./lib/state.js";
import { Operations } from "./lib/operations.js";
import { findTool, TOOLS } from "./tools/registry.js";
import { VERSION } from "./index.js";

/**
 * MCP stdio server. Exposes all 18 forkctl tools.
 *
 * Launched by an MCP client (e.g. Claude Code) via:
 *   command: npx
 *   args: ["-y", "@mcptoolshop/forkctl", "mcp"]
 */
async function main(): Promise<void> {
  const server = new Server(
    { name: "forkctl", version: VERSION },
    { capabilities: { tools: {} } },
  );

  const octokit = buildOctokit();
  const db = openState();
  const operations = new Operations(db);
  const ctx = { octokit, db, operations };

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.inputSchema, { $refStrategy: "none" }) as Record<
        string,
        unknown
      >,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = findTool(req.params.name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Unknown tool: ${req.params.name}` }],
      };
    }
    const result = await dispatch(tool, req.params.arguments ?? {}, ctx);
    if (!result.ok) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: JSON.stringify(result.error, null, 2) }],
      };
    }
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }],
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // stderr only — stdio transport uses stdout
  process.stderr.write(
    `forkctl server fatal: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
