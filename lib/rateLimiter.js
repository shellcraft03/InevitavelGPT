import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

let minuteLimit = null;
let dailyLimit = null;
const hasRedisConfig = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

if (hasRedisConfig) {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  minuteLimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '60 s'),
    analytics: true,
    prefix: 'rl:minute',
  });

  dailyLimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(50, '1 d'),
    analytics: true,
    prefix: 'rl:daily',
  });
}

// In-memory fallback for local dev without Redis
const stores = new Map();

function inMemoryCheck(key, max, durationMs) {
  const now = Date.now();
  const entry = stores.get(key) || { count: 0, reset: now + durationMs };
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + durationMs;
  }
  entry.count += 1;
  stores.set(key, entry);
  return {
    ok: entry.count <= max,
    remaining: Math.max(0, max - entry.count),
    resetSeconds: Math.ceil((entry.reset - now) / 1000),
  };
}

function ensureRateLimiterConfigured() {
  if (process.env.NODE_ENV === 'production' && !hasRedisConfig) {
    throw new Error('Upstash Redis is required for rate limiting in production');
  }
}

export async function checkMinuteLimit(ip) {
  ensureRateLimiterConfigured();
  if (!minuteLimit) return inMemoryCheck(`min:${ip}`, 10, 60_000);
  const { success, remaining, reset } = await minuteLimit.limit(ip);
  return { ok: success, remaining, resetSeconds: Math.ceil((reset - Date.now()) / 1000) };
}

export async function checkDailyLimit(ip) {
  ensureRateLimiterConfigured();
  if (!dailyLimit) return inMemoryCheck(`day:${ip}`, 50, 86_400_000);
  const { success, remaining, reset } = await dailyLimit.limit(ip);
  return { ok: success, remaining, resetSeconds: Math.ceil((reset - Date.now()) / 1000) };
}
