/** GTFS feed timezone; never use the deployment host's local timezone. */
export function serviceDateTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  const day = `${part('year')}-${part('month')}-${part('day')}`;
  return { date: day, compactDate: day.replaceAll('-', ''), time: `${part('hour')}:${part('minute')}:${part('second')}`,
    weekday: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date(`${day}T12:00:00Z`).getUTCDay()] };
}

export function activeServices(calendars: Array<{ service_id: string; start_date: string; end_date: string } & Record<string, unknown>>, exceptions: Array<{ service_id: string; date: string; exception_type: number }>, date = new Date()): string[] {
  const { compactDate, weekday } = serviceDateTime(date);
  const active = new Set(calendars.filter(c => c.start_date <= compactDate && c.end_date >= compactDate && c[weekday] === true).map(c => c.service_id));
  for (const e of exceptions.filter(e => e.date === compactDate)) {
    if (e.exception_type === 1) active.add(e.service_id);
    if (e.exception_type === 2) active.delete(e.service_id);
  }
  return [...active].sort();
}
