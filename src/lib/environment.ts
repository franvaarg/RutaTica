import { sqliteUrl } from './storage/sqlite';
/** Provider must match the generated client. SQLite remains the application default. */
export function databaseUrl(value: string | undefined, root = process.cwd(), provider: 'sqlite' | 'postgresql' = 'sqlite'): string | undefined {
  if (!value) return undefined;
  if(provider==='sqlite') return sqliteUrl(value,root);
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Invalid PostgreSQL URL'); }
  if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||!url.pathname.slice(1)) throw new Error('Invalid PostgreSQL URL');
  return value;
}

/** Staging tools require an explicit exported URL; never fall back to SQLite/.env. */
export function postgresqlStagingUrl(value: string | undefined): string {
  if (!value) throw new Error('Export DATABASE_URL for the PostgreSQL staging database');
  const url = new URL(databaseUrl(value, undefined, 'postgresql')!);
  if (['schema', 'sslmode'].some(key => url.searchParams.getAll(key).length > 1)) {
    throw new Error('Duplicate PostgreSQL schema or TLS options');
  }
  if (url.hash || (url.searchParams.get('schema') || 'public') !== 'public') {
    throw new Error('PostgreSQL staging requires the public schema and no URL fragment');
  }
  if (url.hostname.toLowerCase().endsWith('.neon.tech') && !['require', 'verify-full'].includes(url.searchParams.get('sslmode') || '')) {
    throw new Error('Neon staging requires sslmode=require or sslmode=verify-full');
  }
  // Bound this one-shot diagnostic client's pool and wait time, not application settings.
  url.searchParams.set('connection_limit', '1');
  url.searchParams.set('connect_timeout', '10');
  url.searchParams.set('pool_timeout', '10');
  return url.toString();
}
