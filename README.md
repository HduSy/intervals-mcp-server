# intervals-mcp-server (TypeScript)

[![npm version](https://img.shields.io/npm/v/intervals-mcp-server)](https://www.npmjs.com/package/intervals-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for the
[Intervals.icu](https://intervals.icu) API. Connects Claude, Cursor, ChatGPT and
any other MCP client to your training data — activities, events, wellness
metrics, power curves, gear and custom items.

Zero-config first run: `npx intervals-mcp-server` walks you through
authentication in your terminal and saves everything for future runs.

## Requirements

- Node.js ≥ 18.19
- An [Intervals.icu](https://intervals.icu) account

## Quick start

### 1. Authenticate (once)

```bash
npx intervals-mcp-server auth
```

The wizard will:

1. Open <https://intervals.icu/settings> in your browser
2. Ask you to copy two values from that page:
   - **API Key** — the "API Key" row, click *Show*
   - **Athlete ID** — shown on the same page (e.g. `123456` or `i12345`)
3. Verify them against the live API
4. Save them to `~/.config/intervals-mcp-server/config.json` (permissions `0600`)
5. Print ready-to-paste snippets for your MCP client

### 2. Add the server to your MCP client

**Claude Code**

```bash
claude mcp add intervals -s user -- npx intervals-mcp-server
```

**Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "intervals": { "command": "npx", "args": ["intervals-mcp-server"] }
  }
}
```

**Cursor** — `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "intervals": { "command": "npx", "args": ["intervals-mcp-server"] }
  }
}
```

Done — the client spawns the server via `npx` and all tools are available.

> **Why a config file instead of env vars?** MCP clients spawn servers with a
> minimal environment, so shell exports like `API_KEY` are not inherited
> automatically. The wizard-written config file works everywhere. Env vars are
> still supported and take precedence when declared in the client config.

### Alternative: environment variables

If you prefer declaring credentials in your MCP client config:

```json
{
  "mcpServers": {
    "intervals": {
      "command": "npx",
      "args": ["intervals-mcp-server"],
      "env": {
        "API_KEY": "your-api-key",
        "ATHLETE_ID": "your-athlete-id"
      }
    }
  }
}
```

Resolution order: `API_KEY` / `ATHLETE_ID` env vars → config file.
`INTERVALS_API_BASE_URL` overrides the API base URL (default `https://intervals.icu/api/v1`).

## Tools (20)

| Area | Tools |
|---|---|
| Activities | `get_activities`, `get_activity_details`, `get_activity_intervals`, `get_activity_streams`, `get_activity_messages`, `add_activity_message` |
| Events & calendar | `get_events`, `get_event_by_id`, `add_or_update_event`, `add_or_update_note`, `delete_event`, `delete_events_by_date_range` |
| Wellness | `get_wellness_data` |
| Power curves | `get_athlete_power_curves` |
| Gear | `get_gear_list` |
| Custom items | `get_custom_items`, `get_custom_item_by_id`, `create_custom_item`, `update_custom_item`, `delete_custom_item` |

Tool names use stable snake_case identifiers, so prompts and integrations keep
working across updates.

## CLI reference

```
intervals-mcp-server                 # serve over stdio; with no credentials yet and an
                                     # interactive terminal, run the setup wizard instead
                                     # (exits after saving so clients spawn a clean process)
intervals-mcp-server auth            # (re)run the credential wizard
intervals-mcp-server serve           # start the server without the onboarding check
  --transport stdio|streamable-http  # transport (default stdio)
  --host <host>                      # HTTP host (default 127.0.0.1)
  --port <port>                      # HTTP port (default 8765)
```

### Streamable HTTP transport

For remote setups (e.g. behind a tunnel for ChatGPT custom connectors):

```bash
npx intervals-mcp-server serve --transport streamable-http --port 8765
# MCP endpoint: http://127.0.0.1:8765/mcp
```

## Development

```bash
pnpm install
pnpm build        # tsup → dist/
pnpm test         # vitest (99 tests)
pnpm typecheck    # tsc --noEmit
pnpm smoke        # end-to-end: spawn server, listTools, live API calls
                   # (needs API_KEY / ATHLETE_ID)
```

### Publishing

```bash
npm login
npm publish        # with 2FA enabled: npm publish --otp=123456
```

`prepublishOnly` runs build + tests automatically.

## License

[MIT](./LICENSE)
