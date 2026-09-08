import { databaseUrl } from './environment'
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: databaseUrl(process.env.DATABASE_URL),
    log: ['error', 'warn'],
  })

globalForPrisma.prisma = db

// Exportar tipos para usarlos en las rutas
export type { PrismaClient } from '@prisma/client'
