import "server-only";
import { redis, redisAvailable } from "./redis";

export interface FeatureCacheStats {
  hits: number;
  misses: number;
  databaseFallbacks: number;
  requests: number;
  totalLatencyMs: number;
  totalPayloadBytes: number;
}

const stats = new Map<string, FeatureCacheStats>();
const OBS_FEATURES_KEY = "obs:cache:features";
const OBS_TTL_SECONDS = 2 * 24 * 60 * 60;
const REDIS_METRICS_ENABLED = process.env.CACHE_METRICS_REDIS_ENABLED === "true";
const RESOURCE_METRICS_ENABLED = process.env.RESOURCE_METRICS_ENABLED === "true" || process.env.NODE_ENV !== "production";

function getFeatureStats(feature: string): FeatureCacheStats {
  let current = stats.get(feature);
  if (!current) {
    current = {
      hits: 0,
      misses: 0,
      databaseFallbacks: 0,
      requests: 0,
      totalLatencyMs: 0,
      totalPayloadBytes: 0,
    };
    stats.set(feature, current);
  }
  return current;
}

export function approximatePayloadBytes(payload: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(payload), "utf8");
  } catch {
    return 0;
  }
}

export function recordCacheFeatureMetric(
  feature: string,
  metric: {
    cacheHit?: boolean;
    databaseFallback?: boolean;
    latencyMs?: number;
    payloadBytes?: number;
  },
): void {
  // Metrics are development/staging instrumentation. Do not turn every cache
  // operation into a production log or persistence write unless explicitly
  // enabled.
  if (!RESOURCE_METRICS_ENABLED) return;
  const current = getFeatureStats(feature);
  current.requests += 1;
  if (metric.cacheHit === true) current.hits += 1;
  if (metric.cacheHit === false) current.misses += 1;
  if (metric.databaseFallback) current.databaseFallbacks += 1;
  if (typeof metric.latencyMs === "number") {
    current.totalLatencyMs += Math.max(0, metric.latencyMs);
  }
  if (typeof metric.payloadBytes === "number") {
    current.totalPayloadBytes += Math.max(0, metric.payloadBytes);
  }

  console.info(
    JSON.stringify({
      event: "cache_feature_metric",
      feature,
      cacheHit: metric.cacheHit,
      databaseFallback: metric.databaseFallback === true,
      latencyMs: metric.latencyMs,
      payloadBytes: metric.payloadBytes,
      ts: new Date().toISOString(),
    }),
  );

  if (REDIS_METRICS_ENABLED) {
    persistCacheFeatureMetric(feature, metric).catch((error) => {
      console.error("cache metric persistence failed", error);
    });
  }
}

export function getCacheFeatureStats() {
  return Object.fromEntries(
    Array.from(stats.entries()).map(([feature, value]) => [
      feature,
      {
        ...value,
        avgLatencyMs:
          value.requests > 0 ? value.totalLatencyMs / value.requests : 0,
        avgPayloadBytes:
          value.requests > 0 ? value.totalPayloadBytes / value.requests : 0,
      },
    ]),
  );
}

function minuteBucket(date = new Date()): string {
  return date.toISOString().slice(0, 16);
}

function recentMinuteBuckets(minutes: number): string[] {
  const buckets: string[] = [];
  const now = Date.now();
  for (let index = 0; index < minutes; index += 1) {
    buckets.push(minuteBucket(new Date(now - index * 60_000)));
  }
  return buckets;
}

async function incrementMetric(key: string, value: number): Promise<void> {
  const increment = Math.max(0, Math.round(value));
  if (increment <= 0) return;
  await redis.incrementWithExpiry(
    key,
    increment,
    OBS_TTL_SECONDS * 1000,
    true,
  );
}

async function persistCacheFeatureMetric(
  feature: string,
  metric: {
    cacheHit?: boolean;
    databaseFallback?: boolean;
    latencyMs?: number;
    payloadBytes?: number;
  },
): Promise<void> {
  if (!redisAvailable || !REDIS_METRICS_ENABLED) return;

  const bucket = minuteBucket();
  const base = `obs:cache:${bucket}:${feature}`;
  await redis.sadd(OBS_FEATURES_KEY, feature);
  await redis.expire(OBS_FEATURES_KEY, OBS_TTL_SECONDS);
  await Promise.all([
    incrementMetric(`${base}:requests`, 1),
    metric.cacheHit === true ? incrementMetric(`${base}:hits`, 1) : undefined,
    metric.cacheHit === false ? incrementMetric(`${base}:misses`, 1) : undefined,
    metric.databaseFallback
      ? incrementMetric(`${base}:databaseFallbacks`, 1)
      : undefined,
    typeof metric.latencyMs === "number"
      ? incrementMetric(`${base}:latencyMs`, metric.latencyMs)
      : undefined,
    typeof metric.payloadBytes === "number"
      ? incrementMetric(`${base}:payloadBytes`, metric.payloadBytes)
      : undefined,
  ]);
}

async function readNumber(key: string): Promise<number> {
  const value = await redis.get<string | number>(key);
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function getPersistentCacheFeatureStats(minutes = 15) {
  if (!redisAvailable || !REDIS_METRICS_ENABLED) return {};

  const features = await redis.smembers(OBS_FEATURES_KEY);
  const buckets = recentMinuteBuckets(Math.max(1, Math.min(240, minutes)));
  const output: Record<string, FeatureCacheStats & {
    avgLatencyMs: number;
    avgPayloadBytes: number;
  }> = {};

  await Promise.all(
    features.map(async (feature) => {
      const aggregate: FeatureCacheStats = {
        hits: 0,
        misses: 0,
        databaseFallbacks: 0,
        requests: 0,
        totalLatencyMs: 0,
        totalPayloadBytes: 0,
      };

      await Promise.all(
        buckets.map(async (bucket) => {
          const base = `obs:cache:${bucket}:${feature}`;
          const [
            requests,
            hits,
            misses,
            databaseFallbacks,
            totalLatencyMs,
            totalPayloadBytes,
          ] = await Promise.all([
            readNumber(`${base}:requests`),
            readNumber(`${base}:hits`),
            readNumber(`${base}:misses`),
            readNumber(`${base}:databaseFallbacks`),
            readNumber(`${base}:latencyMs`),
            readNumber(`${base}:payloadBytes`),
          ]);

          aggregate.requests += requests;
          aggregate.hits += hits;
          aggregate.misses += misses;
          aggregate.databaseFallbacks += databaseFallbacks;
          aggregate.totalLatencyMs += totalLatencyMs;
          aggregate.totalPayloadBytes += totalPayloadBytes;
        }),
      );

      output[feature] = {
        ...aggregate,
        avgLatencyMs:
          aggregate.requests > 0
            ? aggregate.totalLatencyMs / aggregate.requests
            : 0,
        avgPayloadBytes:
          aggregate.requests > 0
            ? aggregate.totalPayloadBytes / aggregate.requests
            : 0,
      };
    }),
  );

  return output;
}
