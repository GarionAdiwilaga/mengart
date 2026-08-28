import { Redis } from "ioredis";

// In-memory sliding window cache for development and test environments
interface MemoryRateLimitRecord {
  timestamps: number[];
}

const memoryStore = new Map<string, MemoryRateLimitRecord>();

let redisClient: Redis | null = null;

function getRedisClient(): Redis | null {
  if (process.env.NODE_ENV === "test") return null;

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
        throw new Error("Production environment requires an active Redis instance for rate limiting.");
      }
    }
  }

  return redisClient;
}

export interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

/**
 * Enforces a sliding-window rate limit against a given key.
 * In production: Enforces Redis sliding-window algorithm.
 * In dev/test: Uses in-memory sliding-window timestamps.
 */
export async function checkRateLimit(
  key: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const { limit, windowSeconds } = options;
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = now - windowMs;

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
      if (process.env.NODE_ENV === "production") {
        console.error("Redis rate limit query error:", err);
        throw err;
      }
    }
  }

  // Memory fallback for dev and tests
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
