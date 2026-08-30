import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatActivitySummary,
  formatCustomItemDetails,
  formatDurationLabel,
  formatEventDetails,
  formatEventSummary,
  formatIntervals,
  formatPowerCurves,
  formatWellnessEntry,
  type CurveDataPoint,
  type ExtractedCurve,
} from "../src/utils/formatting.js";

const wellnessEntry = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "ressources/wellness_entry.json"), "utf8"),
) as Record<string, unknown>;

describe("formatActivitySummary", () => {
  it("renders the full activity block", () => {
    const out = formatActivitySummary({
      id: 123,
      name: "Morning Ride",
      type: "Ride",
      startTime: "2026-08-29T08:30:00Z",
      distance: 42000,
      duration: 5400,
      avgPower: 210,
      avgHr: 145,
      trainer: false,
    });
    expect(out).toContain("Activity: Morning Ride");
    expect(out).toContain("ID: 123");
    expect(out).toContain("Date: 2026-08-29 08:30:00");
    expect(out).toContain("Distance: 42000 meters");
    expect(out).toContain("Average Power: 210 watts");
    expect(out).toContain("Average Heart Rate: 145 bpm");
    expect(out).toContain("Trainer: false");
  });

  it("falls back to N/A defaults", () => {
    const out = formatActivitySummary({ id: 1 });
    expect(out).toContain("Activity: Unnamed");
    expect(out).toContain("Type: Unknown");
    expect(out).toContain("Average Power: N/A watts");
  });

  it("formats numeric RPE and feel with scales", () => {
    const out = formatActivitySummary({ id: 1, perceived_exertion: 7, feel: 4 });
    expect(out).toContain("RPE: 7/10");
    expect(out).toContain("Feel: 4/5");
  });

  it("prefers the resolved gear name", () => {
    const out = formatActivitySummary({
      id: 1,
      gear: { id: "b16177481" },
      _resolved_gear_name: "Cervelo R5",
    });
    expect(out).toContain("Name: Cervelo R5");
    expect(out).toContain("ID: b16177481");
  });

  it("uses inline gear dict when present", () => {
    const out = formatActivitySummary({ id: 1, gear: { id: "b1", name: "Tarmac" } });
    expect(out).toContain("Name: Tarmac");
  });
});

describe("formatWellnessEntry", () => {
  it("renders the standard sections from the sample payload", () => {
    const out = formatWellnessEntry(wellnessEntry);
    expect(out).toContain("Wellness Data:");
    expect(out).toContain("Date: 2026-01-15");
    expect(out).toContain("Training Metrics:");
    expect(out).toContain("- Fitness (CTL): 52.5");
    expect(out).toContain("Vital Signs:");
    expect(out).toContain("- Weight: 75.5 kg");
    expect(out).toContain("- Resting HR: 48 bpm");
    // The sample has null sleep/nutrition values — those sections stay hidden.
    expect(out).not.toContain("Sleep & Recovery:");
    expect(out).not.toContain("Nutrition & Hydration:");
  });

  it("computes sleep hours from sleepSecs", () => {
    const out = formatWellnessEntry({ sleepSecs: 28800 });
    expect(out).toContain("Sleep: 8.00 hours");
  });

  it("labels sleep quality", () => {
    const out = formatWellnessEntry({ sleepQuality: 2 });
    expect(out).toContain("Sleep Quality: 2 (Good)");
  });

  it("capitalizes menstrual phase", () => {
    const out = formatWellnessEntry({ menstrualPhase: "luteal" });
    expect(out).toContain("Menstrual Phase: Luteal");
  });

  it("hides null fields", () => {
    const out = formatWellnessEntry({ weight: null, restingHR: null, hrv: null });
    expect(out).not.toContain("Weight:");
    expect(out).not.toContain("Resting HR:");
    expect(out).not.toContain("HRV:");
  });

  it("appends unknown fields under Other Fields only when includeAllFields", () => {
    const entry = { id: "2026-08-29", weight: 70, customMetric: 42 };
    const standard = formatWellnessEntry(entry);
    expect(standard).not.toContain("customMetric");

    const extended = formatWellnessEntry(entry, true);
    expect(extended).toContain("Other Fields:");
    expect(extended).toContain("- customMetric: 42");
    // known/internal keys never leak into Other Fields
    expect(extended).not.toContain("- id:");
    expect(extended).not.toContain("- date:");
    expect(extended).not.toContain("- weight: 70\n");
  });
});

describe("formatEventSummary / Details", () => {
  it("classifies events", () => {
    expect(formatEventSummary({ workout: {}, name: "Z2" })).toContain("Type: Workout");
    expect(formatEventSummary({ race: true, name: "Race" })).toContain("Type: Race");
    expect(formatEventSummary({ name: "Note" })).toContain("Type: Other");
  });

  it("renders details with workout, race, and calendar blocks", () => {
    const out = formatEventDetails({
      id: 9,
      date: "2026-09-01",
      name: "Launch",
      workout: { id: 5, sport: "Bike", duration: 3600, tss: 60, intervals: [1, 2] },
      race: true,
      priority: "A",
      result: "2nd",
      calendar: { name: "Season 2026" },
    });
    expect(out).toContain("Workout ID: 5");
    expect(out).toContain("Sport: Bike");
    expect(out).toContain("Intervals: 2");
    expect(out).toContain("Priority: A");
    expect(out).toContain("Calendar: Season 2026");
  });
});

describe("formatCustomItemDetails", () => {
  it("renders optional fields conditionally", () => {
    const base = formatCustomItemDetails({ id: 3, name: "Chart", type: "FITNESS_CHART" });
    expect(base).toContain("ID: 3");
    expect(base).not.toContain("Description:");

    const full = formatCustomItemDetails({
      id: 3,
      name: "Chart",
      type: "FITNESS_CHART",
      description: "My chart",
      visibility: "PRIVATE",
      content: { metric: "ttl" },
    });
    expect(full).toContain("Description: My chart");
    expect(full).toContain("Visibility: PRIVATE");
    expect(full).toContain('"metric": "ttl"');
  });
});

describe("formatIntervals", () => {
  it("renders intervals and groups", () => {
    const out = formatIntervals({
      id: 42,
      analyzed: "today",
      icu_intervals: [
        { label: "Interval 1", type: "bike", elapsed_time: 60, average_watts: 250 },
      ],
      icu_groups: [{ id: 7, count: 4, average_watts: 240 }],
    });
    expect(out).toContain("ID: 42");
    expect(out).toContain("[1] Interval 1 (bike)");
    expect(out).toContain("Average Power: 250 watts");
    expect(out).toContain("Group: 7 (Contains 4 intervals)");
  });
});

describe("formatDurationLabel", () => {
  it.each([
    [5, "5s"],
    [59, "59s"],
    [60, "1m"],
    [125, "2m5s"],
    [3600, "1h"],
    [5400, "1h30m"],
  ])("%is → %s", (secs, expected) => {
    expect(formatDurationLabel(secs)).toBe(expected);
  });
});

describe("formatPowerCurves", () => {
  const curve = (points: CurveDataPoint[]): ExtractedCurve => ({
    id: "s0",
    label: "This Season",
    start: "2026-01-01T00:00:00Z",
    end: "2026-12-31T00:00:00Z",
    data_points: points,
  });

  it("renders watts, W/kg and activity ids", () => {
    const out = formatPowerCurves(
      [curve([{ secs: 60, watts: 420, activity_id: "a1", watts_per_kg: 5.678, wkg_activity_id: "a1" }])],
      "Ride",
      true,
    );
    expect(out).toContain("Power Curves (Ride):");
    expect(out).toContain("This Season (2026-01-01 to 2026-12-31):");
    expect(out).toContain("1m: 420W 5.68W/kg [a1]");
  });

  it("flags differing W/kg source activity", () => {
    const out = formatPowerCurves(
      [curve([{ secs: 5, watts: 900, activity_id: "a1", watts_per_kg: 11.2, wkg_activity_id: "a2" }])],
      "Ride",
      true,
    );
    expect(out).toContain("[a1|wkg:a2]");
  });

  it("omits W/kg when not normalised", () => {
    const out = formatPowerCurves(
      [curve([{ secs: 60, watts: 420, activity_id: "a1", watts_per_kg: 5.678 }])],
      "Ride",
      false,
    );
    expect(out).toContain("1m: 420W [a1]");
    expect(out).not.toContain("W/kg");
  });

  it("notes empty curves", () => {
    const out = formatPowerCurves([curve([])], "Ride", true);
    expect(out).toContain("No data available for requested durations.");
  });
});
