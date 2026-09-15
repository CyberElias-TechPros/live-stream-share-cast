/** ISO-8601 UTC helpers — D1 stores timestamps as sortable ISO strings. */

export function nowIso(): string {
  return new Date().toISOString();
}

export function isoIn(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

export function isoHoursFromNow(hours: number): string {
  return isoIn(hours * 60 * 60 * 1000);
}

export function isoMinutesAgo(minutes: number): string {
  return isoIn(-minutes * 60 * 1000);
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
