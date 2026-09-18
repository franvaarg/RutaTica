import { PrismaClient } from '@prisma/client';
import { mkdir, realpath, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { databaseUrl } from '../src/lib/environment';
import { prepareImport, importPrepared, resolveCtpInput } from '../src/lib/ctp-import';
import { ciudadQuesadaCoverage, reconcileStops } from '../src/lib/stop-reconciliation';

async function main() {
  const started = performance.now();
  const args = process.argv.slice(2);
  if (args.some(a => !['--apply', '--dry-run'].includes(a)) || (args.includes('--apply') && args.includes('--dry-run'))) throw new Error('Usage: import-ctp [--dry-run | --apply]');
  if (!process.env.DATABASE_URL) throw new Error('Explicit DATABASE_URL is required, including for dry-run');
  const url = databaseUrl(process.env.DATABASE_URL)!;
  // An existing file is required: a typo must never create an empty database.
  await realpath(url.slice(5));
  const root = await realpath(path.resolve('data/ctp_exports'));
  const input = (name: string) => resolveCtpInput(root, name);
  const output = path.resolve('data/ctp_reports');
  await mkdir(output, { recursive: true });
  if (await realpath(output) !== output) throw new Error('Report directory must not be a symlink');
  const run = path.join(output, `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`);
  await mkdir(run);
  const client = new PrismaClient({ datasourceUrl: url });
  try {
    const prepared = await prepareImport(await input('ctp_all_stops.csv'), await input('ctp_duplicate_conflicts.csv'));
    // JSONL avoids spreadsheet formula interpretation; never emit source values as CSV formulas.
    await writeFile(path.join(run, 'audit.jsonl'), prepared.audit.map(r => JSON.stringify(r)).join('\n') + '\n', { flag: 'wx' });
    const importStarted = performance.now();
    const result = await importPrepared(client, prepared, args.includes('--apply'));
    const importDurationMs = Math.round(performance.now() - importStarted);
    const gtfs = (await client.gtfsStop.findMany({ where: { location_type: 0 }, select: { stop_id: true, lat: true, lon: true } })).map(s => ({ id: s.stop_id, lat: s.lat, lon: s.lon }));
    const ctp = prepared.accepted.map(s => ({ id: s.sourceStopId, lat: s.lat, lon: s.lon }));
    const reconciliation = reconcileStops(ctp, gtfs);
    await writeFile(path.join(run, 'reconciliation.json'), JSON.stringify(reconciliation, null, 2), { flag: 'wx' });
    const report = { ...result, importDurationMs, totalDurationMs: Math.round(performance.now() - started),
      databaseSizeBytes: (await stat(url.slice(5))).size, maxRssKiB: process.resourceUsage().maxRSS, database: url, coverageIsProjected: !args.includes('--apply'),
      ciudadQuesada: ciudadQuesadaCoverage(ctp, gtfs), reconciliation: {
        likelyOverlaps: reconciliation.likelyOverlaps.length, ambiguousMatches: reconciliation.ambiguousMatches.length,
        unmatchedCtp: reconciliation.unmatchedCtp.length, unmatchedGtfs: reconciliation.unmatchedGtfs.length,
      }, reportDirectory: run };
    await writeFile(path.join(run, 'summary.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    await writeFile(path.join(run, 'failure.json'), JSON.stringify({ mode: args.includes('--apply') ? 'apply' : 'dry-run', error: error instanceof Error ? error.message : 'Unknown failure' }), { flag: 'wx' });
    throw error;
  } finally { await client.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Import failed'); process.exitCode = 1; });
