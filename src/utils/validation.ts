/**
 * Validation utilities for tool input parameters.
 */

import { parseDateRange } from "./dates.js";

const ATHLETE_ID_PATTERN = /^i?\d+$/;

/**
 * Validate that an athlete ID is well formed.
 * Empty strings are allowed (meaning no default athlete ID is set).
 * Non-empty IDs must be all digits or 'i' followed by digits.
 */
export function validateAthleteId(athleteId: string): void {
  if (athleteId && !ATHLETE_ID_PATTERN.test(athleteId)) {
    throw new Error(
      "ATHLETE_ID must be all digits (e.g. 123456) or start with 'i' followed by digits (e.g. i123456)",
    );
  }
}

/**
 * Validate that a date string is a real date in YYYY-MM-DD format.
 * Returns the validated string, or throws.
 */
export function validateDate(dateStr: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
    const parsed = new Date(y, m - 1, d);
    if (
      parsed.getFullYear() === y &&
      parsed.getMonth() === m - 1 &&
      parsed.getDate() === d
    ) {
      return dateStr;
    }
  }
  throw new Error("Invalid date format. Please use YYYY-MM-DD.");
}

export interface ResolvedAthleteId {
  athleteId: string;
  error: string | null;
}

/**
 * Resolve the athlete ID from an explicit parameter or the configured default.
 * Returns the ID plus an error message when neither is available.
 */
export function resolveAthleteId(
  athleteId: string | undefined | null,
  defaultAthleteId: string,
): ResolvedAthleteId {
  const idToUse = athleteId ?? defaultAthleteId;
  if (!idToUse) {
    return {
      athleteId: "",
      error:
        "Error: No athlete ID provided and no default ATHLETE_ID found. Run `npx intervals-mcp-server auth` to configure your credentials.",
    };
  }
  return { athleteId: idToUse, error: null };
}

/**
 * Determine the activity type from an explicit value or by inferring it from
 * the event/workout name. Defaults to "Ride".
 */
export function resolveActivityType(
  name: string | undefined | null,
  activityType?: string | null,
): string {
  if (activityType) return activityType;
  const nameLower = name?.toLowerCase() ?? "";
  const mapping: Array<[string, string[]]> = [
    ["Ride", ["bike", "cycle", "cycling", "ride"]],
    ["Run", ["run", "running", "jog", "jogging"]],
    ["Swim", ["swim", "swimming", "pool"]],
    ["Walk", ["walk", "walking", "hike", "hiking"]],
    ["Row", ["row", "rowing"]],
  ];
  for (const [workout, keywords] of mapping) {
    if (keywords.some((keyword) => nameLower.includes(keyword))) {
      return workout;
    }
  }
  return "Ride";
}

/** Resolve start/end date parameters with defaults (start 30 days ago, end today). */
export function resolveDateParams(
  startDate?: string | null,
  endDate?: string | null,
  defaultStartDaysAgo = 30,
): [string, string] {
  return parseDateRange(startDate, endDate, defaultStartDaysAgo);
}
