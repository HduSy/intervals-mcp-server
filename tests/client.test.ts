import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isApiError, isEmptyResult, makeIntervalsRequest } from "../src/api/client.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

// Isolate from the developer machine's real config file (~/.config/...)
let tempXdg: string;

beforeAll(() => {
  tempXdg = mkdtempSync(path.join(tmpdir(), "imcs-client-test-"));
});

beforeEach(() => {
  vi.stubEnv("XDG_CONFIG_HOME", tempXdg);
  vi.stubEnv("API_KEY", "test-key-123");
  vi.stubEnv("ATHLETE_ID", "123456");
  vi.stubEnv("INTERVALS_API_BASE_URL", "https://intervals.icu/api/v1");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

afterAll(() => {
  rmSync(tempXdg, { recursive: true, force: true });
});

describe("makeIntervalsRequest", () => {
  it("sends Basic auth with the API_KEY username", async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ id: 1 }]));
    const result = await makeIntervalsRequest("/athlete/123456/activities");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://intervals.icu/api/v1/athlete/123456/activities");
    const expected = `Basic ${Buffer.from("API_KEY:test-key-123").toString("base64")}`;
    expect((init.headers as Record<string, string>).Authorization).toBe(expected);
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(
      /^intervalsicu-mcp-server-ts\//,
    );
    expect(result).toEqual([{ id: 1 }]);
  });

  it("serialises query params, repeating array values", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    await makeIntervalsRequest("/athlete/123456/power-curves", {
      params: { curves: ["s0", "s1", "r.2026-01-01.2026-06-01"], type: "Ride", includeRanks: false },
    });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("curves=s0&curves=s1&curves=r.2026-01-01.2026-06-01");
    expect(url).toContain("type=Ride");
    expect(url).toContain("includeRanks=false");
  });

  it("sends JSON bodies on POST and PUT", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 9 }));
    await makeIntervalsRequest("/athlete/123456/events", {
      method: "POST",
      data: { name: "Test" },
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ name: "Test" }));
  });

  it("maps 401 to a friendly message", async () => {
    fetchMock.mockResolvedValue(new Response("unauthorized", { status: 401 }));
    const result = await makeIntervalsRequest("/athlete/123456/wellness");
    expect(isApiError(result)).toBe(true);
    if (isApiError(result)) {
      expect(result.status_code).toBe(401);
      expect(result.message).toContain("check your API key");
    }
  });

  it("maps 404 and 429 to friendly messages", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 404 }));
    fetchMock.mockResolvedValueOnce(new Response("slow down", { status: 429 }));

    const notFound = await makeIntervalsRequest("/athlete/999999/wellness");
    expect(isApiError(notFound) && notFound.message).toContain("doesn't exist");

    const rate = await makeIntervalsRequest("/athlete/123456/wellness");
    expect(isApiError(rate) && rate.message).toContain("Too many requests");
  });

  it("returns an error contract on invalid JSON", async () => {
    fetchMock.mockResolvedValue(new Response("<html>not json</html>", { status: 200 }));
    const result = await makeIntervalsRequest("/athlete/123456/activities");
    expect(isApiError(result)).toBe(true);
    expect(isApiError(result) && result.message).toBe("Invalid JSON in response");
  });

  it("returns an error contract on network failure", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await makeIntervalsRequest("/athlete/123456/activities");
    expect(isApiError(result)).toBe(true);
    expect(isApiError(result) && result.message).toContain("ECONNREFUSED");
  });

  it("fails fast when no API key is configured anywhere", async () => {
    vi.stubEnv("API_KEY", "");
    const result = await makeIntervalsRequest("/athlete/123456/activities");
    expect(isApiError(result)).toBe(true);
    expect(isApiError(result) && result.message).toMatch(/API key is required/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("isEmptyResult", () => {
  it("treats empty objects and arrays as empty", () => {
    expect(isEmptyResult({})).toBe(true);
    expect(isEmptyResult([])).toBe(true);
    expect(isEmptyResult({ a: 1 })).toBe(false);
    expect(isEmptyResult([{ a: 1 }])).toBe(false);
  });
});
