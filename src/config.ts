/**
 * Configuration: credentials resolve from environment variables first, then
 * from the config file written by `intervals-mcp-server auth`.
 */

import { readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { validateAthleteId } from "./utils/validation.js";

export const DEFAULT_API_BASE_URL = "https://intervals.icu/api/v1";

export interface Config {
  apiKey: string;
  athleteId: string;
  apiBaseUrl: string;
  userAgent: string;
}

export interface StoredCredentials {
  apiKey: string;
  athleteId: string;
}

/** Package version (read from package.json, with a safe fallback). */
export function readPackageVersion(): string {
  try {
    const pkgUrl = new URL("../package.json", import.meta.url);
    const pkg = JSON.parse(readFileSync(pkgUrl, "utf8")) as { version?: string };
    return pkg.version ?? "1.0.0";
  } catch {
    return "1.0.0";
  }
}

/** Directory holding the config file (XDG-aware, defaults to ~/.config). */
export function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && path.isAbsolute(xdg) ? xdg : path.join(homedir(), ".config");
  return path.join(base, "intervals-mcp-server");
}

/** Absolute path of the on-disk credentials file. */
export function configFilePath(): string {
  return path.join(configDir(), "config.json");
}

/** Read credentials from the config file. Returns null when absent/invalid. */
export function readStoredCredentials(): StoredCredentials | null {
  const file = configFilePath();
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<StoredCredentials>;
    if (typeof raw.apiKey === "string" && typeof raw.athleteId === "string") {
      return { apiKey: raw.apiKey, athleteId: raw.athleteId };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Persist credentials to the config file (created with 0600 permissions).
 * Throws on invalid athlete ID.
 */
export function saveStoredCredentials(creds: StoredCredentials): void {
  validateAthleteId(creds.athleteId);
  mkdirSync(configDir(), { recursive: true });
  const file = configFilePath();
  writeFileSync(file, JSON.stringify(creds, null, 2) + "\n", { mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    // chmod can fail on exotic filesystems; the file is still private-ish
  }
}

/**
 * Resolve the effective configuration.
 * Environment variables win over the config file so MCP clients can override
 * per-server (`env` in the client config) and CI stays possible.
 */
export function getConfig(): Config {
  const stored = readStoredCredentials();
  const apiKey = process.env.API_KEY || stored?.apiKey || "";
  const athleteId = process.env.ATHLETE_ID || stored?.athleteId || "";

  if (athleteId) validateAthleteId(athleteId);

  return {
    apiKey,
    athleteId,
    apiBaseUrl: process.env.INTERVALS_API_BASE_URL || DEFAULT_API_BASE_URL,
    userAgent: `intervalsicu-mcp-server-ts/${readPackageVersion()}`,
  };
}

/** Whether both API key and athlete ID are available from any source. */
export function hasCredentials(): boolean {
  const cfg = getConfig();
  return Boolean(cfg.apiKey && cfg.athleteId);
}
