/**
 * intervals-mcp-server — MCP server for the Intervals.icu API.
 *
 * Default (no args): serve over stdio, running the onboarding wizard first
 * when no credentials are configured yet (interactive terminal only).
 * `auth`:  (re)run the credential setup wizard.
 * `serve`: start the server, skipping the onboarding check.
 */

import { Command } from "commander";
import { hasCredentials, readPackageVersion } from "./config.js";
import { runOnboarding } from "./auth.js";
import { serveStdio, serveStreamableHttp } from "./server.js";

interface ServeOptions {
  transport: string;
  host: string;
  port: string;
}

const NO_CREDENTIALS_HINT = `No Intervals.icu credentials found.

  Run the interactive setup once in your terminal:

      npx intervals-mcp-server auth

  It opens https://intervals.icu/settings where you can copy your API Key
  and Athlete ID, verifies them, and saves them for future runs.

  Alternatively set the API_KEY and ATHLETE_ID environment variables in your
  MCP client configuration.`;

function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function startServer(opts: ServeOptions): Promise<void> {
  const transport = opts.transport.toLowerCase();
  if (transport === "stdio") {
    await serveStdio();
    return;
  }
  if (transport === "streamable-http" || transport === "http") {
    const port = Number.parseInt(opts.port, 10);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      console.error(`Invalid port: ${opts.port}`);
      process.exit(1);
    }
    await serveStreamableHttp(opts.host, port);
    return;
  }
  console.error(`Unsupported transport "${opts.transport}". Use "stdio" or "streamable-http".`);
  process.exit(1);
}

const program = new Command();

program
  .name("intervals-mcp-server")
  .description("Model Context Protocol server for the Intervals.icu API")
  .version(readPackageVersion())
  .option("--transport <type>", "transport: stdio or streamable-http", "stdio")
  .option("--host <host>", "HTTP host when using streamable-http", "127.0.0.1")
  .option("--port <port>", "HTTP port when using streamable-http", "8765")
  .action(async (opts: ServeOptions) => {
    if (!hasCredentials()) {
      if (!isInteractive()) {
        console.error(NO_CREDENTIALS_HINT);
        process.exit(1);
      }
      // Interactive first run: configure, show client snippets, then exit so
      // the MCP client spawns a clean process (no prompt noise on stdio).
      const ok = await runOnboarding();
      process.exit(ok ? 0 : 1);
    }
    await startServer(opts);
  });

program
  .command("auth")
  .description("Run (or re-run) the interactive credential setup wizard")
  .action(async () => {
    if (!isInteractive()) {
      console.error("The auth wizard needs an interactive terminal. Run it directly in your shell:\n\n  npx intervals-mcp-server auth\n");
      process.exit(1);
    }
    const ok = await runOnboarding();
    process.exit(ok ? 0 : 1);
  });

program
  .command("serve")
  .description("Start the MCP server (skips the onboarding check)")
  .option("--transport <type>", "transport: stdio or streamable-http", "stdio")
  .option("--host <host>", "HTTP host when using streamable-http", "127.0.0.1")
  .option("--port <port>", "HTTP port when using streamable-http", "8765")
  .action(async (opts: ServeOptions) => {
    await startServer(opts);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error("[intervals-mcp-server] fatal:", err);
  process.exit(1);
});
