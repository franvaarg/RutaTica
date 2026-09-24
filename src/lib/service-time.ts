export function serviceSeconds(v: string | undefined): number | null {
  if (!v) return null;
  if (!/^\d{1,3}:[0-5]\d:[0-5]\d$/.test(v)) return NaN;
  return v.split(':').reduce((n, p) => n * 60 + Number(p), 0);
}
