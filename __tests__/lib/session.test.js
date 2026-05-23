import { setHumanSessionCookie, hasValidHumanSession, getSessionId } from '../../lib/session.js';

const SECRET = 'test-secret-at-least-32-chars-long-xxx';

function issueSession() {
  const req = { headers: { host: 'localhost', cookie: '' } };
  let rawSetCookie = '';
  const res = { setHeader: (name, val) => { if (name === 'Set-Cookie') rawSetCookie = val; } };
  setHumanSessionCookie(req, res);
  return rawSetCookie.split(';')[0].trim(); // "ia_session=ENCODED_VALUE"
}

function reqWith(cookiePart) {
  return { headers: { host: 'localhost', cookie: cookiePart } };
}

describe('hasValidHumanSession', () => {
  beforeEach(() => { process.env.APP_SESSION_SECRET = SECRET; });
  afterEach(() => { delete process.env.APP_SESSION_SECRET; jest.restoreAllMocks(); });

  test('valid session is accepted', () => {
    expect(hasValidHumanSession(reqWith(issueSession()))).toBe(true);
  });

  test('no cookie header returns false', () => {
    expect(hasValidHumanSession({ headers: {} })).toBe(false);
  });

  test('missing APP_SESSION_SECRET returns false', () => {
    delete process.env.APP_SESSION_SECRET;
    expect(hasValidHumanSession(reqWith('ia_session=anything'))).toBe(false);
  });

  test('tampered signature is rejected', () => {
    const cookiePart = issueSession();
    const raw = decodeURIComponent(cookiePart.split('=')[1]);
    const [payload] = raw.split('.');
    // SHA-256 base64url is 43 chars — craft same-length invalid signature
    const fakeSignature = 'A'.repeat(43);
    const tampered = `${payload}.${fakeSignature}`;
    expect(hasValidHumanSession(reqWith(`ia_session=${encodeURIComponent(tampered)}`))).toBe(false);
  });

  test('expired session is rejected', () => {
    jest.spyOn(Date, 'now').mockReturnValue(0); // exp = 3600 seconds from epoch
    const cookiePart = issueSession();
    jest.restoreAllMocks(); // restore Date.now before validation
    expect(hasValidHumanSession(reqWith(cookiePart))).toBe(false);
  });

  test('cookie signed with different secret is rejected', () => {
    const cookiePart = issueSession(); // signed with SECRET
    process.env.APP_SESSION_SECRET = 'different-secret-xxxxxxxxxxxxxxxxxxxxx';
    expect(hasValidHumanSession(reqWith(cookiePart))).toBe(false);
  });

  test('cookie without dot separator is rejected', () => {
    expect(hasValidHumanSession(reqWith('ia_session=nodot'))).toBe(false);
  });

  test('empty cookie value is rejected', () => {
    expect(hasValidHumanSession(reqWith('ia_session='))).toBe(false);
  });
});

describe('getSessionId', () => {
  beforeEach(() => { process.env.APP_SESSION_SECRET = SECRET; });
  afterEach(() => { delete process.env.APP_SESSION_SECRET; });

  test('returns a 32-char hex string for a valid session', () => {
    const id = getSessionId(reqWith(issueSession()));
    expect(typeof id).toBe('string');
    expect(id).toHaveLength(32);
    expect(id).toMatch(/^[0-9a-f]+$/);
  });

  test('returns null when no cookie is present', () => {
    expect(getSessionId({ headers: {} })).toBeNull();
  });

  test('returns the same id for the same cookie', () => {
    const cookie = issueSession();
    expect(getSessionId(reqWith(cookie))).toBe(getSessionId(reqWith(cookie)));
  });
});

describe('setHumanSessionCookie', () => {
  afterEach(() => { delete process.env.APP_SESSION_SECRET; });

  test('throws when APP_SESSION_SECRET is missing', () => {
    delete process.env.APP_SESSION_SECRET;
    const req = { headers: { host: 'localhost', cookie: '' } };
    const res = { setHeader: jest.fn() };
    expect(() => setHumanSessionCookie(req, res)).toThrow('Missing env var: APP_SESSION_SECRET');
  });

  test('sets HttpOnly SameSite cookie', () => {
    process.env.APP_SESSION_SECRET = SECRET;
    const req = { headers: { host: 'localhost', cookie: '' } };
    let header = '';
    const res = { setHeader: (name, val) => { if (name === 'Set-Cookie') header = val; } };
    setHumanSessionCookie(req, res);
    expect(header).toMatch(/HttpOnly/);
    expect(header).toMatch(/SameSite=Strict/);
    expect(header).not.toMatch(/Secure/);
  });

  test('sets Secure flag for non-localhost host with https', () => {
    process.env.APP_SESSION_SECRET = SECRET;
    const req = { headers: { host: 'www.inevitavelgpt.com', 'x-forwarded-proto': 'https', cookie: '' } };
    let header = '';
    const res = { setHeader: (name, val) => { if (name === 'Set-Cookie') header = val; } };
    setHumanSessionCookie(req, res);
    expect(header).toMatch(/Secure/);
  });
});
