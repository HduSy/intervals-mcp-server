/**
 * Formatting utilities for Intervals.icu API payloads.
 *
 * All formatters take loosely-typed API dictionaries and render readable text.
 */

import { formatIsoDateTime } from "./dates.js";
import { formatSyncLine, formatSyncSection } from "./completeness.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Dict = Record<string, any>;

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

export interface ActivitySummaryOptions {
  /** Detail views append the full sync/completeness/provenance block. */
  verbose?: boolean;
}

export function formatActivitySummary(activity: Dict, options: ActivitySummaryOptions = {}): string {
  let startTime = activity["startTime"] ?? activity["start_date"] ?? "Unknown";
  if (typeof startTime === "string" && startTime.length > 10) {
    startTime = formatIsoDateTime(startTime);
  }

  let rpe: unknown = activity["perceived_exertion"] ?? activity["icu_rpe"] ?? "N/A";
  if (typeof rpe === "number") rpe = `${rpe}/10`;

  let feel: unknown = activity["feel"] ?? "N/A";
  if (typeof feel === "number") feel = `${feel}/5`;

  // Gear (bike, shoes). Activity payloads include the gear ID but not the
  // name; tools/gear.ts resolves it and injects `_resolved_gear_name` before
  // this formatter runs.
  const resolvedName = activity["_resolved_gear_name"];
  const gearRaw = activity["gear"];
  let gearName: string;
  let gearId: unknown;
  if (resolvedName) {
    gearName = resolvedName;
    gearId =
      typeof gearRaw === "object" && gearRaw !== null
        ? (gearRaw["id"] ?? activity["gear_id"] ?? "N/A")
        : (activity["gear_id"] ?? "N/A");
  } else if (typeof gearRaw === "object" && gearRaw !== null) {
    gearName = gearRaw["name"] || gearRaw["display_name"] || "N/A";
    gearId = gearRaw["id"] ?? "N/A";
  } else {
    gearName = activity["gear_name"] ?? "N/A";
    gearId = activity["gear_id"] ?? "N/A";
  }

  const syncLine = formatSyncLine(activity);

  let summary = `Activity: ${activity["name"] ?? "Unnamed"}
ID: ${activity["id"] ?? "N/A"}
Type: ${activity["type"] ?? "Unknown"}
Date: ${startTime}
${syncLine}
Description: ${activity["description"] ?? "N/A"}
Distance: ${activity["distance"] ?? 0} meters
Duration: ${activity["duration"] ?? activity["elapsed_time"] ?? 0} seconds
Moving Time: ${activity["moving_time"] ?? "N/A"} seconds
Elevation Gain: ${activity["elevationGain"] ?? activity["total_elevation_gain"] ?? 0} meters
Elevation Loss: ${activity["total_elevation_loss"] ?? "N/A"} meters

Power Data:
Average Power: ${activity["avgPower"] ?? activity["icu_average_watts"] ?? activity["average_watts"] ?? "N/A"} watts
Weighted Avg Power: ${activity["icu_weighted_avg_watts"] ?? "N/A"} watts
Training Load: ${activity["trainingLoad"] ?? activity["icu_training_load"] ?? "N/A"}
FTP: ${activity["icu_ftp"] ?? "N/A"} watts
Kilojoules: ${activity["icu_joules"] ?? "N/A"}
Intensity: ${activity["icu_intensity"] ?? "N/A"}
Power:HR Ratio: ${activity["icu_power_hr"] ?? "N/A"}
Variability Index: ${activity["icu_variability_index"] ?? "N/A"}

Heart Rate Data:
Average Heart Rate: ${activity["avgHr"] ?? activity["average_heartrate"] ?? "N/A"} bpm
Max Heart Rate: ${activity["max_heartrate"] ?? "N/A"} bpm
LTHR: ${activity["lthr"] ?? "N/A"} bpm
Resting HR: ${activity["icu_resting_hr"] ?? "N/A"} bpm
Decoupling: ${activity["decoupling"] ?? "N/A"}

Other Metrics:
Cadence: ${activity["average_cadence"] ?? "N/A"} rpm
Calories burned: ${activity["calories"] ?? "N/A"} kcal
Average Speed: ${activity["average_speed"] ?? "N/A"} m/s
Max Speed: ${activity["max_speed"] ?? "N/A"} m/s
Average Stride: ${activity["average_stride"] ?? "N/A"}
L/R Balance: ${activity["avg_lr_balance"] ?? "N/A"}
Weight: ${activity["icu_weight"] ?? "N/A"} kg
RPE: ${rpe}
Session RPE: ${activity["session_rpe"] ?? "N/A"}
Feel: ${feel}

Environment:
Trainer: ${activity["trainer"] ?? "N/A"}
Average Temp: ${activity["average_temp"] ?? "N/A"}°C
Min Temp: ${activity["min_temp"] ?? "N/A"}°C
Max Temp: ${activity["max_temp"] ?? "N/A"}°C
Avg Wind Speed: ${activity["average_wind_speed"] ?? "N/A"} km/h
Headwind %: ${activity["headwind_percent"] ?? "N/A"}%
Tailwind %: ${activity["tailwind_percent"] ?? "N/A"}%

Training Metrics:
Fitness (CTL): ${activity["icu_ctl"] ?? "N/A"}
Fatigue (ATL): ${activity["icu_atl"] ?? "N/A"}
TRIMP: ${activity["trimp"] ?? "N/A"}
Polarization Index: ${activity["polarization_index"] ?? "N/A"}
Power Load: ${activity["power_load"] ?? "N/A"}
HR Load: ${activity["hr_load"] ?? "N/A"}
Pace Load: ${activity["pace_load"] ?? "N/A"}
Efficiency Factor: ${activity["icu_efficiency_factor"] ?? "N/A"}

Device Info:
Device: ${activity["device_name"] ?? "N/A"}
Power Meter: ${activity["power_meter"] ?? "N/A"}
File Type: ${activity["file_type"] ?? "N/A"}

Gear:
Name: ${gearName}
ID: ${gearId}`;

  if (options.verbose) {
    summary += `\n\n${formatSyncSection(activity)}`;
  }

  return summary;
}

export function formatWorkout(workout: Dict): string {
  return `Workout: ${workout["name"] ?? "Unnamed"}
Description: ${workout["description"] ?? "No description"}
Sport: ${workout["sport"] ?? "Unknown"}
Duration: ${workout["duration"] ?? 0} seconds
TSS: ${workout["tss"] ?? "N/A"}
Intervals: ${(workout["intervals"] ?? []).length}`;
}

export function formatActivityMessage(message: Dict): string {
  let created = message["created"] ?? "Unknown";
  if (typeof created === "string" && created.length > 10) {
    created = formatIsoDateTime(created);
  }
  return `Author: ${message["name"] ?? "Unknown"}
Date: ${created}
Type: ${message["type"] ?? "TEXT"}
Content: ${message["content"] ?? ""}`;
}

// ---------------------------------------------------------------------------
// Wellness
// ---------------------------------------------------------------------------

function formatTrainingMetrics(get: (k: string) => unknown): string[] {
  const rows: Array<[string, string]> = [
    ["ctl", "Fitness (CTL)"],
    ["atl", "Fatigue (ATL)"],
    ["rampRate", "Ramp Rate"],
    ["ctlLoad", "CTL Load"],
    ["atlLoad", "ATL Load"],
  ];
  const lines: string[] = [];
  for (const [k, label] of rows) {
    if (get(k) != null) lines.push(`- ${label}: ${get(k)}`);
  }
  return lines;
}

function formatSportInfo(get: (k: string) => unknown): string[] {
  const lines: string[] = [];
  const sportInfo = get("sportInfo");
  if (Array.isArray(sportInfo)) {
    for (const sport of sportInfo) {
      if (typeof sport === "object" && sport !== null && sport["eftp"] != null) {
        lines.push(`- ${sport["type"]}: eFTP = ${sport["eftp"]}`);
      }
    }
  }
  return lines;
}

function formatVitalSigns(get: (k: string) => unknown): string[] {
  const rows: Array<[string, string, string]> = [
    ["weight", "Weight", "kg"],
    ["restingHR", "Resting HR", "bpm"],
    ["hrv", "HRV", ""],
    ["hrvSDNN", "HRV SDNN", ""],
    ["avgSleepingHR", "Average Sleeping HR", "bpm"],
    ["spO2", "SpO2", "%"],
    ["systolic", "Systolic BP", ""],
    ["diastolic", "Diastolic BP", ""],
    ["respiration", "Respiration", "breaths/min"],
    ["bloodGlucose", "Blood Glucose", "mmol/L"],
    ["lactate", "Lactate", "mmol/L"],
    ["vo2max", "VO2 Max", "ml/kg/min"],
    ["bodyFat", "Body Fat", "%"],
    ["abdomen", "Abdomen", "cm"],
    ["baevskySI", "Baevsky Stress Index", ""],
  ];
  const lines: string[] = [];
  for (const [k, label, unit] of rows) {
    if (get(k) == null) continue;
    if (k === "systolic" && get("diastolic") != null) {
      lines.push(`- Blood Pressure: ${get("systolic")}/${get("diastolic")} mmHg`);
    } else if (k !== "systolic" && k !== "diastolic") {
      lines.push(`- ${label}: ${get(k)}${unit ? ` ${unit}` : ""}`);
    }
  }
  return lines;
}

const SLEEP_QUALITY_LABELS: Record<number, string> = {
  1: "Great",
  2: "Good",
  3: "Average",
  4: "Poor",
};

function formatSleepRecovery(get: (k: string) => unknown): string[] {
  const lines: string[] = [];
  let sleepHours: string | null = null;
  if (get("sleepSecs") != null) {
    const secs = get("sleepSecs") as number;
    sleepHours = (secs / 3600).toFixed(2);
  } else if (get("sleepHours") != null) {
    sleepHours = `${get("sleepHours")}`;
  }
  if (sleepHours !== null) lines.push(`  Sleep: ${sleepHours} hours`);

  if (get("sleepQuality") != null) {
    const quality = get("sleepQuality") as number;
    lines.push(`  Sleep Quality: ${quality} (${SLEEP_QUALITY_LABELS[quality] ?? String(quality)})`);
  }
  if (get("sleepScore") != null) lines.push(`  Device Sleep Score: ${get("sleepScore")}/100`);
  if (get("readiness") != null) lines.push(`  Readiness: ${get("readiness")}/10`);
  return lines;
}

function formatMenstrualTracking(get: (k: string) => unknown): string[] {
  const lines: string[] = [];
  if (get("menstrualPhase") != null) {
    const phase = String(get("menstrualPhase"));
    lines.push(`  Menstrual Phase: ${phase.charAt(0).toUpperCase()}${phase.slice(1)}`);
  }
  if (get("menstrualPhasePredicted") != null) {
    const phase = String(get("menstrualPhasePredicted"));
    lines.push(`  Predicted Phase: ${phase.charAt(0).toUpperCase()}${phase.slice(1)}`);
  }
  return lines;
}

function formatSubjectiveFeelings(get: (k: string) => unknown): string[] {
  const rows: Array<[string, string]> = [
    ["soreness", "Soreness"],
    ["fatigue", "Fatigue"],
    ["stress", "Stress"],
    ["mood", "Mood"],
    ["motivation", "Motivation"],
    ["injury", "Injury Level"],
  ];
  const lines: string[] = [];
  for (const [k, label] of rows) {
    if (get(k) != null) lines.push(`  ${label}: ${get(k)}/10`);
  }
  return lines;
}

function formatNutritionHydration(get: (k: string) => unknown): string[] {
  const rows: Array<[string, string, string]> = [
    ["kcalConsumed", "Calories Consumed", ""],
    ["carbohydrates", "Carbohydrates", "g"],
    ["protein", "Protein", "g"],
    ["fatTotal", "Fat", "g"],
    ["hydrationVolume", "Hydration Volume", ""],
  ];
  const lines: string[] = [];
  for (const [k, label, unit] of rows) {
    if (get(k) != null) lines.push(`- ${label}: ${get(k)}${unit ? ` ${unit}` : ""}`);
  }
  if (get("hydration") != null) lines.push(`  Hydration Score: ${get("hydration")}/10`);
  return lines;
}

/**
 * Format a wellness entry into a readable string.
 *
 * When `includeAllFields` is true, any field not covered by the standard
 * sections is appended under "Other Fields".
 */
export function formatWellnessEntry(entries: Dict, includeAllFields = false): string {
  const accessed = new Set<string>();
  const get = (k: string): unknown => {
    accessed.add(k);
    return entries[k];
  };

  if (includeAllFields) {
    // Mark metadata/internal keys so they don't appear in "Other Fields"
    for (const k of ["date", "updated", "tempWeight", "tempRestingHR"]) accessed.add(k);
  }

  const lines: string[] = ["Wellness Data:"];
  lines.push(`Date: ${get("id") ?? "N/A"}`);
  lines.push("");

  const trainingMetrics = formatTrainingMetrics(get);
  if (trainingMetrics.length) {
    lines.push("Training Metrics:");
    lines.push(...trainingMetrics);
    lines.push("");
  }

  const sportInfo = formatSportInfo(get);
  if (sportInfo.length) {
    lines.push("Sport-Specific Info:");
    lines.push(...sportInfo);
    lines.push("");
  }

  const vitalSigns = formatVitalSigns(get);
  if (vitalSigns.length) {
    lines.push("Vital Signs:");
    lines.push(...vitalSigns);
    lines.push("");
  }

  const sleepLines = formatSleepRecovery(get);
  if (sleepLines.length) {
    lines.push("Sleep & Recovery:");
    lines.push(...sleepLines);
    lines.push("");
  }

  const menstrualLines = formatMenstrualTracking(get);
  if (menstrualLines.length) {
    lines.push("Menstrual Tracking:");
    lines.push(...menstrualLines);
    lines.push("");
  }

  const subjectiveLines = formatSubjectiveFeelings(get);
  if (subjectiveLines.length) {
    lines.push("Subjective Feelings:");
    lines.push(...subjectiveLines);
    lines.push("");
  }

  const nutritionLines = formatNutritionHydration(get);
  if (nutritionLines.length) {
    lines.push("Nutrition & Hydration:");
    lines.push(...nutritionLines);
    lines.push("");
  }

  if (get("steps") != null) {
    lines.push("Activity:");
    lines.push(`- Steps: ${get("steps")}`);
    lines.push("");
  }

  if (get("comments")) lines.push(`Comments: ${get("comments")}`);
  if (accessed.has("locked")) {
    lines.push(`Status: ${get("locked") ? "Locked" : "Unlocked"}`);
  }

  if (includeAllFields) {
    const otherLines: string[] = [];
    for (const [key, value] of Object.entries(entries)) {
      if (!accessed.has(key) && value != null) {
        otherLines.push(
          `- ${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`,
        );
      }
    }
    if (otherLines.length) {
      lines.push("");
      lines.push("Other Fields:");
      lines.push(...otherLines);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export function formatEventSummary(event: Dict): string {
  const eventDate = event["start_date_local"] ?? event["date"] ?? "Unknown";
  const eventType = event["workout"] ? "Workout" : event["race"] ? "Race" : "Other";
  return `Date: ${eventDate}
ID: ${event["id"] ?? "N/A"}
Type: ${eventType}
Name: ${event["name"] ?? "Unnamed"}
Description: ${event["description"] ?? "No description"}`;
}

export function formatEventDetails(event: Dict): string {
  let details = `Event Details:

ID: ${event["id"] ?? "N/A"}
Date: ${event["date"] ?? "Unknown"}
Name: ${event["name"] ?? "Unnamed"}
Description: ${event["description"] ?? "No description"}`;

  const workout = event["workout"];
  if (typeof workout === "object" && workout !== null) {
    details += `

Workout Information:
Workout ID: ${workout["id"] ?? "N/A"}
Sport: ${workout["sport"] ?? "Unknown"}
Duration: ${workout["duration"] ?? 0} seconds
TSS: ${workout["tss"] ?? "N/A"}`;
    if (Array.isArray(workout["intervals"])) {
      details += `
Intervals: ${workout["intervals"].length}`;
    }
  }

  if (event["race"]) {
    details += `

Race Information:
Priority: ${event["priority"] ?? "N/A"}
Result: ${event["result"] ?? "N/A"}`;
  }

  const cal = event["calendar"];
  if (typeof cal === "object" && cal !== null) {
    details += `

Calendar: ${cal["name"] ?? "N/A"}`;
  }

  return details;
}

// ---------------------------------------------------------------------------
// Custom items
// ---------------------------------------------------------------------------

export function formatCustomItemDetails(item: Dict): string {
  const lines = ["Custom Item Details:", ""];
  lines.push(`ID: ${item["id"] ?? "N/A"}`);
  lines.push(`Name: ${item["name"] ?? "N/A"}`);
  lines.push(`Type: ${item["type"] ?? "N/A"}`);
  if (item["description"]) lines.push(`Description: ${item["description"]}`);
  if (item["visibility"]) lines.push(`Visibility: ${item["visibility"]}`);
  if (item["index"] != null) lines.push(`Index: ${item["index"]}`);
  if (item["hide_script"] != null) lines.push(`Hide Script: ${item["hide_script"]}`);
  if (item["content"]) lines.push(`Content: ${JSON.stringify(item["content"], null, 2)}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Intervals
// ---------------------------------------------------------------------------

export function formatIntervals(intervalsData: Dict): string {
  let result = `Intervals Analysis:

ID: ${intervalsData["id"] ?? "N/A"}
Analyzed: ${intervalsData["analyzed"] ?? "N/A"}

`;

  const intervals = intervalsData["icu_intervals"];
  if (Array.isArray(intervals) && intervals.length > 0) {
    result += "Individual Intervals:\n\n";
    intervals.forEach((interval: Dict, i: number) => {
      result += `[${i + 1}] ${interval["label"] ?? `Interval ${i + 1}`} (${interval["type"] ?? "Unknown"})
Duration: ${interval["elapsed_time"] ?? 0} seconds (moving: ${interval["moving_time"] ?? 0} seconds)
Distance: ${interval["distance"] ?? 0} meters
Start-End Indices: ${interval["start_index"] ?? 0}-${interval["end_index"] ?? 0}

Power Metrics:
  Average Power: ${interval["average_watts"] ?? 0} watts (${interval["average_watts_kg"] ?? 0} W/kg)
  Max Power: ${interval["max_watts"] ?? 0} watts (${interval["max_watts_kg"] ?? 0} W/kg)
  Weighted Avg Power: ${interval["weighted_average_watts"] ?? 0} watts
  Intensity: ${interval["intensity"] ?? 0}
  Training Load: ${interval["training_load"] ?? 0}
  Joules: ${interval["joules"] ?? 0}
  Joules > FTP: ${interval["joules_above_ftp"] ?? 0}
  Power Zone: ${interval["zone"] ?? "N/A"} (${interval["zone_min_watts"] ?? 0}-${interval["zone_max_watts"] ?? 0} watts)
  W' Balance: Start ${interval["wbal_start"] ?? 0}, End ${interval["wbal_end"] ?? 0}
  L/R Balance: ${interval["avg_lr_balance"] ?? 0}
  Variability: ${interval["w5s_variability"] ?? 0}
  Torque: Avg ${interval["average_torque"] ?? 0}, Min ${interval["min_torque"] ?? 0}, Max ${interval["max_torque"] ?? 0}

Heart Rate & Metabolic:
  Heart Rate: Avg ${interval["average_heartrate"] ?? 0}, Min ${interval["min_heartrate"] ?? 0}, Max ${interval["max_heartrate"] ?? 0} bpm
  Decoupling: ${interval["decoupling"] ?? 0}
  DFA α1: ${interval["average_dfa_a1"] ?? 0}
  Respiration: ${interval["average_respiration"] ?? 0} breaths/min
  EPOC: ${interval["average_epoc"] ?? 0}
  SmO2: ${interval["average_smo2"] ?? 0}% / ${interval["average_smo2_2"] ?? 0}%
  THb: ${interval["average_thb"] ?? 0} / ${interval["average_thb_2"] ?? 0}

Speed & Cadence:
  Speed: Avg ${interval["average_speed"] ?? 0}, Min ${interval["min_speed"] ?? 0}, Max ${interval["max_speed"] ?? 0} m/s
  GAP: ${interval["gap"] ?? 0} m/s
  Cadence: Avg ${interval["average_cadence"] ?? 0}, Min ${interval["min_cadence"] ?? 0}, Max ${interval["max_cadence"] ?? 0} rpm
  Stride: ${interval["average_stride"] ?? 0}

Elevation & Environment:
  Elevation Gain: ${interval["total_elevation_gain"] ?? 0} meters
  Altitude: Min ${interval["min_altitude"] ?? 0}, Max ${interval["max_altitude"] ?? 0} meters
  Gradient: ${interval["average_gradient"] ?? 0}%
  Temperature: ${interval["average_temp"] ?? 0}°C (Weather: ${interval["average_weather_temp"] ?? 0}°C, Feels like: ${interval["average_feels_like"] ?? 0}°C)
  Wind: Speed ${interval["average_wind_speed"] ?? 0} km/h, Gust ${interval["average_wind_gust"] ?? 0} km/h, Direction ${interval["prevailing_wind_deg"] ?? 0}°
  Headwind: ${interval["headwind_percent"] ?? 0}%, Tailwind: ${interval["tailwind_percent"] ?? 0}%

`;
    });
  }

  const groups = intervalsData["icu_groups"];
  if (Array.isArray(groups) && groups.length > 0) {
    result += "Interval Groups:\n\n";
    groups.forEach((group: Dict, i: number) => {
      result += `Group: ${group["id"] ?? `Group ${i + 1}`} (Contains ${group["count"] ?? 0} intervals)
Duration: ${group["elapsed_time"] ?? 0} seconds (moving: ${group["moving_time"] ?? 0} seconds)
Distance: ${group["distance"] ?? 0} meters
Start-End Indices: ${group["start_index"] ?? 0}-N/A

Power: Avg ${group["average_watts"] ?? 0} watts (${group["average_watts_kg"] ?? 0} W/kg), Max ${group["max_watts"] ?? 0} watts
W. Avg Power: ${group["weighted_average_watts"] ?? 0} watts, Intensity: ${group["intensity"] ?? 0}
Heart Rate: Avg ${group["average_heartrate"] ?? 0}, Max ${group["max_heartrate"] ?? 0} bpm
Speed: Avg ${group["average_speed"] ?? 0}, Max ${group["max_speed"] ?? 0} m/s
Cadence: Avg ${group["average_cadence"] ?? 0}, Max ${group["max_cadence"] ?? 0} rpm

`;
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Power curves
// ---------------------------------------------------------------------------

/** Format seconds into a concise human-readable label (e.g. 5s, 2m, 1h). */
export function formatDurationLabel(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return remainder ? `${mins}m${remainder}s` : `${mins}m`;
  }
  const hours = Math.floor(secs / 3600);
  const remainder = Math.floor((secs % 3600) / 60);
  return remainder ? `${hours}h${remainder}m` : `${hours}h`;
}

export interface CurveDataPoint {
  secs: number;
  watts: number | null;
  activity_id: string;
  watts_per_kg?: number;
  wkg_activity_id?: string;
}

export interface ExtractedCurve {
  id: string;
  label: string;
  start: string;
  end: string;
  data_points: CurveDataPoint[];
}

export function formatPowerCurves(
  curves: ExtractedCurve[],
  activityType: string,
  includeNormalised: boolean,
): string {
  const lines: string[] = [`Power Curves (${activityType}):`, ""];

  for (const curve of curves) {
    const label = curve.label || curve.id || "Unknown";
    let dateRange = "";
    if (curve.start && curve.end) {
      const startShort = curve.start.length > 10 ? curve.start.slice(0, 10) : curve.start;
      const endShort = curve.end.length > 10 ? curve.end.slice(0, 10) : curve.end;
      dateRange = ` (${startShort} to ${endShort})`;
    }
    lines.push(`${label}${dateRange}:`);

    const dataPoints = curve.data_points ?? [];
    if (!dataPoints.length) {
      lines.push("  No data available for requested durations.");
      lines.push("");
      continue;
    }

    for (const point of dataPoints) {
      const durLabel = formatDurationLabel(point.secs);
      const aid = point.activity_id ?? "";
      const parts = [`  ${durLabel}: ${point.watts ?? "N/A"}W`];
      if (includeNormalised && point.watts_per_kg != null) {
        parts.push(`${point.watts_per_kg.toFixed(2)}W/kg`);
        const wkgAid = point.wkg_activity_id ?? "";
        if (wkgAid && wkgAid !== aid) parts.push(`[${aid}|wkg:${wkgAid}]`);
        else parts.push(`[${aid}]`);
      } else {
        parts.push(`[${aid}]`);
      }
      lines.push(parts.join(" "));
    }
    lines.push("");
  }

  return lines.join("\n");
}
