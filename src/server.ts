/**
 * MCP server assembly and transports.
 */

import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { readPackageVersion } from "./config.js";
import { registerActivityTools } from "./tools/activities.js";
import { registerCustomItemTools } from "./tools/customItems.js";
import { registerEventTools } from "./tools/events.js";
import { registerGearTools } from "./tools/gear.js";
import { registerPowerCurveTools } from "./tools/powerCurves.js";
import { registerWellnessTools } from "./tools/wellness.js";

export const MCP_PATH = "/mcp";

/** Create the MCP server instance with all tools registered. */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "intervals-icu",
    version: readPackageVersion(),
  });

  registerActivityTools(server);
  registerEventTools(server);
  registerWellnessTools(server);
  registerGearTools(server);
  registerPowerCurveTools(server);
  registerCustomItemTools(server);

  return server;
}

/** Run the MCP server over stdio (the transport used by MCP clients). */
export async function serveStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

/**
 * Run the MCP server over Streamable HTTP (stateless) at http://host:port/mcp.
 * Useful for remote setups (e.g. behind a tunnel for ChatGPT connectors).
 */
export async function serveStreamableHttp(host: string, port: number): Promise<void> {
  const httpServer = http.createServer(async (req, res) => {
    const url = req.url ?? "/";
    const isMcpPath = url === MCP_PATH || url.startsWith(`${MCP_PATH}/`);
    if (!isMcpPath) {
      res.writeHead(404).end("Not found");
      return;
    }

    if (req.method !== "POST") {
      // Stateless servers only accept POST requests
      res.writeHead(405, { Allow: "POST" }).end("Method Not Allowed");
      return;
    }

    try {
      // Fresh server + transport per request (stateless pattern)
      const server = createServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on("close", () => {
        transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err) {
      console.error("[intervals-mcp-server] error handling MCP request:", err);
      if (!res.headersSent) {
        res.writeHead(500).end("Internal Server Error");
      }
    }
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(port, host, () => resolve());
  });
  console.error(
    `[intervals-mcp-server] Streamable HTTP transport listening at http://${host}:${port}${MCP_PATH}`,
  );
}
