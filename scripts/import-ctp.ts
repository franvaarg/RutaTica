import { PrismaClient } from '@prisma/client';
import { prepareImport, resolveCtpInput } from '../src/lib/ctp-import';
import { publishCtp, recordReconciliation } from '../src/lib/ctp-publication';
import { localImportTarget } from '../src/lib/storage/sqlite';
async function main(){
 const args=process.argv.slice(2);if(args.some(a=>!['--apply','--dry-run'].includes(a)) || args.includes('--apply')&&args.includes('--dry-run'))throw new Error('Usage: import-ctp [--apply|--dry-run]');
 const prepared=await prepareImport(await resolveCtpInput('data/ctp_exports','ctp_all_stops.csv'),await resolveCtpInput('data/ctp_exports','ctp_duplicate_conflicts.csv'));
 if(!args.includes('--apply')){const {accepted,audit:_audit,...counts}=prepared;console.log(JSON.stringify({...counts,accepted:accepted.length},null,2));return;}
 const client=new PrismaClient({datasourceUrl:await localImportTarget(process.env.DATABASE_URL)});
 try{console.log(JSON.stringify(await publishCtp(client,prepared),null,2));console.log(JSON.stringify(await recordReconciliation(client)));}finally{await client.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
