import { verifyTurnstile } from '../../lib/turnstile.js';

const TOKEN = 'valid-token';
const SECRET = 'turnstile-secret';

function mockFetchWith(body) {
  global.fetch = jest.fn().mockResolvedValue({
    json: () => Promise.resolve(body),
  });
}

describe('verifyTurnstile', () => {
  beforeEach(() => {
    process.env.TURNSTILE_SECRET = SECRET;
    delete process.env.TURNSTILE_ACTION;
    delete process.env.TURNSTILE_ALLOWED_HOSTNAMES;
  });

  afterEach(() => {
    delete process.env.TURNSTILE_SECRET;
    delete process.env.TURNSTILE_ACTION;
    delete process.env.TURNSTILE_ALLOWED_HOSTNAMES;
    jest.restoreAllMocks();
  });

  test('missing TURNSTILE_SECRET returns missing_secret', async () => {
    delete process.env.TURNSTILE_SECRET;
    const result = await verifyTurnstile(TOKEN);
    expect(result).toEqual({ ok: false, reason: 'missing_secret' });
  });

  test('null token returns missing_token', async () => {
    const result = await verifyTurnstile(null);
    expect(result).toEqual({ ok: false, reason: 'missing_token' });
  });

  test('empty string token returns missing_token', async () => {
    const result = await verifyTurnstile('');
    expect(result).toEqual({ ok: false, reason: 'missing_token' });
  });

  test('successful verification with no action or hostname check', async () => {
    mockFetchWith({ success: true, action: 'chat', hostname: 'example.com' });
    const result = await verifyTurnstile(TOKEN, { action: false });
    expect(result).toMatchObject({ ok: true });
  });

  test('challenge_failed', async () => {
    mockFetchWith({ success: false, 'error-codes': ['invalid-input-response'] });
    const result = await verifyTurnstile(TOKEN, { action: false });
    expect(result).toMatchObject({ ok: false, reason: 'challenge_failed' });
  });

  test('action mismatch via TURNSTILE_ACTION env var', async () => {
    process.env.TURNSTILE_ACTION = 'chat';
    mockFetchWith({ success: true, action: 'other', hostname: 'example.com' });
    const result = await verifyTurnstile(TOKEN);
    expect(result).toMatchObject({ ok: false, reason: 'action_mismatch' });
  });

  test('action=false skips action check entirely', async () => {
    process.env.TURNSTILE_ACTION = 'chat';
    mockFetchWith({ success: true, action: 'anything', hostname: 'example.com' });
    const result = await verifyTurnstile(TOKEN, { action: false });
    expect(result).toMatchObject({ ok: true });
  });

  test('hostname mismatch when TURNSTILE_ALLOWED_HOSTNAMES is set', async () => {
    process.env.TURNSTILE_ALLOWED_HOSTNAMES = 'allowed.com';
    mockFetchWith({ success: true, action: 'chat', hostname: 'evil.com' });
    const result = await verifyTurnstile(TOKEN, { action: false });
    expect(result).toMatchObject({ ok: false, reason: 'hostname_mismatch' });
  });

  test('hostname accepted when it matches TURNSTILE_ALLOWED_HOSTNAMES', async () => {
    process.env.TURNSTILE_ALLOWED_HOSTNAMES = 'allowed.com,other.com';
    mockFetchWith({ success: true, action: 'chat', hostname: 'other.com' });
    const result = await verifyTurnstile(TOKEN, { action: false });
    expect(result).toMatchObject({ ok: true });
  });

  test('network timeout returns network_timeout', async () => {
    const err = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    global.fetch = jest.fn().mockRejectedValue(err);
    const result = await verifyTurnstile(TOKEN, { action: false });
    expect(result).toMatchObject({ ok: false, reason: 'network_timeout' });
  });

  test('generic network error returns network_error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('fetch failed'));
    const result = await verifyTurnstile(TOKEN, { action: false });
    expect(result).toMatchObject({ ok: false, reason: 'network_error' });
  });
});
