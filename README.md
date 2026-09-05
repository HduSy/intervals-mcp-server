# intervals-mcp-server

[![npm version](https://img.shields.io/npm/v/intervals-mcp-server)](https://www.npmjs.com/package/intervals-mcp-server)
[![Publish](https://github.com/HduSy/intervals-mcp-server/actions/workflows/publish.yml/badge.svg)](https://github.com/HduSy/intervals-mcp-server/actions/workflows/publish.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for the
[Intervals.icu](https://intervals.icu) API. Connects Claude, Cursor, ChatGPT and
any other MCP client to your training data — activities, events, wellness
metrics, power curves, gear and custom items.

Zero-config first run: `npx intervals-mcp-server@latest` walks you through
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
claude mcp add intervals -s user -- npx intervals-mcp-server@latest
```

**Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "intervals": { "command": "npx", "args": ["intervals-mcp-server@latest"] }
  }
}
```

**Cursor** — `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "intervals": { "command": "npx", "args": ["intervals-mcp-server@latest"] }
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
      "args": ["intervals-mcp-server@latest"],
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

## Data completeness & provenance

Activities can arrive partially — the activity record lands before all
streams and server-side analysis finish. To keep the model from answering
confidently from half-synced data, the activity tools surface native API
signals and derive a verdict from them:

- `get_activities` — one-line `Sync:` verdict per activity
  (complete / pending / incomplete) plus last-sync time and upstream source
- `get_activity_details` — full **Sync & Data Completeness** section:
  `analyzed`, `icu_sync_date`, `icu_sync_error`, `analysis_issues`,
  `stream_types`, `source` / `external_id`
- `get_activity_streams` — warns when a requested stream type is missing
  (it may still be syncing) instead of silently omitting it

The verdict is marked `(derived)` — the API has no explicit completeness
flag. Caveat per the Intervals.icu maintainer: `analyzed` may stay null on
Strava-sourced activities while the data is fine; those are reported as
pending rather than incomplete.

Stream quirk handled for you: the `latlng` stream stores latitude in
`data` and longitude in a sibling `data2` field; the streams tool zips
them into `[lat, lng]` points so the longitude half isn't lost.

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
pnpm test         # vitest (114 tests)
pnpm typecheck    # tsc --noEmit
pnpm smoke        # end-to-end: spawn server, listTools, live API calls
                   # (needs API_KEY / ATHLETE_ID)
```

### Publishing

Releases are published by GitHub Actions (`.github/workflows/publish.yml`):

```bash
# bump "version" in package.json, commit, then:
git tag vX.Y.Z
git push origin vX.Y.Z
```

The workflow installs dependencies, runs typecheck + tests + build, then
publishes to npm with provenance using the `NPM_TOKEN` repository secret.

## License

[MIT](./LICENSE)
