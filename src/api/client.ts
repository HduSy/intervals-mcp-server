/**
 * HTTP client for the Intervals.icu API.
 *
 * Uses the platform fetch (Node >= 18) with Basic authentication
 * (username "API_KEY", the key as password). Failures are returned as
 * `{ error: true, message, status_code? }` dictionaries instead of thrown,
 * so tool handlers can branch on the error field instead of try/catch.
 */

import { getConfig } from "../config.js";
import type { Dict } from "../utils/formatting.js";

export interface ApiError {
  error: true;
  message: string;
  status_code?: number;
}

export type ApiResult = Dict | Dict[] | ApiError;

export function isApiError(result: unknown): result is ApiError {
  return (
    typeof result === "object" &&
    result !== null &&
    !Array.isArray(result) &&
    (result as Dict)["error"] === true
  );
}

/** True when the result is an empty object or empty array. */
export function isEmptyResult(result: ApiResult): boolean {
  if (result == null) return true;
  if (Array.isArray(result)) return result.length === 0;
  return Object.keys(result).length === 0;
}

export type QueryValue = string | number | boolean | Array<string | number>;

export interface RequestOptions {
  apiKey?: string;
  params?: Record<string, QueryValue>;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  data?: unknown;
  timeoutMs?: number;
}

function buildSearchString(params: Record<string, QueryValue> | undefined): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, String(item));
    } else {
      search.append(key, String(value));
    }
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

function basicAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`API_KEY:${apiKey}`).toString("base64")}`;
}

function statusErrorMessage(status: number): string | null {
  switch (status) {
    case 401:
      return "401 Unauthorized: Please check your API key.";
    case 403:
      return "403 Forbidden: You may not have permission to access this resource.";
    case 404:
      return "404 Not Found: The requested endpoint or ID doesn't exist.";
    case 422:
      return "422 Unprocessable Entity: The server couldn't process the request (invalid parameters or unsupported operation).";
    case 429:
      return "429 Too Many Requests: Too many requests in a short time period.";
    case 500:
      return "500 Internal Server Error: The Intervals.icu server encountered an internal error.";
    case 503:
      return "503 Service Unavailable: The Intervals.icu server might be down or undergoing maintenance.";
    default:
      return null;
  }
}

/**
 * Make a request to the Intervals.icu API with error handling.
 *
 * @param url API path, e.g. "/athlete/{id}/activities"
 */
export async function makeIntervalsRequest(
  url: string,
  options: RequestOptions = {},
): Promise<ApiResult> {
  const { apiKey, params, method = "GET", data, timeoutMs = 30_000 } = options;
  const config = getConfig();

  const keyToUse = apiKey ?? config.apiKey;
  if (!keyToUse) {
    return {
      error: true,
      message:
        "API key is required. Run `npx intervals-mcp-server auth` or set the API_KEY environment variable.",
    };
  }

  const headers: Record<string, string> = {
    "User-Agent": config.userAgent,
    Accept: "application/json",
    Authorization: basicAuthHeader(keyToUse),
  };
  if (method === "POST" || method === "PUT") {
    headers["Content-Type"] = "application/json";
  }

  const fullUrl = `${config.apiBaseUrl}${url}${buildSearchString(params)}`;

  try {
    const response = await fetch(fullUrl, {
      method,
      headers,
      body: method === "POST" || method === "PUT" ? JSON.stringify(data ?? null) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });

    const text = await response.text();

    if (!response.ok) {
      const friendly = statusErrorMessage(response.status);
      return {
        error: true,
        status_code: response.status,
        message: friendly ?? (text || `HTTP ${response.status}`),
      };
    }

    let responseData: unknown;
    try {
      responseData = text ? JSON.parse(text) : {};
    } catch {
      return { error: true, message: "Invalid JSON in response" };
    }

    return responseData as ApiResult;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: true, message: `Request error: ${message}` };
  }
}
