/**
 * IP block list (§2.8) backed by Redis for low-latency checks.
 *
 * Uses a Redis SET `ip:blocked`. Edge middleware also reads this set so
 * blocked IPs never even hit the app route handlers.
 */
import "server-only";
import { redis, requireRedisAvailable } from "./redis";

const BLOCK_KEY = "ip:blocked";
const BLOCK_CACHE_TTL_MS = 10_000;
const blockCache = new Map<string, { blocked: boolean; expiresAt: number }>();

export function getClientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return null;
}

export async function isIpBlocked(ip: string | null | undefined): Promise<boolean> {
  if (!ip) return false;
  const cached = blockCache.get(ip);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.blocked;
  }

  requireRedisAvailable("IP blocklist checks");
  const blocked = (await redis.sismember(BLOCK_KEY, ip)) === 1;
  blockCache.set(ip, { blocked, expiresAt: Date.now() + BLOCK_CACHE_TTL_MS });
  return blocked;
}

export async function blockIp(ip: string, reason: string | undefined): Promise<void> {
  requireRedisAvailable("IP blocklist writes");
  await redis.sadd(BLOCK_KEY, ip);
  blockCache.set(ip, { blocked: true, expiresAt: Date.now() + BLOCK_CACHE_TTL_MS });
  // Audit trail in Postgres handled separately by the callers (admin API).
  void reason;
}

export async function unblockIp(ip: string): Promise<void> {
  requireRedisAvailable("IP blocklist writes");
  await redis.srem(BLOCK_KEY, ip);
  blockCache.set(ip, { blocked: false, expiresAt: Date.now() + BLOCK_CACHE_TTL_MS });
}

export async function listBlockedIps(): Promise<string[]> {
  requireRedisAvailable("IP blocklist reads");
  return redis.smembers(BLOCK_KEY);
}
