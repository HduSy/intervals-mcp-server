/** Shared helpers for tool registration. */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Dict } from "../utils/formatting.js";

/** A module's tool registration entry point. */
export type ToolRegistrar = (server: McpServer) => void;

/** Wrap a plain string as MCP tool content. */
export function textResult(text: string): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text }] };
}

/** Extract the error message from an API error result. */
export function apiErrorMessage(result: Dict): string {
  return typeof result["message"] === "string" ? result["message"] : "Unknown error";
}
