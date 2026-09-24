import { Prisma, type PrismaClient } from '@prisma/client';
/** Serialize compatibility-projection publishers; retry only rolled-back serialization failures. */
export async function publicationTransaction<T>(client:PrismaClient,work:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T> {
  for(let attempt=0;;attempt++) {
    try {
      return await client.$transaction(async tx=>{
        // A shared row is needed while both sources publish global compatibility tables.
        // PostgreSQL locks it until commit; SQLite already serializes writers.
        await tx.routeConfig.upsert({where:{key:'transport-publication-lock'},create:{key:'transport-publication-lock',value:'1',description:'Internal publication mutex'},update:{value:'1'}});
        return work(tx);
      },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:300000,maxWait:10000});
    }catch(error){
      if(attempt>=2||!error||typeof error!=='object'||!('code' in error)||error.code!=='P2034')throw error;
    }
  }
}
