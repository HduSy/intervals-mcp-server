/**
 * Data-completeness and provenance assessment for activities.
 *
 * The Intervals.icu API does not have an explicit `data_complete` flag, but it
 * exposes several native signals that together answer the question:
 *
 *   icu_sync_date   — when the activity was last synced/updated from upstream
 *   icu_sync_error  — set when the sync from the upstream source failed
 *   analyzed        — when server-side analysis finished (null = pending).
 *                     Per the Intervals.icu maintainer, Strava-sourced
 *                     activities may leave this null while the data is fine.
 *   analysis_issues — data-quality issues found during analysis
 *   stream_types    — which time-series streams exist for the activity
 *   source          — upstream origin (e.g. GARMIN_CONNECT, STRAVA)
 *   external_id     — original upstream filename/identifier
 *
 * This module combines those into a single verdict. The verdict itself is
 * client-derived, so anywhere it is surfaced it is marked "(derived)".
 */

import { formatIsoDateTime } from "./dates.js";
import type { Dict } from "./formatting.js";

export type CompletenessStatus = "complete" | "pending" | "incomplete";

export interface CompletenessAssessment {
  status: CompletenessStatus;
  /** Human-readable reasons/warnings; empty for a clean complete verdict. */
  notes: string[];
}

/** How recently an activity can have synced before we stop flagging it as
 * "may still be settling" (streams/analysis can lag the activity record). */
const RECENT_SYNC_MS = 15 * 60 * 1000;

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * Derive a completeness verdict from the native API signals on an activity.
 *
 * Only signals present on the payload are evaluated — the list endpoint may
 * omit `stream_types`, in which case the stream check is skipped.
 */
export function assessActivityCompleteness(activity: Dict, now = new Date()): CompletenessAssessment {
  const notes: string[] = [];
  let status: CompletenessStatus = "complete";

  // Hardest signal: the sync itself failed.
  const syncError = activity["icu_sync_error"];
  if (syncError != null && syncError !== "") {
    return { status: "incomplete", notes: [`sync error: ${String(syncError)}`] };
  }

  // Analysis not finished yet — data may still change.
  const analyzed = activity["analyzed"];
  if (analyzed == null) {
    const source = String(activity["source"] ?? "");
    if (source.toUpperCase().includes("STRAVA")) {
      notes.push(
        "Strava-sourced activity has no server analysis timestamp — metrics may come from Strava and completeness cannot be confirmed",
      );
      status = "pending";
    } else {
      notes.push("server-side analysis has not finished yet (analyzed is null)");
      status = "pending";
    }
  }

  // Stream presence cross-checked against device capabilities, when the
  // payload carries stream_types (activity detail endpoint).
  const streamTypes = asStringArray(activity["stream_types"]);
  if (streamTypes.length) {
    const hasPowerDevice = activity["device_watts"] === true || activity["power_meter"] != null;
    if (hasPowerDevice && !streamTypes.includes("watts")) {
      notes.push("power meter recorded but no watts stream yet — streams may still be syncing");
      status = "incomplete";
    }
    if (activity["has_heartrate"] === true && !streamTypes.includes("heartrate")) {
      notes.push("heart rate recorded but no heartrate stream yet — streams may still be syncing");
      status = "incomplete";
    }
  }

  // Data-quality issues found by the analyzer: keep status but surface them.
  const issues = activity["analysis_issues"];
  if (issues != null) {
    const text = typeof issues === "object" ? JSON.stringify(issues) : String(issues);
    notes.push(`analysis issues: ${text}`);
  }

  // Freshness advisory: a very recent sync means things may still settle.
  const syncDate = activity["icu_sync_date"];
  if (typeof syncDate === "string") {
    const syncedAt = Date.parse(syncDate);
    if (!Number.isNaN(syncedAt) && now.getTime() - syncedAt < RECENT_SYNC_MS) {
      notes.push("synced less than 15 minutes ago — streams/analysis may still be settling");
    }
  }

  return { status, notes };
}

/** One-line sync/completeness summary for list views. */
export function formatSyncLine(activity: Dict, now = new Date()): string {
  const { status, notes } = assessActivityCompleteness(activity, now);
  const verdict =
    status === "complete" && notes.length === 0
      ? "complete"
      : `${status} — ${notes.join("; ")}`;
  const synced = typeof activity["icu_sync_date"] === "string"
    ? formatIsoDateTime(activity["icu_sync_date"])
    : "N/A";
  const source = activity["source"] ?? "N/A";
  return `Sync: ${verdict} (derived) | Last Sync: ${synced} | Source: ${source}`;
}

/** Full sync/completeness/provenance block for detail views. */
export function formatSyncSection(activity: Dict, now = new Date()): string {
  const { status, notes } = assessActivityCompleteness(activity, now);

  const analyzed = typeof activity["analyzed"] === "string"
    ? formatIsoDateTime(activity["analyzed"])
    : String(activity["analyzed"] ?? "N/A");
  const synced = typeof activity["icu_sync_date"] === "string"
    ? formatIsoDateTime(activity["icu_sync_date"])
    : String(activity["icu_sync_date"] ?? "N/A");
  const created = typeof activity["created"] === "string"
    ? formatIsoDateTime(activity["created"])
    : String(activity["created"] ?? "N/A");
  const streamTypes = asStringArray(activity["stream_types"]);

  const lines = [
    "Sync & Data Completeness:",
    `Data Complete: ${status} (derived from analyzed/sync/stream signals below)`,
  ];
  if (notes.length) {
    for (const note of notes) lines.push(`Note: ${note}`);
  }
  lines.push(`Last Updated (icu_sync_date): ${synced}`);
  lines.push(`Analyzed: ${analyzed}`);
  lines.push(`Created: ${created}`);
  if (activity["icu_sync_error"] != null) {
    lines.push(`Sync Error: ${activity["icu_sync_error"]}`);
  }
  if (activity["analysis_issues"] != null) {
    lines.push(`Analysis Issues: ${JSON.stringify(activity["analysis_issues"])}`);
  }
  lines.push(`Source: ${activity["source"] ?? "N/A"}${activity["oauth_client_name"] ? ` (via ${activity["oauth_client_name"]})` : ""}`);
  lines.push(`External ID: ${activity["external_id"] ?? "N/A"}`);
  if (streamTypes.length) {
    lines.push(`Available Streams: ${streamTypes.join(", ")}`);
  } else {
    lines.push("Available Streams: unknown (field not present on this payload)");
  }
  lines.push("");
  lines.push(
    "If Data Complete is not 'complete', treat metrics as provisional — " +
      "data may still be syncing or processing upstream; re-check later.",
  );
  return lines.join("\n");
}
