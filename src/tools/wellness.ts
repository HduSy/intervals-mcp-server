/**
 * Wellness tools: retrieval of athlete wellness data.
 */

import { z } from "zod";
import { makeIntervalsRequest, isApiError } from "../api/client.js";
import { getConfig } from "../config.js";
import { formatWellnessEntry, type Dict } from "../utils/formatting.js";
import { resolveAthleteId, resolveDateParams } from "../utils/validation.js";
import { textResult, apiErrorMessage, type ToolRegistrar } from "./shared.js";

export const registerWellnessTools: ToolRegistrar = (server) => {
  server.registerTool(
    "get_wellness_data",
    {
      title: "Get Wellness Data",
      description:
        "Get wellness data for an athlete from Intervals.icu.\n\n" +
        "By default returns standard wellness fields (training metrics, vitals, sleep,\n" +
        "subjective scores, etc.). Set include_all_fields=true to also include any\n" +
        "additional or custom fields configured by the user in Intervals.icu.",
      inputSchema: {
        athlete_id: z.string().optional(),
        api_key: z.string().optional(),
        start_date: z.string().optional().describe("Start date in YYYY-MM-DD format (defaults to 30 days ago)"),
        end_date: z.string().optional().describe("End date in YYYY-MM-DD format (defaults to today)"),
        include_all_fields: z
          .boolean()
          .default(false)
          .describe("Include additional and custom fields beyond the standard set"),
      },
    },
    async ({ athlete_id, api_key, start_date, end_date, include_all_fields }) => {
      const config = getConfig();
      const { athleteId, error } = resolveAthleteId(athlete_id, config.athleteId);
      if (error) return textResult(error);

      const [oldest, newest] = resolveDateParams(start_date, end_date);

      const result = await makeIntervalsRequest(`/athlete/${athleteId}/wellness`, {
        apiKey: api_key,
        params: { oldest, newest },
      });

      if (isApiError(result)) {
        return textResult(`Error fetching wellness data: ${apiErrorMessage(result)}`);
      }
      if (
        result == null ||
        (typeof result === "object" && !Array.isArray(result) && Object.keys(result).length === 0)
      ) {
        return textResult(
          `No wellness data found for athlete ${athleteId} in the specified date range.`,
        );
      }

      let summary = "Wellness Data:\n\n";

      if (typeof result === "object" && !Array.isArray(result)) {
        // Result is a dict keyed by date
        for (const [dateStr, data] of Object.entries(result as Dict)) {
          if (typeof data === "object" && data !== null && !("date" in data)) {
            data["date"] = dateStr;
          }
          summary += `${formatWellnessEntry(data as Dict, include_all_fields)}\n\n`;
        }
      } else if (Array.isArray(result)) {
        for (const entry of result as Dict[]) {
          if (typeof entry === "object" && entry !== null) {
            summary += `${formatWellnessEntry(entry, include_all_fields)}\n\n`;
          }
        }
      }

      return textResult(summary);
    },
  );
};
