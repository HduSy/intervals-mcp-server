import { describe, expect, it } from "vitest";
import {
  formatStep,
  formatValue,
  formatWorkoutDoc,
  StepSchema,
  WorkoutDocSchema,
} from "../src/utils/types.js";

describe("formatValue", () => {
  it("renders percentage units", () => {
    expect(formatValue({ value: 80, units: "%ftp" })).toBe("80% ftp");
    expect(formatValue({ value: 75, units: "%hr" })).toBe("75% HR");
    expect(formatValue({ value: 85, units: "%lthr" })).toBe("85% LTHR");
  });

  it("renders zones", () => {
    expect(formatValue({ value: 2, units: "power_zone" })).toBe("Z2 W");
    expect(formatValue({ value: 3, units: "hr_zone" })).toBe("Z3 HR");
  });

  it("renders absolute watts and cadence", () => {
    expect(formatValue({ value: 200, units: "w" })).toBe("200W");
    expect(formatValue({ value: 90, units: "cadence" })).toBe("90rpm Cadence");
  });

  it("renders ranges", () => {
    expect(formatValue({ start: 80, end: 90, units: "%ftp" })).toBe("80%-90% ftp");
  });

  it("renders hr target", () => {
    expect(formatValue({ value: 140, units: "w", target: "lap" })).toBe("140W hr=lap");
  });
});

describe("formatStep", () => {
  it("formats duration buckets", () => {
    expect(formatStep({ duration: 45 })).toBe("- 45s ");
    expect(formatStep({ duration: 300 })).toBe("- 5m ");
    expect(formatStep({ duration: 3600 })).toBe("- 1h ");
    expect(formatStep({ duration: 5400 })).toBe("- 1h30m ");
  });

  it("formats distance", () => {
    expect(formatStep({ distance: 500 })).toBe("- 500mtr ");
    expect(formatStep({ distance: 5000 })).toBe("- 5km ");
  });

  it("marks warmup and cooldown headers", () => {
    expect(formatStep({ duration: 600, warmup: true })).toBe("\nWarmup\n- 10m \n");
    expect(formatStep({ duration: 600, cooldown: true })).toBe("\nCooldown\n- 10m \n");
  });

  it("renders reps with nested steps", () => {
    const step = {
      reps: 3,
      steps: [
        { duration: 60, power: { value: 110, units: "%ftp" as const } },
        { duration: 90, power: { value: 80, units: "%ftp" as const } },
      ],
    };
    const out = formatStep(step);
    expect(out).toContain("3x ");
    expect(out).toContain("- 1m 110% ftp ");
    expect(out).toContain("- 90s 80% ftp ");
  });

  it("renders flags", () => {
    expect(formatStep({ duration: 60, freeride: true })).toContain("freeride ");
    expect(formatStep({ duration: 60, ramp: true })).toContain("ramp ");
    expect(formatStep({ duration: 60, maxeffort: true })).toContain("maxeffort ");
    expect(formatStep({ duration: 60, hidepower: true })).toContain("hidepower ");
  });
});

describe("formatWorkoutDoc", () => {
  it("combines description and steps", () => {
    const doc = {
      description: "High-intensity workout for increasing VO2 max",
      steps: [
        { duration: 900, warmup: true, power: { value: 80, units: "%ftp" as const } },
        {
          reps: 2,
          text: "High-intensity intervals",
          steps: [
            { power: { value: 110, units: "%ftp" as const }, distance: 500, text: "High-intensity" },
            { power: { value: 80, units: "%ftp" as const }, duration: 90, text: "Recovery" },
          ],
        },
        { duration: 600, cooldown: true, power: { value: 80, units: "%ftp" as const } },
      ],
    };
    const out = formatWorkoutDoc(doc);
    expect(out).toContain("High-intensity workout for increasing VO2 max\n");
    expect(out).toContain("\nWarmup\n- 15m 80% ftp");
    expect(out).toContain("\n2x ");
    expect(out).toContain("High-intensity intervals ");
    expect(out).toContain("Recovery ");
    expect(out).toContain("\nCooldown\n- 10m 80% ftp");
  });
});

describe("schemas", () => {
  it("StepSchema parses nested repeat structures", () => {
    const parsed = StepSchema.parse({
      reps: 2,
      steps: [{ duration: 60, power: { value: 110, units: "%ftp" } }],
    });
    expect(parsed.reps).toBe(2);
    expect(parsed.steps?.[0]?.power?.units).toBe("%ftp");
  });

  it("StepSchema rejects invalid units", () => {
    expect(() =>
      StepSchema.parse({ duration: 60, power: { value: 100, units: "kilowatts" } }),
    ).toThrow();
  });

  it("WorkoutDocSchema parses a full document", () => {
    const parsed = WorkoutDocSchema.parse({
      description: "test",
      ftp: 250,
      target: "POWER",
      steps: [{ duration: 60, power: { value: 80, units: "%ftp" } }],
    });
    expect(parsed.ftp).toBe(250);
    expect(parsed.target).toBe("POWER");
  });

  it("WorkoutDocSchema rejects unknown targets", () => {
    expect(() => WorkoutDocSchema.parse({ target: "SPEED" })).toThrow();
  });
});
