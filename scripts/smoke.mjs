/**
 * End-to-end smoke test: spawn the built server over stdio as an MCP client
 * would, list its tools, and call a few of them against the live API.
 *
 * Requires API_KEY and ATHLETE_ID (env or the config file).
 * Usage: node scripts/smoke.mjs
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const hasEnvCreds = Boolean(process.env.API_KEY && process.env.ATHLETE_ID);
if (!hasEnvCreds) {
  console.error("Set API_KEY and ATHLETE_ID before running the smoke test.");
  process.exit(1);
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(projectRoot, "dist", "index.js"), "serve"],
  // The SDK's stdio client strips env down to a safe subset by default;
  // pass credentials through explicitly.
  env: { ...process.env },
});

const client = new Client({ name: "smoke-test", version: "0.0.0" });
await client.connect(transport);

// 1. Tool inventory ---------------------------------------------------------
const { tools } = await client.listTools();
console.log(`listTools: ${tools.length} tools`);
console.log(tools.map((t) => `  - ${t.name}`).sort().join("\n"));

if (tools.length !== 20) {
  console.error(`Expected 20 tools, got ${tools.length}`);
  process.exit(1);
}

// 2. Live calls -------------------------------------------------------------
async function preview(name, args) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  console.log(`\n===== ${name} (${text.length} chars) =====`);
  console.log(text.slice(0, 400));
  if (text.length > 400) console.log("…");
}

await preview("get_wellness_data", { start_date: "2026-08-23", end_date: "2026-08-29" });
await preview("get_activities", { limit: 2 });
await preview("get_athlete_power_curves", {
  this_season: true,
  last_season: false,
  durations: [5, 60, 300],
});

await client.close();
console.log("\nSmoke test passed ✓");
process.exit(0);
