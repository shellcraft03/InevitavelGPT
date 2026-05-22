import {
  intFromEnv,
  sanitizeQuestion,
  cleanRetrievalQuery,
  normalizeText,
  parseRankedIds,
  getIp,
} from '../../lib/chat-utils.js';

describe('sanitizeQuestion', () => {
  test('removes control characters', () => {
    expect(sanitizeQuestion('hello\x01world')).toBe('helloworld');
    expect(sanitizeQuestion('text\x7Fend')).toBe('textend');
  });

  test('normalizes NFKC (fullwidth chars)', () => {
    expect(sanitizeQuestion('ＡＢＣ')).toBe('ABC');
  });

  test('limits to 1000 characters', () => {
    const long = 'a'.repeat(1500);
    expect(sanitizeQuestion(long)).toHaveLength(1000);
  });

  test('collapses 3+ newlines to double newline', () => {
    expect(sanitizeQuestion('a\n\n\n\nb')).toBe('a\n\nb');
  });

  test('removes illegal characters like < > { }', () => {
    expect(sanitizeQuestion('hello<world>{test}')).toBe('helloworldtest');
  });

  test('keeps valid punctuation and accented letters', () => {
    const input = 'Qual é a proposta? Saúde, educação — 100%';
    const result = sanitizeQuestion(input);
    expect(result).toContain('Qual');
    expect(result).toContain('proposta');
    expect(result).toContain('100%');
    expect(result).toContain('é');
    expect(result).toContain('ú');
  });

  test('trims leading and trailing whitespace', () => {
    expect(sanitizeQuestion('  olá  ')).toBe('olá');
  });
});

describe('cleanRetrievalQuery', () => {
  test('removes curly braces, brackets and quotes (colon preserved)', () => {
    expect(cleanRetrievalQuery('{"key": ["val"]}')).toBe('key : val');
  });

  test('collapses multiple spaces', () => {
    expect(cleanRetrievalQuery('a   b   c')).toBe('a b c');
  });

  test('removes control characters', () => {
    expect(cleanRetrievalQuery('text\x01end')).toBe('textend');
  });

  test('limits to 1200 characters', () => {
    const long = 'a'.repeat(1500);
    expect(cleanRetrievalQuery(long)).toHaveLength(1200);
  });

  test('handles null/undefined', () => {
    expect(cleanRetrievalQuery(null)).toBe('');
    expect(cleanRetrievalQuery(undefined)).toBe('');
  });
});

describe('normalizeText', () => {
  test('strips accents', () => {
    expect(normalizeText('café')).toBe('cafe');
    expect(normalizeText('São Paulo')).toBe('sao paulo');
    expect(normalizeText('educação')).toBe('educacao');
    expect(normalizeText('coração')).toBe('coracao');
  });

  test('lowercases', () => {
    expect(normalizeText('HELLO')).toBe('hello');
  });

  test('handles null and undefined', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });

  test('handles number input', () => {
    expect(normalizeText(42)).toBe('42');
  });
});

describe('intFromEnv', () => {
  afterEach(() => { delete process.env.TEST_INT_VAR; });

  test('returns valid integer from env', () => {
    process.env.TEST_INT_VAR = '25';
    expect(intFromEnv('TEST_INT_VAR', 10, 0, 100)).toBe(25);
  });

  test('returns fallback when env var is missing', () => {
    expect(intFromEnv('TEST_INT_VAR', 42, 0, 100)).toBe(42);
  });

  test('returns fallback for non-numeric value', () => {
    process.env.TEST_INT_VAR = 'abc';
    expect(intFromEnv('TEST_INT_VAR', 42, 0, 100)).toBe(42);
  });

  test('clamps to min', () => {
    process.env.TEST_INT_VAR = '-5';
    expect(intFromEnv('TEST_INT_VAR', 10, 0, 100)).toBe(0);
  });

  test('clamps to max', () => {
    process.env.TEST_INT_VAR = '200';
    expect(intFromEnv('TEST_INT_VAR', 10, 0, 100)).toBe(100);
  });
});

describe('parseRankedIds', () => {
  test('plain JSON array of strings', () => {
    expect(parseRankedIds('["1","2","3"]')).toEqual(['1', '2', '3']);
  });

  test('converts numbers to strings', () => {
    expect(parseRankedIds('[1, 2, 3]')).toEqual(['1', '2', '3']);
  });

  test('accepts {ids: [...]} wrapper', () => {
    expect(parseRankedIds('{"ids": ["a","b"]}')).toEqual(['a', 'b']);
  });

  test('extracts array embedded in markdown text', () => {
    expect(parseRankedIds('Here are the ids: ["x","y"] done')).toEqual(['x', 'y']);
  });

  test('returns empty array for null/undefined', () => {
    expect(parseRankedIds(null)).toEqual([]);
    expect(parseRankedIds(undefined)).toEqual([]);
    expect(parseRankedIds('')).toEqual([]);
  });

  test('returns empty array for invalid JSON', () => {
    expect(parseRankedIds('{invalid}')).toEqual([]);
  });
});

describe('getIp', () => {
  test('returns first IP from X-Forwarded-For', () => {
    expect(getIp({ headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } })).toBe('1.2.3.4');
  });

  test('returns single IP from X-Forwarded-For', () => {
    expect(getIp({ headers: { 'x-forwarded-for': '9.9.9.9' } })).toBe('9.9.9.9');
  });

  test('falls back to X-Real-IP', () => {
    expect(getIp({ headers: { 'x-real-ip': '4.3.2.1' } })).toBe('4.3.2.1');
  });

  test('returns unknown for loopback ::1', () => {
    expect(getIp({ headers: { 'x-forwarded-for': '::1' } })).toBe('unknown');
  });

  test('returns unknown for loopback 127.0.0.1', () => {
    expect(getIp({ headers: { 'x-forwarded-for': '127.0.0.1' } })).toBe('unknown');
  });

  test('returns unknown when no IP headers are present', () => {
    expect(getIp({ headers: {} })).toBe('unknown');
  });
});
