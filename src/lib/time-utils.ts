import { db } from '@/lib/db';

/**
 * Convert a GTFS time string "HH:MM:SS" to total minutes since midnight.
 * Handles times > 24:00:00 (next day service, e.g., "25:30:00" = 1:30 AM next day).
 */
export function timeToMinutes(timeStr: string): number {
  const parts = timeStr.split(':').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return 0;
  const hours = parts[0];
  const minutes = parts[1];
  const seconds = parts[2];
  return hours * 60 + minutes + seconds / 60;
}

/**
 * Convert total minutes since midnight to "HH:MM:SS" string.
 */
export function minutesToTime(minutes: number): string {
  const totalMinutes = Math.floor(minutes);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const s = Math.round((minutes - totalMinutes) * 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * Get the current service ID based on the day of the week.
 * Returns "weekday", "saturday", or "sunday".
 */
export function getCurrentServiceId(): string {
  const now = new Date();
  const day = now.getDay();
  if (day === 0) return 'sunday';
  if (day === 6) return 'saturday';
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

  return sorted.length > 0 ? sorted[0].departure_time : null;
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
  const now = new Date();
  const y = now.getFullYear();
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const d = now.getDate().toString().padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * Get active service IDs for today considering calendar and exceptions.
 */
export async function getActiveServiceIdsToday(): Promise<string[]> {
  const serviceId = getCurrentServiceId();
  const todayStr = getTodayDateStr();

  const calendar = await db.gtfsCalendar.findUnique({
    where: { service_id: serviceId },
  });

  if (!calendar) return [];

  const dayMap: Record<string, boolean> = {
    '0': calendar.sunday,
    '1': calendar.monday,
    '2': calendar.tuesday,
    '3': calendar.wednesday,
    '4': calendar.thursday,
    '5': calendar.friday,
    '6': calendar.saturday,
  };

  const dayOfWeek = new Date().getDay().toString();
  const isServiceDay = dayMap[dayOfWeek] ?? false;

  if (!isServiceDay) {
    const exception = await getServiceException(serviceId, todayStr);
    if (exception !== 1) return [];
  }

  const removedException = await getServiceException(serviceId, todayStr);
  if (removedException === 2) return [];

  return [serviceId];
}