import { prepareImport } from '../src/lib/ctp-import';
async function main(){
 const {accepted,audit,...counts}=await prepareImport('data/ctp_exports/ctp_all_stops.csv','data/ctp_exports/ctp_duplicate_conflicts.csv');
 console.log(JSON.stringify({...counts,accepted:accepted.length,ambiguousDistricts:accepted.filter(s=>s.district===null).length,rejectionReasons:audit.filter(a=>a.file==='stops').reduce<Record<string,number>>((o,r)=>(o[r.reason]=(o[r.reason]||0)+1,o),{})},null,2));
 if(counts.conflicts||!accepted.length)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
