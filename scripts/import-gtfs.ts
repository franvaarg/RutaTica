/** Explicit local target only; never writes the protected repository snapshot. */
import { PrismaClient } from '@prisma/client';
import { readFeed, auditTables } from '../src/lib/gtfs-audit';
import { publishGtfs } from '../src/lib/gtfs-publication';
import { localImportTarget } from '../src/lib/storage/sqlite';
async function main() {
  const args=process.argv.slice(2);
  if(args.includes('--apply')&&args.includes('--dry-run')) throw new Error('Choose --apply or --dry-run');
  let directory='gtfs-data',sourceKey='rutatica-gtfs';let apply=false;
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--apply') apply=true;
    else if(args[i]==='--dry-run') continue;
    else if(['--gtfs-dir','-d','--source'].includes(args[i])&&args[i+1]) {const k=args[i++];if(k==='--source')sourceKey=args[i];else directory=args[i];}
    else throw new Error('Usage: import-gtfs [--gtfs-dir directory] [--source key] [--apply|--dry-run]');
  }
  const feed=readFeed(directory);const audit=auditTables(feed.tables,feed.parseErrors);
  if(!apply) {console.log(JSON.stringify({checksum:feed.checksum,...audit},null,2));if(audit.errors.length)process.exitCode=1;return;}
  const client=new PrismaClient({datasourceUrl:await localImportTarget(process.env.DATABASE_URL)});
  try { console.log(JSON.stringify(await publishGtfs(client,feed,{sourceKey}),null,2)); }
  finally {await client.$disconnect();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
