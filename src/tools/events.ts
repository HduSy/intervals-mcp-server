/**
 * Event tools: retrieval, creation, update, and deletion of calendar events.
 */

import { z } from "zod";
import { makeIntervalsRequest, isApiError } from "../api/client.js";
import { getConfig } from "../config.js";
import { getDefaultEndDate, getDefaultFutureEndDate } from "../utils/dates.js";
import { formatEventDetails, formatEventSummary, type Dict } from "../utils/formatting.js";
import { formatWorkoutDoc, WorkoutDocSchema } from "../utils/types.js";
import {
  resolveActivityType,
  resolveAthleteId,
  validateDate,
} from "../utils/validation.js";
import { textResult, apiErrorMessage, type ToolRegistrar } from "./shared.js";

const WORKOUT_DOC_HELP = `Post event for an athlete to Intervals.icu. If event_id is provided, the event will be updated instead of created.

Example:
    "workout_doc": {
        "description": "High-intensity workout for increasing VO2 max",
        "steps": [
            {"power": {"value": 80, "units": "%ftp"}, "duration": 900, "warmup": true},
            {"reps": 2, "text": "High-intensity intervals", "steps": [
                {"power": {"value": 110, "units": "%ftp"}, "distance": 500, "text": "High-intensity"},
                {"power": {"value": 80, "units": "%ftp"}, "duration": 90, "text": "Recovery"}
            ]},
            {"power": {"value": 80, "units": "%ftp"}, "duration": 600, "cooldown": true},
            {"text": ""}
        ]
    }

Step properties:
    distance: Distance of step in meters
        {"distance": 5000}
    duration: Duration of step in seconds
        {"duration": 1800}
    power/hr/pace/cadence: Define step intensity
        Percentage of FTP: {"power": {"value": 80, "units": "%ftp"}}
        Absolute power: {"power": {"value": 200, "units": "w"}}
        Heart rate: {"hr": {"value": 75, "units": "%hr"}}
        Heart rate (LTHR): {"hr": {"value": 85, "units": "%lthr"}}
        Cadence: {"cadence": {"value": 90, "units": "cadence"}}
        Pace by ftp: {"pace": {"value": 80, "units": "%pace"}}
        Pace by zone: {"pace": {"value": 2, "units": "pace_zone"}}
        Zone by power: {"power": {"value": 2, "units": "power_zone"}}
        Zone by heart rate: {"hr": {"value": 2, "units": "hr_zone"}}
    Ranges: Specify ranges for power, heart rate, or cadence:
        {"power": {"start": 80, "end": 90, "units": "%ftp"}}
    Ramps: Instead of a range, indicate a gradual change in intensity (useful for ERG workouts):
        {"ramp": true, "power": {"start": 80, "end": 90, "units": "%ftp"}}
    Repeats: include the reps property and add nested steps
        {"reps": 3,
         "steps": [
            {"power": {"value": 110, "units": "%ftp"}, "distance": 500, "text": "High-intensity"},
            {"power": {"value": 80, "units": "%ftp"}, "duration": 90, "text": "Recovery"}
        ]}
    Free Ride: Include freeride to indicate a segment without ERG control, optionally with a suggested power range:
        {"freeride": true, "power": {"value": 80, "units": "%ftp"}}
    Comments and Labels: Add descriptive text to label steps:
        {"text": "Warmup"}

How to use steps:
- Set distance or duration as appropriate for step
- Use "reps" with nested steps to define repeat intervals (as in example above)
- Define one of "power", "hr" or "pace" to define step intensity`;

function prepareEventData(
  name: string,
  workoutType: string,
  startDate: string,
  workoutDoc: z.infer<typeof WorkoutDocSchema> | undefined,
  movingTime: number | null,
  distance: number | null,
): Dict {
  const resolvedWorkoutType = resolveActivityType(name, workoutType);
  return {
    start_date_local: `${startDate}T00:00:00`,
    category: "WORKOUT",
    name,
    description: workoutDoc ? formatWorkoutDoc(workoutDoc) : null,
    type: resolvedWorkoutType,
    moving_time: movingTime,
    distance,
  };
}

async function handleEventResponse(
  result: unknown,
  action: string,
  athleteId: string,
  startDate: string,
): Promise<string> {
  if (isApiError(result)) {
    return `Error ${action} event: ${apiErrorMessage(result)}`;
  }
  if (
    result == null ||
    (typeof result === "object" && !Array.isArray(result) && Object.keys(result).length === 0)
  ) {
    return `No events ${action} for athlete ${athleteId}.`;
  }
  if (typeof result === "object" && !Array.isArray(result)) {
    return `Successfully ${action} event id: ${(result as Dict)["id"]}`;
  }
  return `Event ${action} successfully at ${startDate}`;
}

async function createOrUpdateEventRequest(
  athleteId: string,
  apiKey: string | undefined,
  eventData: Dict,
  startDate: string,
  eventId: string | undefined,
): Promise<string> {
  let url = `/athlete/${athleteId}/events`;
  if (eventId) url += `/${eventId}`;
  const result = await makeIntervalsRequest(url, {
    apiKey,
    data: eventData,
    method: eventId ? "PUT" : "POST",
  });
  const action = eventId ? "updated" : "created";
  return handleEventResponse(result, action, athleteId, startDate);
}

export const registerEventTools: ToolRegistrar = (server) => {
  server.registerTool(
    "get_events",
    {
      title: "Get Events",
      description:
        "Get events for an athlete from Intervals.icu.\n\n" +
        "Args:\n" +
        "    athlete_id: The Intervals.icu athlete ID (optional, uses the configured default)\n" +
        "    api_key: The Intervals.icu API key (optional, uses the configured default)\n" +
        "    start_date: Start date in YYYY-MM-DD format (optional, defaults to today)\n" +
        "    end_date: End date in YYYY-MM-DD format (optional, defaults to 30 days from today)",
      inputSchema: {
        athlete_id: z.string().optional(),
        api_key: z.string().optional(),
        start_date: z.string().optional(),
        end_date: z.string().optional(),
      },
    },
    async ({ athlete_id, api_key, start_date, end_date }) => {
      const config = getConfig();
      const { athleteId, error } = resolveAthleteId(athlete_id, config.athleteId);
      if (error) return textResult(error);

      const oldest = start_date || getDefaultEndDate();
      const newest = end_date || getDefaultFutureEndDate();

      const result = await makeIntervalsRequest(`/athlete/${athleteId}/events`, {
        apiKey: api_key,
        params: { oldest, newest },
      });

      if (isApiError(result)) {
        return textResult(`Error fetching events: ${apiErrorMessage(result)}`);
      }

      const events = Array.isArray(result) ? (result as Dict[]) : [];
      if (!events.length) {
        return textResult(
          `No events found for athlete ${athleteId} in the specified date range.`,
        );
      }

      let summary = "Events:\n\n";
      for (const event of events) {
        if (typeof event !== "object" || event === null) continue;
        summary += `${formatEventSummary(event)}\n\n`;
      }
      return textResult(summary);
    },
  );

  server.registerTool(
    "get_event_by_id",
    {
      title: "Get Event By ID",
      description: "Get detailed information for a specific event from Intervals.icu.",
      inputSchema: {
        event_id: z.string().describe("The Intervals.icu event ID"),
        athlete_id: z.string().optional(),
        api_key: z.string().optional(),
      },
    },
    async ({ event_id, athlete_id, api_key }) => {
      const config = getConfig();
      const { athleteId, error } = resolveAthleteId(athlete_id, config.athleteId);
      if (error) return textResult(error);

      const result = await makeIntervalsRequest(`/athlete/${athleteId}/event/${event_id}`, {
        apiKey: api_key,
      });

      if (isApiError(result)) {
        return textResult(`Error fetching event details: ${apiErrorMessage(result)}`);
      }
      if (
        result == null ||
        Array.isArray(result) ||
        Object.keys(result as Dict).length === 0
      ) {
        return textResult(`No details found for event ${event_id}.`);
      }

      return textResult(formatEventDetails(result as Dict));
    },
  );

  server.registerTool(
    "delete_event",
    {
      title: "Delete Event",
      description: "Delete an event for an athlete from Intervals.icu.",
      inputSchema: {
        event_id: z.string().describe("The Intervals.icu event ID"),
        athlete_id: z.string().optional(),
        api_key: z.string().optional(),
      },
    },
    async ({ event_id, athlete_id, api_key }) => {
      const config = getConfig();
      const { athleteId, error } = resolveAthleteId(athlete_id, config.athleteId);
      if (error) return textResult(error);
      if (!event_id) return textResult("Error: No event ID provided.");

      const result = await makeIntervalsRequest(`/athlete/${athleteId}/events/${event_id}`, {
        apiKey: api_key,
        method: "DELETE",
      });

      if (isApiError(result)) {
        return textResult(`Error deleting event: ${apiErrorMessage(result)}`);
      }
      return textResult(JSON.stringify(result, null, 2));
    },
  );

  server.registerTool(
    "delete_events_by_date_range",
    {
      title: "Delete Events By Date Range",
      description:
        "Delete events for an athlete from Intervals.icu in the specified date range.",
      inputSchema: {
        start_date: z.string().describe("Start date in YYYY-MM-DD format"),
        end_date: z.string().describe("End date in YYYY-MM-DD format"),
        athlete_id: z.string().optional(),
        api_key: z.string().optional(),
      },
    },
    async ({ start_date, end_date, athlete_id, api_key }) => {
      const config = getConfig();
      const { athleteId, error } = resolveAthleteId(athlete_id, config.athleteId);
      if (error) return textResult(error);

      let oldest: string, newest: string;
      try {
        oldest = validateDate(start_date);
        newest = validateDate(end_date);
      } catch (e) {
        return textResult(`Error deleting events: ${(e as Error).message}`);
      }

      const fetchResult = await makeIntervalsRequest(`/athlete/${athleteId}/events`, {
        apiKey: api_key,
        params: { oldest, newest },
      });
      if (isApiError(fetchResult)) {
        return textResult(`Error deleting events: ${apiErrorMessage(fetchResult)}`);
      }
      const events = Array.isArray(fetchResult) ? (fetchResult as Dict[]) : [];

      const failedEvents: unknown[] = [];
      for (const event of events) {
        const deleteResult = await makeIntervalsRequest(
          `/athlete/${athleteId}/events/${event["id"]}`,
          { apiKey: api_key, method: "DELETE" },
        );
        if (isApiError(deleteResult)) failedEvents.push(event["id"]);
      }

      const deletedCount = events.length - failedEvents.length;
      return textResult(
        `Deleted ${deletedCount} events. Failed to delete ${failedEvents.length} events: ${JSON.stringify(failedEvents)}`,
      );
    },
  );

  server.registerTool(
    "add_or_update_event",
    {
      title: "Add Or Update Event",
      description: WORKOUT_DOC_HELP,
      inputSchema: {
        workout_type: z
          .string()
          .describe("Workout type (e.g. Ride, Run, Swim, Walk, Row)"),
        name: z.string().describe("Name of the activity"),
        athlete_id: z.string().optional(),
        api_key: z.string().optional(),
        event_id: z
          .string()
          .optional()
          .describe("The Intervals.icu event ID (optional; if set the event is updated)"),
        start_date: z
          .string()
          .optional()
          .describe("Start date in YYYY-MM-DD format (optional, defaults to today)"),
        workout_doc: WorkoutDocSchema.optional().describe(
          "Steps as a list of step objects (optional, needed to define workout steps)",
        ),
        moving_time: z
          .number()
          .nullable()
          .optional()
          .describe("Total expected moving time of the workout in seconds (optional)"),
        distance: z
          .number()
          .nullable()
          .optional()
          .describe("Total expected distance of the workout in meters (optional)"),
      },
    },
    async ({
      workout_type,
      name,
      athlete_id,
      api_key,
      event_id,
      start_date,
      workout_doc,
      moving_time,
      distance,
    }) => {
      const config = getConfig();
      const { athleteId, error } = resolveAthleteId(athlete_id, config.athleteId);
      if (error) return textResult(error);

      const startDate = start_date || getDefaultEndDate();
      try {
        const validatedDate = validateDate(startDate);
        const eventData = prepareEventData(
          name,
          workout_type,
          validatedDate,
          workout_doc,
          moving_time ?? null,
          distance ?? null,
        );
        return textResult(
          await createOrUpdateEventRequest(
            athleteId,
            api_key,
            eventData,
            validatedDate,
            event_id,
          ),
        );
      } catch (e) {
        return textResult(`Error: ${(e as Error).message}`);
      }
    },
  );

  server.registerTool(
    "add_or_update_note",
    {
      title: "Add Or Update Note",
      description:
        "Add or update a plain text note (category NOTE) on the Intervals.icu calendar.",
      inputSchema: {
        name: z.string().describe("Title of the note"),
        description: z.string().describe("Plain text content of the note"),
        start_date: z
          .string()
          .optional()
          .describe("Date in YYYY-MM-DD format (optional, defaults to today)"),
        color: z.string().optional().describe("Color of the note (e.g. green, orange, red, blue)"),
        athlete_id: z.string().optional(),
        api_key: z.string().optional(),
        event_id: z
          .string()
          .optional()
          .describe("The Intervals.icu event ID (optional, for updates)"),
      },
    },
    async ({ name, description, start_date, color, athlete_id, api_key, event_id }) => {
      const config = getConfig();
      const { athleteId, error } = resolveAthleteId(athlete_id, config.athleteId);
      if (error) return textResult(error);

      const startDate = start_date || getDefaultEndDate();
      try {
        const validatedDate = validateDate(startDate);
        const eventData: Dict = {
          category: "NOTE",
          name,
          description,
          start_date_local: `${validatedDate}T00:00:00`,
          color: color ?? "green",
        };
        return textResult(
          await createOrUpdateEventRequest(
            athleteId,
            api_key,
            eventData,
            validatedDate,
            event_id,
          ),
        );
      } catch (e) {
        return textResult(`Error: ${(e as Error).message}`);
      }
    },
  );
};
