/**
 * Date utility functions.
 *
 * Helpers for local-time date strings (YYYY-MM-DD) and default date ranges.
 */

/** Format a Date as a local YYYY-MM-DD string (no UTC conversion). */
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Today's date as YYYY-MM-DD (local time). */
export function getDefaultEndDate(): string {
  return toLocalDateString(new Date());
}

/** Date string `daysAgo` days before today, as YYYY-MM-DD (local time). */
export function getDefaultStartDate(daysAgo = 30): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return toLocalDateString(d);
}

/** Date string `daysAhead` days after today, as YYYY-MM-DD (local time). */
export function getDefaultFutureEndDate(daysAhead = 30): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return toLocalDateString(d);
}

/** Resolve a date range with defaults: start = 30 days ago, end = today. */
export function parseDateRange(
  startDate?: string | null,
  endDate?: string | null,
  defaultStartDaysAgo = 30,
): [string, string] {
  const start = startDate || getDefaultStartDate(defaultStartDaysAgo);
  const end = endDate || getDefaultEndDate();
  return [start, end];
}

/** Format "YYYY-MM-DDTHH:MM:SS..." (ISO) as "YYYY-MM-DD HH:MM:SS", keeping the
 * recorded wall-clock time (no timezone conversion). Falls back to the input. */
export function formatIsoDateTime(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/.exec(value);
  return match ? `${match[1]} ${match[2]}` : value;
}
