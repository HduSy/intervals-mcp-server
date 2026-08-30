/**
 * Gear tools and gear-name resolution.
 *
 * Intervals.icu activity payloads include only the gear ID, not the name. The
 * gear catalog lives at /athlete/{id}/gear; we cache it per athlete for the
 * process lifetime and inject the resolved name into activities as
 * `_resolved_gear_name` before formatting.
 */

import { z } from "zod";
import { makeIntervalsRequest } from "../api/client.js";
import { getConfig } from "../config.js";
import { resolveAthleteId } from "../utils/validation.js";
import type { Dict } from "../utils/formatting.js";
import { textResult, type ToolRegistrar } from "./shared.js";

// Module-level cache of the raw gear catalog per athlete. Single source of
// truth: the id->name map and the rich listing are both derived from it.
const gearRawCache = new Map<string, Dict[]>();

/** Pull the gear ID out of an activity dict, handling the two known shapes. */
export function extractGearId(activity: Dict): string | null {
  const gearRaw = activity["gear"];
  if (typeof gearRaw === "object" && gearRaw !== null) {
    const id = gearRaw["id"];
    if (id) return String(id);
  }
  const gearId = activity["gear_id"];
  if (gearId) return String(gearId);
  return null;
}

/** Normalize the /athlete/{id}/gear response into a list of gear dicts. */
function itemsFromResponse(result: unknown): Dict[] {
  if (Array.isArray(result)) return result.filter((i) => typeof i === "object" && i !== null);
  if (typeof result === "object" && result !== null) {
    for (const value of Object.values(result as Dict)) {
      if (Array.isArray(value)) {
        return value.filter((i) => typeof i === "object" && i !== null) as Dict[];
      }
    }
  }
  return [];
}

/** Convert a raw gear list into a { gearId: gearName } lookup. */
function deriveGearMap(items: Dict[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of items) {
    const gid = item["id"];
    const name = item["name"] || item["display_name"];
    if (gid && name) map.set(String(gid), String(name));
  }
  return map;
}

/** Return (and cache) the raw gear list for an athlete. */
export async function getGearRaw(
  opts: { athleteId?: string; apiKey?: string; refresh?: boolean } = {},
): Promise<Dict[]> {
  const config = getConfig();
  const { athleteId, error } = resolveAthleteId(opts.athleteId, config.athleteId);
  if (error || !athleteId) return [];

  if (!opts.refresh && gearRawCache.has(athleteId)) {
    return gearRawCache.get(athleteId) as Dict[];
  }

  const result = await makeIntervalsRequest(`/athlete/${athleteId}/gear`, {
    apiKey: opts.apiKey,
  });
  const items = itemsFromResponse(result);
  gearRawCache.set(athleteId, items);
  return items;
}

/** Return the { gearId: gearName } lookup for an athlete (derived from cache). */
export async function getGearMap(
  opts: { athleteId?: string; apiKey?: string; refresh?: boolean } = {},
): Promise<Map<string, string>> {
  const items = await getGearRaw(opts);
  return deriveGearMap(items);
}

/** Inject `_resolved_gear_name` into an activity dict if gear is present. */
export async function resolveGearForActivity(
  activity: Dict,
  opts: { athleteId?: string; apiKey?: string } = {},
): Promise<void> {
  const gearId = extractGearId(activity);
  if (!gearId) return;
  const gearMap = await getGearMap(opts);
  const name = gearMap.get(gearId);
  if (name) activity["_resolved_gear_name"] = name;
}

/** Inject `_resolved_gear_name` into each activity in a list. In-place. */
export async function resolveGearForActivities(
  activities: Dict[],
  opts: { athleteId?: string; apiKey?: string } = {},
): Promise<void> {
  if (!activities.length) return;
  // Pre-warm the cache once, then iterate.
  await getGearMap(opts);
  for (const activity of activities) {
    if (typeof activity === "object" && activity !== null) {
      await resolveGearForActivity(activity, opts);
    }
  }
}

export const registerGearTools: ToolRegistrar = (server) => {
  server.registerTool(
    "get_gear_list",
    {
      title: "Get Gear List",
      description:
        "Get the gear catalog (bikes, shoes, etc.) for an athlete from Intervals.icu.\n\n" +
        "Returns one line per gear item with id, type, name, and basic stats.\n" +
        "The result is cached for the MCP process lifetime; pass refresh=true to re-fetch.",
      inputSchema: {
        athlete_id: z.string().optional().describe("Intervals.icu athlete ID (defaults to configured ATHLETE_ID)"),
        api_key: z.string().optional().describe("Intervals.icu API key (defaults to configured API_KEY)"),
        refresh: z.boolean().default(false).describe("Bypass the cache and re-fetch from the API"),
      },
    },
    async ({ athlete_id, api_key, refresh }) => {
      const config = getConfig();
      const { athleteId, error } = resolveAthleteId(athlete_id, config.athleteId);
      if (error) return textResult(error);
      if (!athleteId) {
        return textResult(
          "Error: athlete_id is required (either as argument or via ATHLETE_ID).",
        );
      }

      const items = await getGearRaw({ athleteId, apiKey: api_key, refresh });

      if (!items.length) return textResult(`No gear found for athlete ${athleteId}.`);

      let output = `Gear catalog for athlete ${athleteId}:\n\n`;
      output += `${"ID".padEnd(14)} ${"Type".padEnd(8)} ${"Name".padEnd(32)} ${"Default".padEnd(8)} ${"Acts".padEnd(6)} ${"Dist (km)".padEnd(10)} ${"Retired".padEnd(8)}\n`;
      output += `${"-".repeat(14)} ${"-".repeat(8)} ${"-".repeat(32)} ${"-".repeat(8)} ${"-".repeat(6)} ${"-".repeat(10)} ${"-".repeat(8)}\n`;
      for (const it of items) {
        const gid = String(it["id"] ?? "?");
        const gtype = String(it["component_type"] ?? it["type"] ?? "?");
        const name = String(it["name"] ?? "?").slice(0, 32);
        const defaultFor = String(it["default_for_type"] || it["default_for"] || "");
        const acts = String(it["activities"] ?? it["activity_count"] ?? "?");
        const distM = it["distance"] ?? 0;
        const distKm =
          typeof distM === "number" ? (distM / 1000).toFixed(1) : "?";
        const retired = it["retired"] ? "yes" : "";
        output += `${gid.padEnd(14)} ${gtype.padEnd(8)} ${name.padEnd(32)} ${defaultFor.padEnd(8)} ${acts.padEnd(6)} ${distKm.padEnd(10)} ${retired.padEnd(8)}\n`;
      }

      return textResult(output);
    },
  );
};
