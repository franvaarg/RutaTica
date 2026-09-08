import path from 'node:path';

/** Resolve SQLite exactly as Prisma's schema-relative file URL convention. */
export function databaseUrl(value: string | undefined, root = process.cwd()): string | undefined {
  // Prisma reports missing DATABASE_URL when a query is attempted; imports/build remain possible.
  if (!value) return undefined;
  if (!value.startsWith('file:') || !value.slice(5).trim() || /[?#\u0000]/.test(value)) {
    throw new Error('DATABASE_URL must be a SQLite file URL');
  }
  return `file:${path.resolve(root, 'prisma', value.slice(5))}`;
}
