/**
 * Simple in-memory sliding-window limiter. Used for anonymous traffic only:
 * on serverless platforms each instance has its own memory, so per-user limits
 * for signed-in users are enforced in the database instead (see rate-limit.ts).
 */
const buckets = new Map<string, number[]>();

export function memoryRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
  }
  return true;
}
