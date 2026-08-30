import { describe, expect, it } from "vitest";
import {
  formatIsoDateTime,
  getDefaultEndDate,
  getDefaultFutureEndDate,
  getDefaultStartDate,
  parseDateRange,
  toLocalDateString,
} from "../src/utils/dates.js";

describe("toLocalDateString", () => {
  it("formats with zero-padded month and day", () => {
    expect(toLocalDateString(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toLocalDateString(new Date(2026, 10, 20))).toBe("2026-11-20");
  });
});

describe("default date helpers", () => {
  it("end date is today", () => {
    expect(getDefaultEndDate()).toBe(toLocalDateString(new Date()));
  });

  it("start date is 30 days ago", () => {
    const expected = new Date();
    expected.setDate(expected.getDate() - 30);
    expect(getDefaultStartDate()).toBe(toLocalDateString(expected));
  });

  it("future end date is 30 days ahead", () => {
    const expected = new Date();
    expected.setDate(expected.getDate() + 30);
    expect(getDefaultFutureEndDate()).toBe(toLocalDateString(expected));
  });
});

describe("parseDateRange", () => {
  it("keeps explicit values", () => {
    expect(parseDateRange("2026-01-01", "2026-03-01")).toEqual([
      "2026-01-01",
      "2026-03-01",
    ]);
  });

  it("fills defaults from today", () => {
    const [start, end] = parseDateRange(undefined, undefined);
    expect(start).toBe(getDefaultStartDate());
    expect(end).toBe(getDefaultEndDate());
  });
});

describe("formatIsoDateTime", () => {
  it("keeps the recorded wall-clock time (no tz conversion)", () => {
    expect(formatIsoDateTime("2026-08-29T08:30:00Z")).toBe("2026-08-29 08:30:00");
    expect(formatIsoDateTime("2026-08-29T08:30:00+02:00")).toBe("2026-08-29 08:30:00");
    expect(formatIsoDateTime("2026-08-29T08:30:00.123Z")).toBe("2026-08-29 08:30:00");
  });

  it("returns short values untouched", () => {
    expect(formatIsoDateTime("2026-08-29")).toBe("2026-08-29");
    expect(formatIsoDateTime("Unknown")).toBe("Unknown");
  });
});
