import { serviceSeconds } from './service-time';
import { serviceDateTime, activeServices } from './service-date';
import { db } from '@/lib/db';

/**
 * Convert a GTFS time string "HH:MM:SS" to total minutes since midnight.
 * Handles times > 24:00:00 (next day service, e.g., "25:30:00" = 1:30 AM next day).
 */
export function timeToMinutes(timeStr: string): number {
  const seconds = serviceSeconds(timeStr);
  return seconds === null ? Number.NaN : seconds / 60;
}

/**
 * Convert total minutes since midnight to "HH:MM:SS" string.
 */
export function minutesToTime(minutes: number): string {
  const totalSeconds = Math.round(minutes * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor(totalSeconds / 60) % 60;
  const sec = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

/**
 * Get the current service ID based on the day of the week.
 * Returns "weekday", "saturday", or "sunday".
 */
export function getCurrentServiceId(): string {
  const day = serviceDateTime().weekday;
  if (day === 'sunday') return 'sunday';
  if (day === 'saturday') return 'saturday';
  return 'weekday';
}

/**
 * Find the next departure time from a list of stop times after a given time.
 * Times are in "HH:MM:SS" format.
 * Returns the departure time string or null if no future departure is found.
 */
export function getNextDepartureTime(
  stopTimes: { departure_time: string }[],
  afterTimeStr: string
): string | null {
  if (stopTimes.length === 0) return null;

  const afterMinutes = timeToMinutes(afterTimeStr);

  const sorted = [...stopTimes].sort(
    (a, b) => timeToMinutes(a.departure_time) - timeToMinutes(b.departure_time)
  );

  for (const st of sorted) {
    if (timeToMinutes(st.departure_time) >= afterMinutes) {
      return st.departure_time;
    }
  }

  return null;
}

/**
 * Check if a given date string has any service exceptions in calendar_dates.
 * Returns the exception type (1 = added, 2 = removed) or null.
 */
export async function getServiceException(
  serviceId: string,
  dateStr: string
): Promise<number | null> {
  const exception = await db.gtfsCalendarDate.findFirst({
    where: {
      service_id: serviceId,
      date: dateStr,
    },
  });
  return exception ? exception.exception_type : null;
}

/**
 * Get today's date as YYYYMMDD string.
 */
export function getTodayDateStr(): string {
  return serviceDateTime().compactDate;
}

/**
 * Get active service IDs for today considering calendar and exceptions.
 */
export async function getActiveServiceIdsToday(date = new Date()): Promise<string[]> {
  const todayStr = serviceDateTime(date).compactDate;
  const [calendars, exceptions] = await Promise.all([
    db.gtfsCalendar.findMany({
      where: { start_date: { lte: todayStr }, end_date: { gte: todayStr } },
    }),
    db.gtfsCalendarDate.findMany({ where: { date: todayStr } }),
  ]);
  return activeServices(calendars, exceptions, date);
}
