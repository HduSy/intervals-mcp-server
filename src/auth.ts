/**
 * First-run onboarding wizard.
 *
 * Guides the user through getting their API key and athlete ID from
 * https://intervals.icu/settings, validates them against the live API, and
 * persists them to the config file.
 */

import * as p from "@clack/prompts";
import { makeIntervalsRequest, isApiError } from "./api/client.js";
import {
  configFilePath,
  hasCredentials,
  readStoredCredentials,
  saveStoredCredentials,
} from "./config.js";
import { openUrl, terminalLink } from "./openUrl.js";
import { getDefaultEndDate } from "./utils/dates.js";
import { validateAthleteId } from "./utils/validation.js";

export const SETTINGS_URL = "https://intervals.icu/settings";

const CLIENT_SNIPPETS = `
Add the server to your MCP client (pick one):

  Claude Code
    claude mcp add intervals -s user -- npx intervals-mcp-server

  Claude Desktop (~/Library/Application Support/Claude/claude_desktop_config.json)
    {
      "mcpServers": {
        "intervals": { "command": "npx", "args": ["intervals-mcp-server"] }
      }
    }

  Cursor (~/.cursor/mcp.json)
    {
      "mcpServers": {
        "intervals": { "command": "npx", "args": ["intervals-mcp-server"] }
      }
    }`;

function cancel(): never {
  p.cancel("Setup cancelled — nothing was saved.");
  process.exit(0);
}

/** Verify credentials against the live API. Returns null on success or an error message. */
export async function verifyCredentials(
  apiKey: string,
  athleteId: string,
): Promise<string | null> {
  const today = getDefaultEndDate();
  const result = await makeIntervalsRequest(`/athlete/${athleteId}/wellness`, {
    apiKey,
    params: { oldest: today, newest: today },
  });
  if (isApiError(result)) {
    if (result.status_code === 401) return "The API key was rejected (401). Please re-check it.";
    if (result.status_code === 404) return `Athlete ID "${athleteId}" was not found (404).`;
    return result.message;
  }
  return null;
}

/** Run the interactive setup wizard. Returns true when credentials were saved. */
export async function runOnboarding(): Promise<boolean> {
  const existing = readStoredCredentials();

  console.log("");
  p.intro("Intervals.icu MCP server — first-time setup");

  p.log.message(
    `This server needs your Intervals.icu  ${terminalLink("API Key", SETTINGS_URL)}  and  Athlete ID.`,
  );

  p.log.step("Step 1 — opening the Intervals.icu settings page in your browser");
  const opened = openUrl(SETTINGS_URL);
  if (!opened) {
    p.log.warn("Could not open a browser automatically — open this URL manually:");
    console.log(`    ${SETTINGS_URL}`);
  } else {
    console.log(`    ${SETTINGS_URL}`);
  }

  p.log.step("Step 2 — copy your credentials from that page");
  console.log(
    [
      "    • API Key:    find the “API Key” row and click Show, then copy the value",
      "    • Athlete ID: shown on the same settings page (all digits, e.g. 123456,",
      "                  sometimes prefixed with “i”, e.g. i12345)",
    ].join("\n"),
  );

  let apiKey = existing?.apiKey ?? "";
  let athleteId = existing?.athleteId ?? "";
  let verified = false;

  for (let attempt = 1; attempt <= 3 && !verified; attempt++) {
    p.log.step(`Step 3 — enter your credentials (attempt ${attempt}/3)`);

    const keyAnswer = await p.password({
      message: "Paste your Intervals.icu API Key:",
      validate: (value) => {
        if (!value || value.trim().length < 8) return "The API key looks too short — please re-paste it.";
      },
    });
    if (p.isCancel(keyAnswer)) cancel();
    apiKey = keyAnswer.trim();

    const idAnswer = await p.text({
      message: "Enter your Athlete ID:",
      placeholder: "e.g. 123456 or i12345",
      initialValue: athleteId,
      validate: (value) => {
        if (!value) return "Athlete ID is required.";
        try {
          validateAthleteId(value.trim());
        } catch {
          return "Athlete ID must be all digits or “i” followed by digits.";
        }
      },
    });
    if (p.isCancel(idAnswer)) cancel();
    athleteId = idAnswer.trim();

    const spinner = p.spinner();
    spinner.start("Verifying credentials against intervals.icu…");
    const problem = await verifyCredentials(apiKey, athleteId);
    if (problem == null) {
      spinner.stop("Credentials verified ✓");
      verified = true;
    } else {
      spinner.stop("Verification failed");
      p.log.error(problem);
    }
  }

  if (!verified) {
    p.log.warn("Saving the credentials without live verification.");
    const saveAnyway = await p.confirm({
      message: "Save them anyway?",
      initialValue: false,
    });
    if (p.isCancel(saveAnyway) || !saveAnyway) cancel();
  }

  try {
    saveStoredCredentials({ apiKey, athleteId });
  } catch (e) {
    p.log.error(`Could not save the config file: ${(e as Error).message}`);
    p.outro("Setup failed. Try again with `npx intervals-mcp-server auth`.");
    return false;
  }

  p.log.success(`Credentials saved to ${configFilePath()} (readable only by you)`);

  if (hasCredentials()) {
    p.log.success("Configuration complete — the server is ready.");
  }

  console.log(CLIENT_SNIPPETS);
  p.outro("Done! Re-run `npx intervals-mcp-server auth` any time to change credentials.");
  return true;
}
