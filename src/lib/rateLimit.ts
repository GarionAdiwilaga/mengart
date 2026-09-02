import { Redis } from "ioredis";

// In-memory sliding window cache for development and test environments
interface MemoryRateLimitRecord {
  timestamps: number[];
}

const memoryStore = new Map<string, MemoryRateLimitRecord>();

let redisClient: Redis | null = null;
let testRedisAvailable: boolean = true;

/**
 * Test fixture hook to simulate Redis availability in testing
 */
export function _setTestRedisAvailable(available: boolean) {
  testRedisAvailable = available;
}

/**
 * Clear in-memory rate limit store (for testing)
 */
export function _clearMemoryRateLimitStore() {
  memoryStore.clear();
}

function getRedisClient(): Redis | null {
  if (process.env.NODE_ENV === "test") {
    if (!testRedisAvailable) return null;
    return null; // By default tests use memoryStore unless explicitly mocked
  }

  if (!redisClient && process.env.REDIS_URL) {
    try {
      redisClient = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 2,
        lazyConnect: true,
      });
      redisClient.connect().catch((err) => {
        if (process.env.NODE_ENV === "production") {
          console.error("FATAL: Redis connection failed in production rate limiter:", err);
        }
      });
    } catch (e) {
      if (process.env.NODE_ENV === "production") {
        console.error("Production Redis initialization error:", e);
      }
    }
  }

  return redisClient;
}

export interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
  criticality?: "fail_closed" | "fail_open";
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

/**
 * Extract client IP respecting process.env.TRUSTED_PROXY === "true"
 */
export function getClientIpFromHeaders(headerList: { get(name: string): string | null }): string {
  const isTrustedProxy = process.env.TRUSTED_PROXY === "true";
  if (isTrustedProxy) {
    const cfIp = headerList.get("cf-connecting-ip");
    if (cfIp) return cfIp.trim();
    const xForwardedFor = headerList.get("x-forwarded-for");
    if (xForwardedFor) return xForwardedFor.split(",")[0].trim();
    const xRealIp = headerList.get("x-real-ip");
    if (xRealIp) return xRealIp.trim();
  }
  return "127.0.0.1";
}

/**
 * Enforces a sliding-window rate limit against a given key.
 * In production: Enforces Redis sliding-window algorithm.
 * In dev/test: Uses in-memory sliding-window timestamps.
 * Tiered degradation:
 * - fail_closed: Rejects on Redis outage in production (security-critical).
 * - fail_open: Logs warning and allows on Redis outage in production (low-risk).
 */
export async function checkRateLimit(
  key: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const { limit, windowSeconds, criticality = "fail_closed" } = options;
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = now - windowMs;

  const isTestOutageSimulated = !testRedisAvailable;
  const isProd = process.env.NODE_ENV === "production";

  if (isTestOutageSimulated || isProd) {
    const redis = getRedisClient();

    if (redis && redis.status === "ready") {
      const redisKey = `ratelimit:${key}`;
      try {
        const multi = redis.multi();
        multi.zremrangebyscore(redisKey, 0, windowStart);
        multi.zadd(redisKey, now, `${now}-${Math.random()}`);
        multi.zcard(redisKey);
        multi.expire(redisKey, windowSeconds + 1);

        const results = await multi.exec();
        if (results && results[2]) {
          const count = results[2][1] as number;
          const success = count <= limit;
          return {
            success,
            limit,
            remaining: Math.max(0, limit - count),
            resetSeconds: windowSeconds,
          };
        }
      } catch (err) {
        if (criticality === "fail_open") {
          console.warn(
            `[RATE_LIMIT_DEGRADED] Redis query failed for key '${key}'. Operating in degraded fail-open mode. Error:`,
            err
          );
          return {
            success: true,
            limit,
            remaining: 1,
            resetSeconds: windowSeconds,
          };
        }
        console.error(`[RATE_LIMIT_CRITICAL_OUTAGE] Redis query failed for security-critical key '${key}':`, err);
        throw new Error("Layanan pembatasan laju tidak tersedia. Permintaan ditolak demi keamanan sistem.");
      }
    } else {
      // Redis is not ready / unavailable
      if (criticality === "fail_open") {
        console.warn(
          `[RATE_LIMIT_DEGRADED] Redis connection unavailable for key '${key}'. Operating in degraded fail-open mode.`
        );
        return {
          success: true,
          limit,
          remaining: 1,
          resetSeconds: windowSeconds,
        };
      }
      console.error(`[RATE_LIMIT_CRITICAL_OUTAGE] Redis connection unavailable for security-critical key '${key}'. Rejecting fail-closed.`);
      throw new Error(
        "Layanan pembatasan laju tidak tersedia (Redis offline). Permintaan ditolak demi keamanan sistem."
      );
    }
  }

  // Memory fallback for dev and standard test runs
  let record = memoryStore.get(key);
  if (!record) {
    record = { timestamps: [] };
    memoryStore.set(key, record);
  }

  // Prune timestamps older than window
  record.timestamps = record.timestamps.filter((ts) => ts > windowStart);
  record.timestamps.push(now);

  const currentCount = record.timestamps.length;
  const success = currentCount <= limit;

  return {
    success,
    limit,
    remaining: Math.max(0, limit - currentCount),
    resetSeconds: windowSeconds,
  };
}
