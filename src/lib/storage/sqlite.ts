/** SQLite-only development tooling. Never used to interpret PostgreSQL URLs. */
import path from 'node:path';
import { realpath } from 'node:fs/promises';
export function sqliteUrl(value: string, root = process.cwd()) {
  if (!value.startsWith('file:') || !value.slice(5).trim() || /[?#\u0000]/.test(value)) throw new Error('Invalid SQLite file URL');
  return `file:${path.resolve(root, 'prisma', value.slice(5))}`;
}
export async function localImportTarget(value: string | undefined) {
  if(!value) throw new Error('Explicit DATABASE_URL required');
  const url=sqliteUrl(value); const target=await realpath(url.slice(5));
  const protectedFile=await realpath(path.resolve('db/custom.db'));
  if(target===protectedFile) throw new Error('Repository snapshot is protected. Use an explicitly selected disposable copy.');
  return `file:${target}`;
}
