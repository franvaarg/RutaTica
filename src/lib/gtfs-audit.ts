import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

type Row = Record<string, string>;
/** Read-only preflight. Unsupported scheduling features fail closed, without altering source rows. */
export function auditGtfs(directory: string) {
  const errors: string[] = [], warnings: string[] = [];
  const tables: Record<string, Row[]> = {};
  const keys: Record<string, string[]> = {
    agency: ['agency_id'], stops: ['stop_id'], routes: ['route_id'], trips: ['trip_id'],
    stop_times: ['trip_id', 'stop_sequence'], calendar: ['service_id'],
    calendar_dates: ['service_id', 'date'], shapes: ['shape_id', 'shape_pt_sequence'],
    frequencies: ['trip_id', 'start_time'],
  };
  for (const [name, primary] of Object.entries(keys)) {
    const file = path.join(directory, `${name}.txt`);
    if (!existsSync(file)) { tables[name] = []; continue; }
    try {
      tables[name] = parse(readFileSync(file, 'utf8'), { bom: true, skip_empty_lines: true, columns: (headers: string[]) => {
        if (new Set(headers).size !== headers.length || primary.some(k => !headers.includes(k))) throw new Error('headers');
        return headers;
      } });
      const seen = new Set<string>();
      for (const [i, row] of tables[name].entries()) {
        const key = JSON.stringify(primary.map(k => row[k]));
        if (primary.some(k => !row[k]?.trim()) || seen.has(key)) errors.push(`${name}:${i + 2}: missing/duplicate identifier`);
        seen.add(key);
      }
    } catch { errors.push(`${name}: malformed CSV/header`); tables[name] = []; }
  }
  for (const name of ['agency','stops','routes','trips','stop_times']) if (!tables[name].length) errors.push(`${name}: required records missing`);
  const ids = (table: string, key: string) => new Set(tables[table].map(r => r[key]));
  const stops = ids('stops','stop_id'), trips = ids('trips','trip_id'), routes = ids('routes','route_id');
  const services = new Set([...ids('calendar','service_id'), ...ids('calendar_dates','service_id')]);
  const shapes = ids('shapes','shape_id');
  const missingShapes = new Set<string>();
  for (const r of tables.trips) {
    if (!routes.has(r.route_id) || !services.has(r.service_id)) errors.push('trips: missing route/service');
    if (r.shape_id && !shapes.has(r.shape_id)) missingShapes.add(r.shape_id);
    if (!ids('calendar','service_id').has(r.service_id)) errors.push('trips: calendar_dates-only service unsupported by current relational schema');
  }
  if (missingShapes.size) warnings.push(`${missingShapes.size} referenced shapes absent; geometry must remain unavailable`);
  const numeric = (v: string | undefined) => !!v?.trim() && Number.isFinite(Number(v));
  const integer = (v: string | undefined) => numeric(v) && Number.isInteger(Number(v)) && Number(v) >= 0;
  for (const [name, prefix] of [['stops','stop'],['shapes','shape_pt']]) for (const r of tables[name]) {
    const lat = r[`${prefix}_lat`], lon = r[`${prefix}_lon`];
    if (!numeric(lat) || !numeric(lon) || Math.abs(Number(lat)) > 90 || Math.abs(Number(lon)) > 180) errors.push(`${name}: invalid coordinates`);
  }
  const seconds = (v: string) => /^\d{2,3}:[0-5]\d:[0-5]\d$/.test(v || '') ? v.split(':').reduce((n,p) => n*60+Number(p),0) : NaN;
  let overnightRows = 0;
  for (const r of tables.stop_times) {
    if (!stops.has(r.stop_id) || !trips.has(r.trip_id)) errors.push('stop_times: missing stop/trip');
    if (!integer(r.stop_sequence)) errors.push('stop_times: invalid sequence');
    if (!Number.isFinite(seconds(r.arrival_time)) || !Number.isFinite(seconds(r.departure_time))) errors.push('stop_times: absent/invalid time; interpolation unsupported');
    if (seconds(r.arrival_time) >= 86400) overnightRows++;
    for (const key of ['pickup_type','drop_off_type']) if (r[key] && !['0','1','2','3'].includes(r[key])) errors.push(`stop_times: invalid ${key}`);
  }
  for (const [name, group, sequence] of [['stop_times','trip_id','stop_sequence'],['shapes','shape_id','shape_pt_sequence']]) {
    const grouped = new Map<string, Row[]>();
    for (const r of tables[name]) { const list=grouped.get(r[group]) || []; list.push(r); grouped.set(r[group],list); }
    for (const rows of grouped.values()) {
      rows.sort((a,b) => Number(a[sequence])-Number(b[sequence]));
      let distance=-1, time=-1;
      for (const r of rows) {
        if (!integer(r[sequence])) errors.push(`${name}: invalid sequence`);
        if (r.shape_dist_traveled) {
          const d=Number(r.shape_dist_traveled);
          if (!Number.isFinite(d) || d < distance) errors.push(`${name}: invalid/decreasing shape distance`);
          distance=d;
        }
        if (name === 'stop_times') for (const field of ['arrival_time','departure_time']) {
          const t=seconds(r[field]); if (t < time) errors.push('stop_times: decreasing time'); time=t;
        }
      }
    }
  }
  const dateValid = (v: string) => /^\d{8}$/.test(v || '') && new Date(`${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}T12:00:00Z`).toISOString().slice(0,10).replaceAll('-','') === v;
  for (const r of tables.calendar) {
    try { if (!dateValid(r.start_date) || !dateValid(r.end_date) || r.start_date > r.end_date) errors.push('calendar: invalid date range'); } catch { errors.push('calendar: invalid date'); }
    for (const day of ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']) if (!['0','1'].includes(r[day])) errors.push('calendar: invalid weekday');
  }
  for (const r of tables.calendar_dates) {
    try { if (!dateValid(r.date) || !['1','2'].includes(r.exception_type)) errors.push('calendar_dates: invalid exception'); } catch { errors.push('calendar_dates: invalid date'); }
  }
  if (tables.frequencies.length) errors.push('frequencies: unsupported by local planner; use OTP or a reviewed scheduled feed');
  return { counts: Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length])), errors: [...new Set(errors)], warnings, missingShapes: [...missingShapes].sort(), overnightRows };
}
