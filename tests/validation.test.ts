import { describe, expect, it } from "vitest";
import {
  resolveActivityType,
  resolveAthleteId,
  resolveDateParams,
  validateAthleteId,
  validateDate,
} from "../src/utils/validation.js";

describe("validateAthleteId", () => {
  it("accepts digit-only ids", () => {
    expect(() => validateAthleteId("123456")).not.toThrow();
  });

  it("accepts i-prefixed ids", () => {
    expect(() => validateAthleteId("i123456")).not.toThrow();
  });

  it("accepts empty string", () => {
    expect(() => validateAthleteId("")).not.toThrow();
  });

  it.each(["abc", "i", "12a", "i12x", "i-123", "12 34"])("rejects %s", (id) => {
    expect(() => validateAthleteId(id)).toThrow(/ATHLETE_ID/);
  });
});

describe("validateDate", () => {
  it("accepts and returns valid dates", () => {
    expect(validateDate("2026-08-29")).toBe("2026-08-29");
  });

  it("rejects impossible dates", () => {
    expect(() => validateDate("2026-02-30")).toThrow(/YYYY-MM-DD/);
  });

  it("rejects wrong formats", () => {
    expect(() => validateDate("29/08/2026")).toThrow(/YYYY-MM-DD/);
    expect(() => validateDate("2026-8-9")).toThrow(/YYYY-MM-DD/);
    expect(() => validateDate("20260829")).toThrow(/YYYY-MM-DD/);
  });
});

describe("resolveAthleteId", () => {
  it("prefers the explicit parameter", () => {
    expect(resolveAthleteId("42", "999")).toEqual({ athleteId: "42", error: null });
  });

  it("falls back to the default", () => {
    expect(resolveAthleteId(null, "999")).toEqual({ athleteId: "999", error: null });
    expect(resolveAthleteId(undefined, "999")).toEqual({ athleteId: "999", error: null });
  });

  it("returns an error when nothing is available", () => {
    const { athleteId, error } = resolveAthleteId(null, "");
    expect(athleteId).toBe("");
    expect(error).toMatch(/No athlete ID provided/);
  });
});

describe("resolveActivityType", () => {
  it("returns an explicit type as-is", () => {
    expect(resolveActivityType(null, "VirtualRide")).toBe("VirtualRide");
    expect(resolveActivityType("morning swim", "Run")).toBe("Run");
  });

  it.each([
    ["Morning Ride", "Ride"],
    ["cycling session", "Ride"],
    ["bike workout", "Ride"],
    ["cycle", "Ride"],
    ["Easy Run", "Run"],
    ["jogging", "Run"],
    ["morning jog", "Run"],
    ["running", "Run"],
    ["Pool Swim", "Swim"],
    ["swimming drills", "Swim"],
    ["swim", "Swim"],
    ["Evening Walk", "Walk"],
    ["hiking", "Walk"],
    ["Rowing intervals", "Row"],
    ["erg row", "Row"],
  ])("infers %s → %s", (name, expected) => {
    expect(resolveActivityType(name)).toBe(expected);
  });

  it("defaults to Ride when nothing matches", () => {
    expect(resolveActivityType("yoga")).toBe("Ride");
    expect(resolveActivityType(null)).toBe("Ride");
    expect(resolveActivityType("")).toBe("Ride");
  });
});

describe("resolveDateParams", () => {
  it("uses provided values", () => {
    expect(resolveDateParams("2026-01-01", "2026-02-01")).toEqual([
      "2026-01-01",
      "2026-02-01",
    ]);
  });

  it("defaults start to 30 days ago and end to today", () => {
    const [start, end] = resolveDateParams(null, null);
    expect(start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(start < end).toBe(true);
  });
});
