/**
 * Power curve tools: best power for selected durations across time periods.
 */

import { z } from "zod";
import { makeIntervalsRequest, isApiError } from "../api/client.js";
import { getConfig } from "../config.js";
import {
  formatPowerCurves,
  type CurveDataPoint,
  type ExtractedCurve,
  type Dict,
} from "../utils/formatting.js";
import { resolveAthleteId } from "../utils/validation.js";
import { textResult, apiErrorMessage, type ToolRegistrar } from "./shared.js";

// 5s, 15s, 30s, 1min, 2min, 5min, 10min, 20min, 60min
export const DEFAULT_DURATIONS = [5, 15, 30, 60, 120, 300, 600, 1200, 3600];

/** Build the curves query parameter list based on user selections. */
function buildCurvesParam(
  thisSeason: boolean,
  lastSeason: boolean,
  startDate?: string,
  endDate?: string,
): string[] {
  const curves: string[] = [];
  if (thisSeason) curves.push("s0");
  if (lastSeason) curves.push("s1");
  if (startDate && endDate) curves.push(`r.${startDate}.${endDate}`);
  return curves;
}

/** Validate that start/end dates are both present or both absent, and ordered. */
function validateDates(startDate?: string, endDate?: string): string | null {
  if (!startDate !== !endDate) {
    return "Error: Both start_date and end_date must be provided together for a custom date range.";
  }
  if (startDate && endDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return "Error: Dates must be in YYYY-MM-DD format.";
    }
    if (startDate >= endDate) return "Error: start_date must be before end_date.";
  }
  return null;
}

/** Extract power data for requested durations from a single curve. */
function extractCurveData(
  curve: Dict,
  durations: number[],
  includeNormalised: boolean,
): ExtractedCurve {
  const secs = (curve["secs"] ?? []) as number[];
  const values = (curve["values"] ?? []) as Array<number | null>;
  const activityIds = (curve["activity_id"] ?? []) as Array<string | null>;
  const wattsPerKg = (curve["watts_per_kg"] ?? []) as Array<number | null>;
  const wkgActivityIds = (curve["wkg_activity_id"] ?? []) as Array<string | null>;

  const secToIdx = new Map<number, number>();
  secs.forEach((s, i) => secToIdx.set(s, i));

  const dataPoints: CurveDataPoint[] = [];
  for (const dur of durations) {
    const idx = secToIdx.get(dur);
    if (idx === undefined || idx >= values.length) continue;
    const point: CurveDataPoint = {
      secs: dur,
      watts: values[idx] ?? null,
      activity_id: idx < activityIds.length && activityIds[idx] != null ? (activityIds[idx] as string) : "",
    };
    if (includeNormalised && idx < wattsPerKg.length) {
      point.watts_per_kg =
        wattsPerKg[idx] != null ? Math.round((wattsPerKg[idx] as number) * 100) / 100 : undefined;
      point.wkg_activity_id =
        idx < wkgActivityIds.length && wkgActivityIds[idx] != null
          ? (wkgActivityIds[idx] as string)
          : "";
    }
    dataPoints.push(point);
  }

  return {
    id: String(curve["id"] ?? ""),
    label: String(curve["label"] ?? curve["id"] ?? ""),
    start: String(curve["start_date_local"] ?? ""),
    end: String(curve["end_date_local"] ?? ""),
    data_points: dataPoints,
  };
}

export const registerPowerCurveTools: ToolRegistrar = (server) => {
  server.registerTool(
    "get_athlete_power_curves",
    {
      title: "Get Athlete Power Curves",
      description:
        "Get power curves for an athlete from Intervals.icu.\n\n" +
        "Returns best power output for selected durations across specified time periods.\n" +
        "Uses FFT power computation. Power values are in watts.",
      inputSchema: {
        activity_type: z.string().default("Ride").describe('Activity type (e.g. "Ride", "Run", "VirtualRide")'),
        durations: z
          .array(z.number().int())
          .optional()
          .describe("Durations in seconds to include (defaults to [5, 15, 30, 60, 120, 300, 600, 1200, 3600])"),
        indoor_outdoor: z
          .string()
          .optional()
          .describe('Filter by location — "indoor" or "outdoor". Omit for no filtering.'),
        start_date: z
          .string()
          .optional()
          .describe("Start date (YYYY-MM-DD) for custom date range curve. Must be used with end_date."),
        end_date: z
          .string()
          .optional()
          .describe("End date (YYYY-MM-DD) for custom date range curve. Must be used with start_date."),
        this_season: z.boolean().default(true).describe("Include this season's curve"),
        last_season: z.boolean().default(true).describe("Include last season's curve"),
        include_normalised: z.boolean().default(true).describe("Include weight-normalised W/kg values"),
        athlete_id: z.string().optional(),
        api_key: z.string().optional(),
      },
    },
    async ({
      activity_type,
      durations,
      indoor_outdoor,
      start_date,
      end_date,
      this_season,
      last_season,
      include_normalised,
      athlete_id,
      api_key,
    }) => {
      const config = getConfig();
      const { athleteId, error } = resolveAthleteId(athlete_id, config.athleteId);
      if (error) return textResult(error);

      const durs = durations ?? DEFAULT_DURATIONS;

      if (indoor_outdoor && !["indoor", "outdoor"].includes(indoor_outdoor)) {
        return textResult("Error: indoor_outdoor must be 'indoor', 'outdoor', or omitted.");
      }

      const dateError = validateDates(start_date, end_date);
      if (dateError) return textResult(dateError);

      const curves = buildCurvesParam(this_season, last_season, start_date, end_date);
      if (!curves.length) {
        return textResult(
          "Error: At least one curve must be selected (this_season, last_season, or a date range).",
        );
      }

      const params: Record<string, unknown> = {
        curves,
        type: activity_type,
        includeRanks: false,
      };
      if (indoor_outdoor) {
        params["filters"] = JSON.stringify([
          { field_id: "indoor", value: indoor_outdoor, id: 1 },
        ]);
      }

      const result = await makeIntervalsRequest(`/athlete/${athleteId}/power-curves`, {
        apiKey: api_key,
        params: params as Record<string, import("../api/client.js").QueryValue>,
      });

      if (isApiError(result)) {
        return textResult(`Error fetching power curves: ${apiErrorMessage(result)}`);
      }

      let curveList: Dict[] = [];
      if (typeof result === "object" && result !== null && !Array.isArray(result)) {
        curveList = ((result as Dict)["list"] ?? []) as Dict[];
      } else if (Array.isArray(result)) {
        curveList = result as Dict[];
      }

      if (!curveList.length) {
        return textResult(`No power curve data found for athlete ${athleteId} (${activity_type}).`);
      }

      const extracted = curveList
        .filter((c) => typeof c === "object" && c !== null)
        .map((c) => extractCurveData(c, durs, include_normalised));

      if (!extracted.length) {
        return textResult(`No power curve data found for athlete ${athleteId} (${activity_type}).`);
      }

      return textResult(formatPowerCurves(extracted, activity_type, include_normalised));
    },
  );
};
