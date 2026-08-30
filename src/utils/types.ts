/**
 * Workout data structures for the Intervals.icu API.
 *
 * Zod schemas for the workout structures (Value / Step / WorkoutDoc) used by
 * MCP tool input, plus formatting helpers that render a WorkoutDoc into the
 * human-readable description attached to calendar events.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const WorkoutTargetSchema = z.enum(["AUTO", "POWER", "HR", "PACE"]);
export const HrTargetSchema = z.enum(["lap", "1s", "3s", "10s", "30s"]);
export const IntensitySchema = z.enum([
  "active",
  "rest",
  "warmup",
  "cooldown",
  "recovery",
  "interval",
  "other",
]);
export const PaceUnitsSchema = z.enum([
  "SECS_100M",
  "SECS_100Y",
  "MINS_KM",
  "MINS_MILE",
  "SECS_500M",
]);
export const ValueUnitsSchema = z.enum([
  "%mmp",
  "%hr",
  "%lthr",
  "%pace",
  "power_zone",
  "hr_zone",
  "pace_zone",
  "w",
  "%ftp",
  "cadence",
  "MINS_KM",
  "MINS_MILE",
  "SECS_100M",
  "SECS_500M",
]);

// ---------------------------------------------------------------------------
// Value / Step / WorkoutDoc
// ---------------------------------------------------------------------------

export const ValueSchema = z.object({
  value: z.number().optional(),
  start: z.number().optional(),
  end: z.number().optional(),
  units: ValueUnitsSchema.optional(),
  target: HrTargetSchema.optional(),
});

export interface Step {
  text?: string;
  text_locale?: Record<string, string>;
  duration?: number;
  distance?: number;
  until_lap_press?: boolean;
  reps?: number;
  warmup?: boolean;
  cooldown?: boolean;
  intensity?: z.infer<typeof IntensitySchema>;
  steps?: Step[];
  ramp?: boolean;
  freeride?: boolean;
  maxeffort?: boolean;
  power?: Value;
  hr?: Value;
  pace?: Value;
  cadence?: Value;
  hidepower?: boolean;
  // Filled in with actual watts/bpm etc. when resolve=true is supplied by the API
  _power?: Value;
  _hr?: Value;
  _pace?: Value;
  _distance?: number;
}

export type Value = z.infer<typeof ValueSchema>;

export const StepSchema: z.ZodType<Step> = z.lazy(() =>
  z.object({
    text: z.string().optional(),
    text_locale: z.record(z.string()).optional(),
    duration: z.number().optional(),
    distance: z.number().optional(),
    until_lap_press: z.boolean().optional(),
    reps: z.number().optional(),
    warmup: z.boolean().optional(),
    cooldown: z.boolean().optional(),
    intensity: IntensitySchema.optional(),
    steps: z.array(StepSchema).optional(),
    ramp: z.boolean().optional(),
    freeride: z.boolean().optional(),
    maxeffort: z.boolean().optional(),
    power: ValueSchema.optional(),
    hr: ValueSchema.optional(),
    pace: ValueSchema.optional(),
    cadence: ValueSchema.optional(),
    hidepower: z.boolean().optional(),
    _power: ValueSchema.optional(),
    _hr: ValueSchema.optional(),
    _pace: ValueSchema.optional(),
    _distance: z.number().optional(),
  }),
);

export const WorkoutDocSchema = z.object({
  description: z.string().optional(),
  description_locale: z.record(z.string()).optional(),
  duration: z.number().optional(),
  distance: z.number().optional(),
  ftp: z.number().optional(),
  lthr: z.number().optional(),
  threshold_pace: z.number().optional(), // meters/sec
  pace_units: PaceUnitsSchema.optional(),
  sport_settings: z.record(z.unknown()).optional(),
  category: z.string().optional(),
  target: WorkoutTargetSchema.optional(),
  steps: z.array(StepSchema).optional(),
  zone_times: z.array(z.union([z.number(), z.unknown()])).optional(),
  options: z.record(z.string()).optional(),
  locales: z.array(z.string()).optional(),
});

export type WorkoutDoc = z.infer<typeof WorkoutDocSchema>;

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Format a number without decimals when it is a whole number. */
export function floatToStr(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

const PERCENT_UNITS = new Set(["%hr", "%mmp", "%lthr", "%pace", "%ftp"]);
const ZONE_UNITS = new Set(["power_zone", "hr_zone", "pace_zone"]);

const UNITS_LABEL: Partial<Record<NonNullable<Value["units"]>, string>> = {
  "%hr": "HR",
  hr_zone: "HR",
  "%mmp": "MMP",
  "%lthr": "LTHR",
  "%pace": "Pace",
  pace_zone: "Pace",
  "%ftp": "ftp",
  power_zone: "W",
  cadence: "Cadence",
};

function formatScalar(value: number, units: Value["units"]): string {
  if (units && PERCENT_UNITS.has(units)) return `${floatToStr(value)}%`;
  if (units && ZONE_UNITS.has(units)) return `Z${floatToStr(value)}`;
  if (units === "w") return `${floatToStr(value)}W`;
  if (units === "cadence") return `${floatToStr(value)}rpm`;
  return floatToStr(value);
}

/** Render a Value (single, range or ramp) as a compact human-readable string. */
export function formatValue(v: Value): string {
  let val = "";
  if (v.start != null && v.end != null) {
    val += `${formatScalar(v.start, v.units)}-${formatScalar(v.end, v.units)} `;
  }
  if (v.value != null) {
    val += `${formatScalar(v.value, v.units)} `;
  }
  if (v.units != null) {
    const label = UNITS_LABEL[v.units] ?? "";
    if (label) val += `${label} `;
  }
  if (v.target != null) {
    val += `hr=${v.target} `;
  }
  return val.trim();
}

function formatDuration(durationSecs: number): string {
  let remaining = durationSecs;
  let val = "";
  if (remaining >= 3600) {
    val += `${Math.floor(remaining / 3600)}h`;
    remaining %= 3600;
  }
  if (remaining > 100 || remaining === 60) {
    val += `${Math.floor(remaining / 60)}m`;
    remaining %= 60;
  }
  if (remaining > 0) {
    val += `${remaining}s`;
  }
  return val;
}

function formatDistance(distance: number): string {
  if (distance < 1000) return `${floatToStr(distance)}mtr`;
  return `${floatToStr(distance / 1000)}km`;
}

/** Render a single Step (or nested repeat step) as a compact string. */
export function formatStep(step: Step, nested = false): string {
  let val = "";
  if (step.reps != null) {
    val += `\n${step.reps}x `;
  } else {
    if (!nested && step.warmup) val += "\nWarmup\n";
    if (!nested && step.cooldown) val += "\nCooldown\n";

    if (step.duration != null) {
      val += `- ${formatDuration(step.duration)} `;
    } else if (step.distance != null) {
      val += `- ${formatDistance(step.distance)} `;
    }

    if (step.freeride) val += "freeride ";
    if (step.maxeffort) val += "maxeffort ";
    if (step.ramp) val += "ramp ";
    if (step.hidepower) val += "hidepower ";
    if (step.intensity != null) val += `intensity=${step.intensity} `;

    if (step.power) val += `${formatValue(step.power)} `;
    if (step.hr) val += `${formatValue(step.hr)} `;
    if (step.pace) val += `${formatValue(step.pace)} `;
    if (step.cadence) val += `${formatValue(step.cadence)} `;
  }
  if (step.text != null) {
    val += `${step.text} `;
  }
  if (step.reps != null && step.steps != null) {
    for (const child of step.steps) {
      val += `\n${formatStep(child, true)}`;
    }
    val += "\n";
  } else if (!nested && (step.warmup || step.cooldown)) {
    val += "\n";
  }
  return val;
}

/** Render a WorkoutDoc into the description text attached to calendar events. */
export function formatWorkoutDoc(doc: WorkoutDoc): string {
  let val = "";
  if (doc.description != null) {
    val += `${doc.description}\n`;
  }
  if (doc.steps != null) {
    for (const step of doc.steps) {
      val += `${formatStep(step)}\n`;
    }
  }
  return val;
}
