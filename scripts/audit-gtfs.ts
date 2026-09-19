import { auditGtfs } from '../src/lib/gtfs-audit';
const report = auditGtfs(process.argv[2] || 'gtfs-data');
console.log(JSON.stringify(report, null, 2));
if (report.errors.length) process.exitCode = 1;
