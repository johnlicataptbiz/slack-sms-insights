import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MemoryClient } from "mem0ai";
import { z } from "zod";

const server = new McpServer({
  name: "mem0-sync",
  version: "1.0.0",
});

const mem0 = new MemoryClient({
  apiKey: process.env.MEM0_API_KEY || "dummy-key-for-test",
});

server.tool(
  "sync-feature",
  "Sync a feature from this project to Mem0",
  {
    feature: z.string().describe("The feature description"),
    metadata: z.record(z.string()).optional().describe("Metadata about the feature"),
  },
  async ({ feature, metadata }) => {
    try {
      const result = await mem0.add([
        {
          role: "user",
          content: `Feature added: ${feature}`,
        },
      ], {
        user_id: process.env.MEM0_DEFAULT_USER_ID || "slack-sms-insights",
        metadata: {
          ...metadata,
          source: "slack-sms-insights-automation",
          timestamp: new Date().toISOString(),
        },
      });
      return {
        content: [{ type: "text", text: `Successfully synced feature to Mem0: ${JSON.stringify(result)}` }],
      };
    } catch (error) {
      console.error("Mem0 error:", error);
      return {
        content: [{ type: "text", text: `Failed to sync to Mem0: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Mem0 Sync MCP Server running on stdio");
