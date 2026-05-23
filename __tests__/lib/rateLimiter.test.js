import { checkMinuteLimit, checkDailyLimit, checkSessionLimit } from '../../lib/rateLimiter.js';

// Tests run without Redis env vars → exercises the in-memory fallback path

describe('checkMinuteLimit (in-memory fallback)', () => {
  test('allows first request', async () => {
    const result = await checkMinuteLimit('test-ip-rl-first');
    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(9);
  });

  test('remaining decrements on each call', async () => {
    const ip = 'test-ip-rl-decrement';
    const r1 = await checkMinuteLimit(ip);
    const r2 = await checkMinuteLimit(ip);
    expect(r2.remaining).toBe(r1.remaining - 1);
  });

  test('blocks after 10 requests', async () => {
    const ip = 'test-ip-rl-block';
    for (let i = 0; i < 10; i++) {
      await checkMinuteLimit(ip);
    }
    const result = await checkMinuteLimit(ip);
    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
  });

  test('resetSeconds is positive and within 60s window', async () => {
    const result = await checkMinuteLimit('test-ip-rl-reset');
    expect(result.resetSeconds).toBeGreaterThan(0);
    expect(result.resetSeconds).toBeLessThanOrEqual(60);
  });
});

describe('checkDailyLimit (in-memory fallback)', () => {
  test('allows first request', async () => {
    const result = await checkDailyLimit('test-ip-dl-first');
    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(49);
  });

  test('blocks after 50 requests', async () => {
    const ip = 'test-ip-dl-block';
    for (let i = 0; i < 50; i++) {
      await checkDailyLimit(ip);
    }
    const result = await checkDailyLimit(ip);
    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
  });
});

describe('checkSessionLimit (in-memory fallback)', () => {
  const SESSION_LIMIT = parseInt(process.env.SESSION_QUESTION_LIMIT || '30', 10);

  test('returns ok=true when sessionId is null', async () => {
    const result = await checkSessionLimit(null);
    expect(result.ok).toBe(true);
  });

  test('allows first request for a session', async () => {
    const result = await checkSessionLimit('test-session-sl-first');
    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(SESSION_LIMIT - 1);
  });

  test('remaining decrements on each call', async () => {
    const id = 'test-session-sl-decrement';
    const r1 = await checkSessionLimit(id);
    const r2 = await checkSessionLimit(id);
    expect(r2.remaining).toBe(r1.remaining - 1);
  });

  test('blocks after SESSION_QUESTION_LIMIT requests', async () => {
    const id = 'test-session-sl-block';
    for (let i = 0; i < SESSION_LIMIT; i++) {
      await checkSessionLimit(id);
    }
    const result = await checkSessionLimit(id);
    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
  });
});
