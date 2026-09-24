import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
export type Row = Record<string, string>;
export type Feed = Record<string, Row[]>;
const keys: Record<string, string[]> = {
  agency: ['agency_id'], stops: ['stop_id'], routes: ['route_id'], trips: ['trip_id'],
  stop_times: ['trip_id', 'stop_sequence'], calendar: ['service_id'],
  calendar_dates: ['service_id', 'date'], shapes: ['shape_id', 'shape_pt_sequence'],
  frequencies: ['trip_id', 'start_time'], fare_attributes: ['fare_id'],
};
export function readFeed(directory: string) {
  const tables: Feed = {}; const hash = createHash('sha256'); const parseErrors: string[] = [];
  for (const name of Object.keys(keys)) tables[name] = [];
  for (const filename of readdirSync(directory).filter(n => /\.(txt|csv)$/.test(n)).sort()) {
    const content = readFileSync(path.join(directory, filename));
    hash.update(filename).update('\0').update(content).update('\0');
    try {
      tables[filename.replace(/\.(txt|csv)$/, '')] = parse(content, { bom: true, skip_empty_lines: true,
        columns: (headers: string[]) => {
          if (new Set(headers).size !== headers.length || headers.some(h => ['__proto__','constructor','prototype'].includes(h))) throw new Error('headers');
          return headers;
        } });
    } catch { parseErrors.push(`${filename}: malformed CSV/header`); }
  }
  return { tables, checksum: hash.digest('hex'), parseErrors };
}
export { serviceSeconds } from './service-time';
import { serviceSeconds } from './service-time';
const validDate = (v: string) => {
  if (!/^\d{8}$/.test(v || '')) return false;
  const d = new Date(`${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}T12:00:00Z`);
  return Number.isFinite(+d) && d.toISOString().slice(0,10).replaceAll('-','') === v;
};
/** Schedule integrity; unsupported planner features are reported separately. No writes. */
export function auditTables(input: Feed, parseErrors: string[] = []) {
  const tables = { ...Object.fromEntries(Object.keys(keys).map(k => [k, []])), ...input } as Feed;
  const errors = [...parseErrors], warnings: string[] = [], unsupported: string[] = [];
  const fail = (t: string, i: number, message: string) => errors.push(`${t}:${i + 2}: ${message}`);
  const ids = (t: string, k: string) => new Set(tables[t].map(r => r[k]));
  const required: Record<string, string[]> = {
    agency: ['agency_name','agency_url','agency_timezone'], stops: ['stop_id'], routes: ['route_id','route_type'],
    trips: ['route_id','service_id','trip_id'], stop_times: ['trip_id','stop_id','stop_sequence'],
    calendar: ['service_id','monday','tuesday','wednesday','thursday','friday','saturday','sunday','start_date','end_date'],
    calendar_dates: ['service_id','date','exception_type'], shapes: ['shape_id','shape_pt_lat','shape_pt_lon','shape_pt_sequence'],
  };
  for (const t of ['agency','stops','routes','trips','stop_times']) if (!tables[t].length) errors.push(`${t}: required records missing`);
  if (!tables.calendar.length && !tables.calendar_dates.length) errors.push('service: calendar or calendar_dates required');
  for (const [t, rows] of Object.entries(tables)) {
    const seen = new Set<string>();
    rows.forEach((r,i) => {
      if (Object.values(r).some(v=>v.includes('\0'))) fail(t,i,'NUL byte in text');
      for (const k of required[t] || []) if (!r[k]?.trim()) fail(t,i,`missing ${k}`);
      for (const [k,v] of Object.entries(r)) if (k.endsWith('_id') && v && (v !== v.trim() || /[\x00-\x1f\x7f]/.test(v))) fail(t,i,`malformed identifier ${k}`);
      const pk = keys[t];
      if (pk) {
        const key = JSON.stringify(pk.map(k => k.endsWith('sequence') ? Number(r[k]) : r[k] || ''));
        if (seen.has(key)) fail(t,i,'duplicate key'); seen.add(key);
        if (!(t === 'agency' && rows.length === 1) && pk.some(k => !r[k]?.trim())) fail(t,i,'missing identifier');
      }
    });
  }
  const numeric = (v: string | undefined) => !!v?.trim() && Number.isFinite(Number(v));
  const integer = (v: string | undefined) => /^\d+$/.test(v || '') && Number.isSafeInteger(Number(v));
  const enumField = (t: string, i: number, r: Row, field: string, values: string[]) => {
    if (r[field] && !values.includes(r[field])) fail(t,i,`invalid ${field}`);
  };
  const agencies = ids('agency','agency_id'), stops = ids('stops','stop_id'), routes = ids('routes','route_id'), trips = ids('trips','trip_id');
  tables.agency.forEach((r,i) => {
    try { if (!['http:','https:'].includes(new URL(r.agency_url).protocol)) throw Error(); } catch { fail('agency',i,'invalid URL'); }
    try { new Intl.DateTimeFormat('en',{timeZone:r.agency_timezone}).format(); } catch { fail('agency',i,'invalid timezone'); }
  });
  if (new Set(tables.agency.map(r=>r.agency_timezone)).size > 1) errors.push('agency: timezones must agree');
  if (tables.agency.some(r=>r.agency_timezone !== 'America/Costa_Rica')) unsupported.push('local planner supports America/Costa_Rica only');
  tables.routes.forEach((r,i) => {
    if ((tables.agency.length > 1 && !r.agency_id) || (r.agency_id && !agencies.has(r.agency_id))) fail('routes',i,'missing agency');
    if (!r.route_short_name?.trim() && !r.route_long_name?.trim()) fail('routes',i,'route name required');
    enumField('routes',i,r,'route_type',['0','1','2','3','4','5','6','7','11','12']);
    for (const k of ['route_color','route_text_color']) if (r[k] && !/^[0-9a-f]{6}$/i.test(r[k])) fail('routes',i,`invalid ${k}`);
    for (const k of ['continuous_pickup','continuous_drop_off']) if (r[k] && r[k] !== '1') unsupported.push('continuous pickup/drop-off unsupported by local planner');
  });
  const byStop = new Map(tables.stops.map(r=>[r.stop_id,r]));
  tables.stops.forEach((r,i) => {
    const kind = r.location_type || '0'; enumField('stops',i,r,'location_type',['0','1','2','3','4']);
    if (['0','1','2'].includes(kind) && !r.stop_name?.trim()) fail('stops',i,'missing stop_name');
    if (r.parent_station && !stops.has(r.parent_station)) fail('stops',i,'missing parent_station');
    if (['2','3','4'].includes(kind) && !r.parent_station) fail('stops',i,'parent_station required');
    if (kind==='1' && r.parent_station) fail('stops',i,'station cannot have parent');
    if (r.parent_station && byStop.get(r.parent_station)?.location_type !== (kind==='4'?'0':'1') && !(kind==='4' && !byStop.get(r.parent_station)?.location_type)) fail('stops',i,'invalid parent type');
    enumField('stops',i,r,'wheelchair_boarding',['0','1','2']);
  });
  for (const [t,prefix] of [['stops','stop'],['shapes','shape_pt']]) tables[t].forEach((r,i) => {
    const lat=r[`${prefix}_lat`], lon=r[`${prefix}_lon`];
    if (t==='stops' && ['3','4'].includes(r.location_type) && !lat && !lon) return;
    if (!numeric(lat)||!numeric(lon)||Math.abs(Number(lat))>90||Math.abs(Number(lon))>180) fail(t,i,'invalid coordinates');
    else if (Number(lat)===0 && Number(lon)===0) warnings.push(`${t}:${i+2}: zero coordinate pair; verify geography`);
  });
  const services = new Set([...ids('calendar','service_id'),...ids('calendar_dates','service_id')]);
  const shapes=ids('shapes','shape_id'), missingShapes=new Set<string>();
  tables.trips.forEach((r,i)=>{
    if (!routes.has(r.route_id)) fail('trips',i,'missing route');
    if (!services.has(r.service_id)) fail('trips',i,'missing service');
    if (r.shape_id && !shapes.has(r.shape_id)) { missingShapes.add(r.shape_id); fail('trips',i,`missing shape ${r.shape_id}`); }
    enumField('trips',i,r,'direction_id',['0','1']);
    for (const k of ['wheelchair_accessible','bikes_allowed']) enumField('trips',i,r,k,['0','1','2']);
  });
  tables.calendar.forEach((r,i)=>{
    if (!validDate(r.start_date)||!validDate(r.end_date)||r.start_date>r.end_date) fail('calendar',i,'invalid date range');
    for(const d of ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']) if(!['0','1'].includes(r[d])) fail('calendar',i,`invalid ${d}`);
  });
  tables.calendar_dates.forEach((r,i)=>{
    if(!validDate(r.date)||!['1','2'].includes(r.exception_type)) fail('calendar_dates',i,'invalid exception');
  });
  for (const service of services) {
    if (!tables.calendar.some(r=>r.service_id===service) && !tables.calendar_dates.some(r=>r.service_id===service&&r.exception_type==='1')) errors.push(`service ${service}: exception-only service has no added dates`);
  }
  const timed=new Set<string>(); let overnightRows=0;
  tables.stop_times.forEach((r,i)=>{
    timed.add(r.trip_id);
    if(!trips.has(r.trip_id)||!stops.has(r.stop_id)) fail('stop_times',i,'missing trip/stop');
    if(byStop.has(r.stop_id)&&!['0','4'].includes(byStop.get(r.stop_id)!.location_type||'0')) fail('stop_times',i,'invalid boarding location type');
    for(const k of ['arrival_time','departure_time']) if(r[k] && !Number.isFinite(serviceSeconds(r[k]))) fail('stop_times',i,`invalid ${k}`);
    if (!!r.arrival_time !== !!r.departure_time) fail('stop_times',i,'arrival/departure must both be specified');
    if ((!r.arrival_time || !r.departure_time) && (r.timepoint||'1')==='1') fail('stop_times',i,'timepoint requires times');
    if (!r.arrival_time) unsupported.push('interpolated stop times unsupported by local planner');
    for (const k of ['pickup_type','drop_off_type']) enumField('stop_times',i,r,k,['0','1','2','3']);
    enumField('stop_times',i,r,'timepoint',['0','1']);
    if ((serviceSeconds(r.arrival_time)||0)>=86400) overnightRows++;
    for (const k of ['continuous_pickup','continuous_drop_off']) if (r[k] && r[k] !== '1') unsupported.push('continuous pickup/drop-off unsupported by local planner');
  });
  for(const tid of trips) if(!timed.has(tid)) errors.push(`trip ${tid}: no stop_times`);
  for(const [t,group,seq] of [['stop_times','trip_id','stop_sequence'],['shapes','shape_id','shape_pt_sequence']]) {
    const grouped=new Map<string,Row[]>();
    tables[t].forEach((r,i)=>{if(!integer(r[seq])) fail(t,i,'invalid sequence');const a=grouped.get(r[group])||[];a.push(r);grouped.set(r[group],a);});
    for(const [id,rs] of grouped) {
      rs.sort((a,b)=>Number(a[seq])-Number(b[seq]));let dist=-1,time=-1;
      if(rs.length<2) errors.push(`${t} ${id}: fewer than two points/stops`);
      if(t==='stop_times' && [rs[0],rs[rs.length-1]].some(r=>!r.arrival_time||!r.departure_time)) errors.push(`stop_times ${id}: endpoints require times`);
      for(const r of rs) {
        if(r.shape_dist_traveled) {const d=Number(r.shape_dist_traveled);if(!Number.isFinite(d)||d<0||d<dist) errors.push(`${t} ${id}: invalid/decreasing distance`);dist=d;}
        if(t==='stop_times') for(const k of ['arrival_time','departure_time']) {const s=serviceSeconds(r[k]);if(s!==null){if(s<time)errors.push(`stop_times ${id}: decreasing time`);time=s;}}
      }
    }
  }
  if(tables.frequencies.length) unsupported.push('frequencies unsupported by local planner; use OTP');
  const fares=ids('fare_attributes','fare_id');
  for(const r of tables.fare_rules||[]) if(!fares.has(r.fare_id)||(r.route_id&&!routes.has(r.route_id))) errors.push('fare_rules: orphan fare/route');
  return { counts:Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length])), errors:[...new Set(errors)], warnings:[...new Set(warnings)], unsupported:[...new Set(unsupported)], missingShapes:[...missingShapes].sort(), overnightRows };
}
export function auditGtfs(directory: string) {
  const feed=readFeed(directory);return auditTables(feed.tables,feed.parseErrors);
}
