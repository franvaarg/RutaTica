import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'csv-parse';

export type CsvRow = Record<string, string>;
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
// Normalize decimal formatting without rounding original coordinates through IEEE floats.
function decimalIdentity(value = '') {
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(value.trim());
  if (!match) return value;
  let digits = (match[2] + (match[3] || '')).replace(/^0+/, '');
  if (!digits) return '0';
  let exponent = Number(match[4] || 0) - (match[3] || '').length;
  while (digits.endsWith('0')) { digits = digits.slice(0, -1); exponent++; }
  return `${match[1] === '-' ? '-' : ''}${digits}e${exponent}`;
}
export function identity(row: CsvRow) {
  return hash(JSON.stringify([row.source_stop_identifier, decimalIdentity(row.coord_x), decimalIdentity(row.coord_y)]));
}
export async function resolveCtpInput(root: string, name: string) {
  if (!['ctp_all_stops.csv', 'ctp_duplicate_conflicts.csv'].includes(name)) throw new Error('Input filename is not allowed');
  const directory = await realpath(root);
  const file = await realpath(path.join(directory, name));
  if (path.dirname(file) !== directory) throw new Error('Input symlink escapes export directory');
  return file;
}
export async function readCsv(file: string, required: string[]): Promise<CsvRow[]> {
  const info = await stat(file);
  if (!info.isFile() || info.size > 100 * 1024 * 1024) throw new Error('CSV must be a regular file under 100 MiB');
  const rows: CsvRow[] = [];
  const parser = createReadStream(file).pipe(parse({
    bom: true, skip_empty_lines: true, max_record_size: 64 * 1024,
    columns: (headers: string[]) => {
      if (new Set(headers).size !== headers.length || required.some(k => !headers.includes(k))) throw new Error('Invalid CSV header');
      if (headers.some(k => ['__proto__', 'constructor', 'prototype'].includes(k))) throw new Error('Unsafe CSV header');
      return headers;
    },
  }));
  for await (const row of parser) {
    if (rows.length >= 150000) throw new Error('CSV row limit exceeded');
    rows.push(row);
  }
  return rows;
}
const required = ['source_stop_identifier', 'identificador_parada', 'candidate_id', 'descripcion', 'latitude', 'longitude', 'coord_x', 'coord_y', 'province', 'canton', 'source_crs', 'output_crs', 'source_endpoint', 'retrieved_at'];
export function validateRow(r: CsvRow): string | null {
  if (required.some(k => !r[k]?.trim())) return 'missing_required_value';
  if (r.source_stop_identifier !== r.source_stop_identifier.trim() || /[\x00-\x1f\x7f]/.test(r.source_stop_identifier)) return 'invalid_identifier';
  if (r.descripcion.includes('\0')) return 'invalid_name';
  if (r.source_stop_identifier !== r.identificador_parada) return 'identifier_mismatch';
  if (r.descripcion.length > 1000 || r.source_stop_identifier.length > 200) return 'oversized_value';
  if (!/^[a-f0-9]{64}$/.test(r.candidate_id)) return 'invalid_candidate_id';
  if (['latitude', 'longitude', 'coord_x', 'coord_y'].some(k => !r[k]?.trim() || !Number.isFinite(Number(r[k])))) return 'invalid_coordinate';
  const lat = Number(r.latitude), lon = Number(r.longitude);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return 'coordinate_out_of_range';
  // Conservative mainland CR screen, not a claim about an administrative boundary.
  if (lat < 8 || lat > 11.3 || lon < -86 || lon > -82.5) return 'outside_cr_screen';
  if (r.output_crs !== 'EPSG:4326' || r.source_crs !== 'EPSG:5367' || r.coordinate_status !== 'valid') return 'invalid_crs_or_status';
  if (r.geometry_conflict !== 'False' || r.outside_cr_screen !== 'False') return 'coordinate_conflict';
  if (r.source_endpoint !== 'https://visortp.ctp.go.cr/Visor/service/ctp' || !Number.isFinite(Date.parse(r.retrieved_at))) return 'invalid_provenance';
  for (const key of ['original_payload', 'wfs_numeric_ids', 'wfs_feature_ids', 'district_candidates', 'source_records', 'selection_provenance']) {
    try { const v = JSON.parse(r[key]); if (!v || typeof v !== 'object') return 'invalid_metadata'; } catch { return 'invalid_metadata'; }
  }
  return null;
}
export function toCtpData(r: CsvRow) {
  const { distance_ciudad_quesada_m: _distance, ...metadata } = r;
  const data = {
    identityKey: identity(r), source: 'CTP', sourceStopId: r.source_stop_identifier,
    candidateId: r.candidate_id, name: r.descripcion.trim(), lat: Number(r.latitude), lon: Number(r.longitude),
    coordX: r.coord_x, coordY: r.coord_y, province: r.province, canton: r.canton,
    district: r.wfs_ambiguous === 'True' ? null : r.district || null,
    sourceMetadata: JSON.stringify(metadata),
  };
  return { ...data, contentHash: hash(JSON.stringify(data)) };
}
export type AuditRow = { file: string; row: number; reason: string; data: CsvRow };
export async function prepareImport(stopsFile: string, conflictsFile: string) {
  const rows = await readCsv(stopsFile, required);
  const conflicts = await readCsv(conflictsFile, ['source_stop_identifier', 'coord_x', 'coord_y', 'conflict_type']);
  const audit: AuditRow[] = [];
  const blocked = new Set<string>();
  const candidates = new Map(rows.map(r => [identity(r), r]));
  let duplicateOccurrences = 0;
  const duplicateGroups = new Set<string>();
  for (const [index, r] of conflicts.entries()) {
    const candidate = candidates.get(identity(r));
    // Verify the duplicate label against the actual normalized row, rather than trusting it.
    const exact = r.conflict_type === 'exact_duplicate' && candidate &&
      ['descripcion', 'latitude', 'longitude', 'coord_x', 'coord_y'].every(k => r[k] === candidate[k]);
    if (exact) { duplicateOccurrences++; duplicateGroups.add(identity(r)); }
    else blocked.add(r.source_stop_identifier);
    audit.push({ file: 'conflicts', row: index + 2, reason: exact ? 'source_exact_duplicate' : 'source_conflict', data: r });
  }
  const byIdentity = new Map<string, string>();
  const bySource = new Map<string, string>();
  for (const r of rows) {
    const key = identity(r), content = toCtpData(r).contentHash;
    if (bySource.has(r.source_stop_identifier) && bySource.get(r.source_stop_identifier) !== key) blocked.add(r.source_stop_identifier);
    bySource.set(r.source_stop_identifier, key);
    if (byIdentity.has(key) && byIdentity.get(key) !== content) blocked.add(r.source_stop_identifier);
    byIdentity.set(key, content);
  }
  const accepted: ReturnType<typeof toCtpData>[] = [];
  const seen = new Set<string>();
  let invalid = 0, conflictRows = 0, duplicates = 0;
  for (const [index, r] of rows.entries()) {
    const reason = validateRow(r);
    let rejection = reason;
    if (reason) invalid++;
    else if (blocked.has(r.source_stop_identifier)) { rejection = 'source_conflict'; conflictRows++; }
    else if (seen.has(identity(r))) { rejection = 'duplicate_input'; duplicates++; }
    if (rejection) audit.push({ file: 'stops', row: index + 2, reason: rejection, data: r });
    else { seen.add(identity(r)); accepted.push(toCtpData(r)); }
  }
  return { accepted, audit, totalRowsRead: rows.length, invalid, conflicts: conflictRows,
    conflictSourceIds: blocked.size, duplicates, sourceDuplicateOccurrences: duplicateOccurrences,
    sourceDuplicateGroups: duplicateGroups.size, sourceDuplicateExtraRows: duplicateOccurrences - duplicateGroups.size,
    sourceConflictingRows: conflicts.length - duplicateOccurrences,
    sourceConflictReportRows: conflicts.length, skipped: rows.length - accepted.length };
}
