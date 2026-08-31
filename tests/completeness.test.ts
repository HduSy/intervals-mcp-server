import { describe, expect, it } from "vitest";
import {
  assessActivityCompleteness,
  formatSyncLine,
  formatSyncSection,
} from "../src/utils/completeness.js";
import { formatActivitySummary } from "../src/utils/formatting.js";

// Fixed "now" so the freshness advisory is deterministic.
const NOW = new Date("2026-08-30T12:00:00Z");

const completeActivity = {
  id: "i181177875",
  name: "Morning Ride",
  source: "GARMIN_CONNECT",
  external_id: "ride.fit",
  created: "2026-08-30T02:58:30.406+00:00",
  icu_sync_date: "2026-08-30T02:58:30.767+00:00",
  icu_sync_error: null,
  analyzed: "2026-08-30T02:58:30.767+00:00",
  analysis_issues: null,
  stream_types: ["time", "watts", "heartrate", "cadence"],
  device_watts: true,
  has_heartrate: true,
};

describe("assessActivityCompleteness", () => {
  it("returns complete for a fully synced activity", () => {
    const result = assessActivityCompleteness(completeActivity, NOW);
    expect(result.status).toBe("complete");
    expect(result.notes).toHaveLength(0);
  });

  it("returns pending when analysis has not finished", () => {
    const result = assessActivityCompleteness(
      { ...completeActivity, analyzed: null },
      NOW,
    );
    expect(result.status).toBe("pending");
    expect(result.notes[0]).toContain("analysis has not finished");
  });

  it("flags the Strava caveat when analyzed is null on a Strava activity", () => {
    const result = assessActivityCompleteness(
      { ...completeActivity, analyzed: null, source: "STRAVA" },
      NOW,
    );
    expect(result.status).toBe("pending");
    expect(result.notes[0]).toContain("Strava");
  });

  it("returns incomplete on a sync error, overriding everything else", () => {
    const result = assessActivityCompleteness(
      { ...completeActivity, icu_sync_error: "boom" },
      NOW,
    );
    expect(result.status).toBe("incomplete");
    expect(result.notes[0]).toContain("sync error");
  });

  it("returns incomplete when a power meter recorded but the watts stream is missing", () => {
    const result = assessActivityCompleteness(
      { ...completeActivity, stream_types: ["time", "heartrate", "cadence"] },
      NOW,
    );
    expect(result.status).toBe("incomplete");
    expect(result.notes.join(" ")).toContain("no watts stream");
  });

  it("skips the stream check when stream_types is not on the payload", () => {
    const { stream_types: _omit, ...withoutStreams } = completeActivity;
    const result = assessActivityCompleteness(withoutStreams, NOW);
    expect(result.status).toBe("complete");
  });

  it("keeps complete but warns on analysis issues", () => {
    const result = assessActivityCompleteness(
      { ...completeActivity, analysis_issues: ["power spikes"] },
      NOW,
    );
    expect(result.status).toBe("complete");
    expect(result.notes[0]).toContain("analysis issues");
  });

  it("advises when the sync happened very recently", () => {
    const result = assessActivityCompleteness(
      { ...completeActivity, icu_sync_date: "2026-08-30T11:55:00Z" },
      NOW,
    );
    expect(result.status).toBe("complete");
    expect(result.notes[0]).toContain("settling");
  });
});

describe("formatSyncLine", () => {
  it("renders a compact one-line verdict with sync date and source", () => {
    const line = formatSyncLine(completeActivity, NOW);
    expect(line).toContain("Sync: complete (derived)");
    expect(line).toContain("Last Sync: 2026-08-30 02:58:30");
    expect(line).toContain("Source: GARMIN_CONNECT");
  });
});

describe("formatSyncSection", () => {
  it("renders the full detail block", () => {
    const section = formatSyncSection(completeActivity, NOW);
    expect(section).toContain("Data Complete: complete");
    expect(section).toContain("Analyzed: 2026-08-30 02:58:30");
    expect(section).toContain("Available Streams: time, watts, heartrate, cadence");
    expect(section).toContain("External ID: ride.fit");
    expect(section).toContain("provisional");
  });

  it("includes notes for a pending activity", () => {
    const section = formatSyncSection(
      { ...completeActivity, analyzed: null },
      NOW,
    );
    expect(section).toContain("Data Complete: pending");
    expect(section).toContain("Note: server-side analysis has not finished");
  });
});

describe("formatActivitySummary integration", () => {
  it("always embeds the compact sync line", () => {
    const out = formatActivitySummary(completeActivity);
    expect(out).toContain("Sync: complete (derived)");
    expect(out).not.toContain("Sync & Data Completeness:");
  });

  it("appends the full section in verbose mode", () => {
    const out = formatActivitySummary(completeActivity, { verbose: true });
    expect(out).toContain("Sync: complete (derived)");
    expect(out).toContain("Sync & Data Completeness:");
  });
});
