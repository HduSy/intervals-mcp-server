import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  configFilePath,
  getConfig,
  hasCredentials,
  readStoredCredentials,
  saveStoredCredentials,
} from "../src/config.js";

let tempXdg: string;

beforeEach(() => {
  tempXdg = mkdtempSync(path.join(tmpdir(), "intervals-mcp-test-"));
  vi.stubEnv("XDG_CONFIG_HOME", tempXdg);
  vi.stubEnv("API_KEY", "");
  vi.stubEnv("ATHLETE_ID", "");
  vi.stubEnv("INTERVALS_API_BASE_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(tempXdg, { recursive: true, force: true });
});

describe("stored credentials", () => {
  it("round-trips through the config file", () => {
    saveStoredCredentials({ apiKey: "secret", athleteId: "i12345" });
    expect(readStoredCredentials()).toEqual({ apiKey: "secret", athleteId: "i12345" });
  });

  it("writes the file with 0600 permissions", () => {
    saveStoredCredentials({ apiKey: "secret", athleteId: "12345" });
    const mode = statSync(configFilePath()).mode & 0o777;
    expect(mode.toString(8)).toBe("600");
  });

  it("returns null when the file is absent", () => {
    expect(readStoredCredentials()).toBeNull();
  });

  it("rejects malformed athlete ids", () => {
    expect(() => saveStoredCredentials({ apiKey: "k", athleteId: "abc" })).toThrow(
      /ATHLETE_ID/,
    );
  });
});

describe("getConfig precedence", () => {
  it("prefers environment variables over the config file", () => {
    saveStoredCredentials({ apiKey: "file-key", athleteId: "111" });
    vi.stubEnv("API_KEY", "env-key");
    vi.stubEnv("ATHLETE_ID", "222");
    const cfg = getConfig();
    expect(cfg.apiKey).toBe("env-key");
    expect(cfg.athleteId).toBe("222");
  });

  it("falls back to the config file when env is unset", () => {
    saveStoredCredentials({ apiKey: "file-key", athleteId: "i333" });
    const cfg = getConfig();
    expect(cfg.apiKey).toBe("file-key");
    expect(cfg.athleteId).toBe("i333");
    expect(cfg.apiBaseUrl).toBe("https://intervals.icu/api/v1");
  });

  it("supports a custom API base URL", () => {
    vi.stubEnv("INTERVALS_API_BASE_URL", "https://example.test/api/v1");
    expect(getConfig().apiBaseUrl).toBe("https://example.test/api/v1");
  });

  it("hasCredentials reflects completeness", () => {
    expect(hasCredentials()).toBe(false);
    saveStoredCredentials({ apiKey: "k", athleteId: "1" });
    expect(hasCredentials()).toBe(true);
  });
});
