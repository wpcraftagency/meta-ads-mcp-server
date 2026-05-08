import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";

import { registerAccountTools } from "./tools/accounts.js";
import { registerCampaignTools } from "./tools/campaigns.js";
import { registerAdSetTools } from "./tools/adsets.js";
import { registerAdTools } from "./tools/ads.js";
import { registerInsightsTools } from "./tools/insights.js";
import { registerOptimizationTools } from "./tools/optimization.js";

// ─── Create MCP Server ────────────────────────────────────────────────────────

const server = new McpServer({
  name: "meta-ads-mcp-server",
  version: "1.0.0",
});

// ─── Register All Tools ───────────────────────────────────────────────────────

registerAccountTools(server);
registerCampaignTools(server);
registerAdSetTools(server);
registerAdTools(server);
registerInsightsTools(server);
registerOptimizationTools(server);

// ─── Transport ────────────────────────────────────────────────────────────────

async function runHTTP(): Promise<void> {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "meta-ads-mcp-server", version: "1.0.0" });
  });

  app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  const port = parseInt(process.env.PORT || "3000");
  app.listen(port, () => {
    console.error(`✅ Meta Ads MCP server running on http://localhost:${port}/mcp`);
    console.error(`   Health check: http://localhost:${port}/health`);
  });
}

async function runStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Meta Ads MCP server running on stdio");
}

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = process.env.TRANSPORT || "stdio";

if (transport === "http") {
  runHTTP().catch((err: unknown) => {
    console.error("Server error:", err);
    process.exit(1);
  });
} else {
  runStdio().catch((err: unknown) => {
    console.error("Server error:", err);
    process.exit(1);
  });
}
