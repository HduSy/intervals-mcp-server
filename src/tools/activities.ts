/**
 * Activity tools: retrieval, detailed analysis, streams, messages.
 */

import { z } from "zod";
import { makeIntervalsRequest, isApiError, isEmptyResult } from "../api/client.js";
import { getConfig } from "../config.js";
import { toLocalDateString } from "../utils/dates.js";
import {
  formatActivityMessage,
  formatActivitySummary,
  formatIntervals,
  zipLatLngStream,
  type Dict,
} from "../utils/formatting.js";
import { resolveAthleteId, resolveDateParams } from "../utils/validation.js";
import { resolveGearForActivities, resolveGearForActivity } from "./gear.js";
import { textResult, apiErrorMessage, type ToolRegistrar } from "./shared.js";

/** Extract a list of activity dictionaries from the API result. */
function parseActivitiesFromResult(result: unknown): Dict[] {
  if (Array.isArray(result)) {
    return result.filter((item): item is Dict => typeof item === "object" && item !== null);
  }
  if (typeof result === "object" && result !== null) {
    const obj = result as Dict;
    // Result is a container — pull the first list value
    for (const value of Object.values(obj)) {
      if (Array.isArray(value)) {
        return value.filter((item): item is Dict => typeof item === "object" && item !== null);
      }
    }
    // If no list was found but the dict has typical activity fields, treat as single
    if (["name", "startTime", "distance"].some((key) => key in obj)) return [obj];
  }
  return [];
}

/** Filter out unnamed activities from the list. */
function filterNamedActivities(activities: Dict[]): Dict[] {
  return activities.filter(
    (activity) => activity["name"] && activity["name"] !== "Unnamed",
  );
}

/** Fetch additional activities from an earlier date range. */
async function fetchMoreActivities(
  athleteId: string,
  startDate: string,
  apiKey: string | undefined,
  apiLimit: number,
): Promise<Dict[]> {
  const oldest = new Date(`${startDate}T00:00:00`);
  const olderStart = new Date(oldest);
  olderStart.setDate(olderStart.getDate() - 60);
  const olderEnd = new Date(oldest);
  olderEnd.setDate(olderEnd.getDate() - 1);

  const olderStartDate = toLocalDateString(olderStart);
  const olderEndDate = toLocalDateString(olderEnd);
  if (olderStartDate >= olderEndDate) return [];

  const moreResult = await makeIntervalsRequest(`/athlete/${athleteId}/activities`, {
    apiKey,
    params: { oldest: olderStartDate, newest: olderEndDate, limit: apiLimit },
  });

  if (Array.isArray(moreResult)) return filterNamedActivities(moreResult as Dict[]);
  return [];
}

function formatActivitiesResponse(
  activities: Dict[],
  athleteId: string,
  includeUnnamed: boolean,
): string {
  if (!activities.length) {
    if (includeUnnamed) {
      return `No valid activities found for athlete ${athleteId} in the specified date range.`;
    }
    return `No named activities found for athlete ${athleteId} in the specified date range. Try with include_unnamed=true to see all activities.`;
  }

  let summary = "Activities:\n\n";
  for (const activity of activities) {
    summary += `${formatActivitySummary(activity)}\n`;
  }
  return summary;
}

const DEFAULT_STREAM_TYPES =
  "time,watts,heartrate,cadence,altitude,distance,velocity_smooth";

export const registerActivityTools: ToolRegistrar = (server) => {
  server.registerTool(
    "get_activities",
    {
      title: "Get Activities",
      description:
        "Get a list of activities for an athlete from Intervals.icu.\n\n" +
        "Each activity includes a 'Sync:' line with a derived data-completeness verdict, " +
        "last-sync time (icu_sync_date) and upstream source. If the verdict is not " +
        "'complete' (e.g. analysis pending or streams still syncing), treat the metrics " +
        "as provisional and caveat or re-check later instead of answering confidently " +
        "from partial data.\n\n" +
        "Args:\n" +
        "    athlete_id: The Intervals.icu athlete ID (optional, uses the configured default)\n" +
        "    api_key: The Intervals.icu API key (optional, uses the configured default)\n" +
        "    start_date: Start date in YYYY-MM-DD format (optional, defaults to 30 days ago)\n" +
        "    end_date: End date in YYYY-MM-DD format (optional, defaults to today)\n" +
        "    limit: Maximum number of activities to return (optional, defaults to 10)\n" +
        "    include_unnamed: Whether to include unnamed activities (optional, defaults to false)",
      inputSchema: {
        athlete_id: z.string().optional(),
        api_key: z.string().optional(),
        start_date: z.string().optional(),
        end_date: z.string().optional(),
        limit: z.number().int().positive().default(10),
        include_unnamed: z.boolean().default(false),
      },
    },
    async ({ athlete_id, api_key, start_date, end_date, limit, include_unnamed }) => {
      const config = getConfig();
      const { athleteId, error } = resolveAthleteId(athlete_id, config.athleteId);
      if (error) return textResult(error);

      const [startDate, endDate] = resolveDateParams(start_date, end_date);

      // Fetch more activities if we need to filter out unnamed ones
      const apiLimit = !include_unnamed ? limit * 3 : limit;

      const result = await makeIntervalsRequest(`/athlete/${athleteId}/activities`, {
        apiKey: api_key,
        params: { oldest: startDate, newest: endDate, limit: apiLimit },
      });

      if (isApiError(result)) {
        return textResult(`Error fetching activities: ${apiErrorMessage(result)}`);
      }
      if (isEmptyResult(result)) {
        return textResult(
          `No activities found for athlete ${athleteId} in the specified date range.`,
        );
      }

      let activities = parseActivitiesFromResult(result);
      if (!activities.length) {
        return textResult(
          `No valid activities found for athlete ${athleteId} in the specified date range.`,
        );
      }

      if (!include_unnamed) {
        activities = filterNamedActivities(activities);
        if (activities.length < limit) {
          const more = await fetchMoreActivities(athleteId, startDate, api_key, apiLimit);
          activities.push(...more);
        }
      }

      activities = activities.slice(0, limit);

      await resolveGearForActivities(activities, { athleteId, apiKey: api_key });

      return textResult(formatActivitiesResponse(activities, athleteId, include_unnamed));
    },
  );

  server.registerTool(
    "get_activity_details",
    {
      title: "Get Activity Details",
      description:
        "Get detailed information for a specific activity from Intervals.icu.\n\n" +
        "Includes a 'Sync & Data Completeness' section built from native API signals " +
        "(analyzed, icu_sync_date, icu_sync_error, analysis_issues, stream_types, source). " +
        "'Data Complete' is a derived verdict: if it is not 'complete', the activity may " +
        "still be syncing or processing — treat metrics as provisional and re-check later.",
      inputSchema: {
        activity_id: z.string().describe("The Intervals.icu activity ID"),
        api_key: z.string().optional(),
      },
    },
    async ({ activity_id, api_key }) => {
      const result = await makeIntervalsRequest(`/activity/${activity_id}`, {
        apiKey: api_key,
      });

      if (isApiError(result)) {
        return textResult(`Error fetching activity details: ${apiErrorMessage(result)}`);
      }
      if (isEmptyResult(result)) {
        return textResult(`No details found for activity ${activity_id}.`);
      }

      const activityData = Array.isArray(result) ? result[0] : result;
      if (typeof activityData !== "object" || activityData === null) {
        return textResult(`Invalid activity format for activity ${activity_id}.`);
      }

      await resolveGearForActivity(activityData as Dict, { apiKey: api_key });

      let detailedView = formatActivitySummary(activityData as Dict, { verbose: true });

      const zones = (activityData as Dict)["zones"];
      if (typeof zones === "object" && zones !== null) {
        detailedView += "\nPower Zones:\n";
        for (const zone of (zones as Dict)["power"] ?? []) {
          detailedView += `Zone ${zone["number"]}: ${zone["secondsInZone"]} seconds\n`;
        }
        detailedView += "\nHeart Rate Zones:\n";
        for (const zone of (zones as Dict)["hr"] ?? []) {
          detailedView += `Zone ${zone["number"]}: ${zone["secondsInZone"]} seconds\n`;
        }
      }

      return textResult(detailedView);
    },
  );

  server.registerTool(
    "get_activity_intervals",
    {
      title: "Get Activity Intervals",
      description:
        "Get interval data for a specific activity from Intervals.icu.\n\n" +
        "This endpoint returns detailed metrics for each interval in an activity, including power, heart rate,\n" +
        "cadence, speed, and environmental data. It also includes grouped intervals if applicable.",
      inputSchema: {
        activity_id: z.string().describe("The Intervals.icu activity ID"),
        api_key: z.string().optional(),
      },
    },
    async ({ activity_id, api_key }) => {
      const result = await makeIntervalsRequest(`/activity/${activity_id}/intervals`, {
        apiKey: api_key,
      });

      if (isApiError(result)) {
        return textResult(`Error fetching intervals: ${apiErrorMessage(result)}`);
      }
      if (isEmptyResult(result)) {
        return textResult(`No interval data found for activity ${activity_id}.`);
      }
      if (
        typeof result !== "object" ||
        Array.isArray(result) ||
        !("icu_intervals" in result || "icu_groups" in (result as Dict))
      ) {
        return textResult(`No interval data or unrecognized format for activity ${activity_id}.`);
      }

      return textResult(formatIntervals(result as Dict));
    },
  );

  server.registerTool(
    "get_activity_streams",
    {
      title: "Get Activity Streams",
      description:
        "Get stream data for a specific activity from Intervals.icu.\n\n" +
        "This endpoint returns time-series data for an activity, including metrics like power, heart rate,\n" +
        "cadence, altitude, distance, temperature, and velocity data.\n\n" +
        "Available stream types: time, watts, heartrate, cadence, altitude, distance,\n" +
        "core_temperature, skin_temperature, velocity_smooth, latlng\n\n" +
        "Note: the latlng stream is returned as [lat, lng] points (the API stores\n" +
        "latitude in `data` and longitude in a sibling `data2` field).\n\n" +
        "The response warns when a requested stream type is missing — the activity's " +
        "streams may still be syncing. Check get_activity_details (Sync & Data " +
        "Completeness section) before concluding the athlete has no such data.",
      inputSchema: {
        activity_id: z.string().describe("The Intervals.icu activity ID"),
        api_key: z.string().optional(),
        stream_types: z
          .string()
          .optional()
          .describe(
            "Comma-separated list of stream types to retrieve (optional, defaults to common types)",
          ),
      },
    },
    async ({ activity_id, api_key, stream_types }) => {
      const result = await makeIntervalsRequest(`/activity/${activity_id}/streams`, {
        apiKey: api_key,
        params: { types: stream_types || DEFAULT_STREAM_TYPES },
      });

      if (isApiError(result)) {
        return textResult(`Error fetching activity streams: ${apiErrorMessage(result)}`);
      }

      const streams = Array.isArray(result) ? (result as Dict[]) : [];
      if (!streams.length) {
        return textResult(`No stream data found for activity ${activity_id}.`);
      }

      let summary = `Activity Streams for ${activity_id}:\n\n`;
      for (const stream of streams) {
        const streamType = stream["type"] ?? "unknown";
        const streamName = stream["name"] ?? streamType;
        // latlng carries latitude in `data` and longitude in `data2` — zip
        // into [lat, lng] points so the longitude half isn't lost.
        const data =
          streamType === "latlng" ? zipLatLngStream(stream) : ((stream["data"] ?? []) as unknown[]);
        const valueType = stream["valueType"] ?? "";

        summary += `Stream: ${streamName} (${streamType})\n`;
        summary += `  Value Type: ${valueType}\n`;
        summary += `  Data Points: ${data.length}\n`;

        if (data.length > 0) {
          if (data.length <= 10) {
            summary += `  Values: ${JSON.stringify(data)}\n`;
          } else {
            summary += `  First 5 values: ${JSON.stringify(data.slice(0, 5))}\n`;
            summary += `  Last 5 values: ${JSON.stringify(data.slice(-5))}\n`;
          }
        }
        summary += "\n";
      }

      // Warn about requested streams that are absent — they may still be
      // syncing upstream rather than genuinely not recorded.
      const requestedTypes = (stream_types || DEFAULT_STREAM_TYPES)
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const returnedTypes = new Set(
        streams.map((stream) => String(stream["type"] ?? "")).filter(Boolean),
      );
      const missing = requestedTypes.filter((t) => !returnedTypes.has(t));
      if (missing.length) {
        summary +=
          `Warning: requested streams not returned: ${missing.join(", ")}. ` +
          "These may not exist for this activity, or the activity's streams may still " +
          "be syncing — check get_activity_details (Sync & Data Completeness) before " +
          "concluding the data is absent.\n";
      }

      return textResult(summary);
    },
  );

  server.registerTool(
    "get_activity_messages",
    {
      title: "Get Activity Messages",
      description: "Get messages (notes/comments) for a specific activity from Intervals.icu.",
      inputSchema: {
        activity_id: z.string().describe("The Intervals.icu activity ID"),
        api_key: z.string().optional(),
      },
    },
    async ({ activity_id, api_key }) => {
      const result = await makeIntervalsRequest(`/activity/${activity_id}/messages`, {
        apiKey: api_key,
      });

      if (isApiError(result)) {
        return textResult(`Error fetching activity messages: ${apiErrorMessage(result)}`);
      }

      const messages = Array.isArray(result) ? (result as Dict[]) : [];
      if (!messages.length) {
        return textResult(`No messages found for activity ${activity_id}.`);
      }

      let output = `Messages for activity ${activity_id}:\n\n`;
      for (const msg of messages) {
        output += `${formatActivityMessage(msg)}\n\n`;
      }
      return textResult(output);
    },
  );

  server.registerTool(
    "add_activity_message",
    {
      title: "Add Activity Message",
      description: "Add a message (note/comment) to an activity on Intervals.icu.",
      inputSchema: {
        activity_id: z.string().describe("The Intervals.icu activity ID"),
        content: z.string().describe("The message text to add"),
        api_key: z.string().optional(),
      },
    },
    async ({ activity_id, content, api_key }) => {
      const result = await makeIntervalsRequest(`/activity/${activity_id}/messages`, {
        apiKey: api_key,
        method: "POST",
        data: { content },
      });

      if (isApiError(result)) {
        return textResult(`Error adding message to activity: ${apiErrorMessage(result)}`);
      }
      if (typeof result !== "object" || result === null || Array.isArray(result)) {
        return textResult("Error: Unexpected response when adding message.");
      }

      const msgId = (result as Dict)["id"];
      if (msgId != null) {
        return textResult(
          `Successfully added message (ID: ${msgId}) to activity ${activity_id}.`,
        );
      }
      return textResult(
        `Message appears to have been added to activity ${activity_id}, but no ID was returned. Please verify manually.`,
      );
    },
  );
};
