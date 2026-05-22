import { buildTopicTerms, lexicalRank, llmRerankChunks, setupSse } from '../../lib/rag.js';

const EXPANSIONS = [
  { pattern: /\bsaude\b/i, terms: 'saude sus hospitais medicos' },
  { pattern: /\beduca[cç][aã]o\b/i, terms: 'educacao escola professores' },
];
const STOPWORDS = new Set(['de', 'da', 'do', 'o', 'a', 'os', 'as', 'que', 'como']);

describe('buildTopicTerms', () => {
  it('extracts terms from question', () => {
    const terms = buildTopicTerms('como funciona o sistema de saude', EXPANSIONS, STOPWORDS);
    expect(terms).toContain('funciona');
    expect(terms).toContain('sistema');
    expect(terms).toContain('saude');
    expect(terms).not.toContain('como');
    expect(terms).not.toContain('o');
  });

  it('expands terms matching a pattern', () => {
    const terms = buildTopicTerms('saude publica', EXPANSIONS, STOPWORDS);
    expect(terms).toContain('hospitais');
    expect(terms).toContain('medicos');
  });

  it('does not expand when pattern does not match', () => {
    const terms = buildTopicTerms('economia fiscal', EXPANSIONS, STOPWORDS);
    expect(terms).not.toContain('hospitais');
  });

  it('returns empty array for stopword-only question', () => {
    const terms = buildTopicTerms('o que de como', EXPANSIONS, STOPWORDS);
    expect(terms).toEqual([]);
  });

  it('handles empty string', () => {
    expect(buildTopicTerms('', EXPANSIONS, STOPWORDS)).toEqual([]);
  });

  it('deduplicates expanded terms', () => {
    const terms = buildTopicTerms('saude saude', EXPANSIONS, STOPWORDS);
    const counts = terms.filter(t => t === 'saude');
    expect(counts.length).toBe(1);
  });
});

describe('lexicalRank', () => {
  const matches = [
    { id: '1', score: 0.8, text: 'tópico de educação nas escolas', meta: { title: 'Educação' } },
    { id: '2', score: 0.9, text: 'política de saúde pública', meta: { title: 'Saúde' } },
    { id: '3', score: 0.7, text: 'texto sem relação alguma com o tema', meta: { title: '' } },
  ];

  it('boosts matches by lexical coverage', () => {
    const ranked = lexicalRank(matches, 'saude publica', EXPANSIONS, STOPWORDS);
    expect(ranked[0].id).toBe('2');
  });

  it('penalizes matches with zero lexical hits', () => {
    const ranked = lexicalRank(matches, 'saude publica', EXPANSIONS, STOPWORDS);
    const noHit = ranked.find(m => m.id === '3');
    expect(noHit.rerankScore).toBeLessThan(noHit.score);
  });

  it('preserves all matches', () => {
    const ranked = lexicalRank(matches, 'saude publica', EXPANSIONS, STOPWORDS);
    expect(ranked.length).toBe(matches.length);
  });

  it('attaches lexicalHits to each match', () => {
    const ranked = lexicalRank(matches, 'saude publica', EXPANSIONS, STOPWORDS);
    for (const m of ranked) {
      expect(typeof m.lexicalHits).toBe('number');
    }
  });

  it('uses custom buildHaystack when provided', () => {
    const ranked = lexicalRank(
      matches,
      'saude publica',
      EXPANSIONS,
      STOPWORDS,
      (m) => m.meta?.title || '',
    );
    const saudeMatch = ranked.find(m => m.id === '2');
    expect(saudeMatch.lexicalHits).toBeGreaterThan(0);
  });

  it('handles empty matches array', () => {
    expect(lexicalRank([], 'saude publica', EXPANSIONS, STOPWORDS)).toEqual([]);
  });
});

describe('llmRerankChunks', () => {
  const makeMatch = (id, score = 0.8) => ({ id, score, text: `text ${id}`, meta: {} });
  const buildItem = (m, i) => ({ id: m.id || String(i), text: m.text });
  const baseOpts = {
    model: 'gpt-4.1-nano',
    rerankCandidates: 10,
    finalChunks: 3,
    systemPrompt: 'Rerank.',
    buildItem,
    label: 'test',
  };

  it('returns pool directly when pool size <= finalChunks', async () => {
    const candidates = [makeMatch('a'), makeMatch('b')];
    const result = await llmRerankChunks(null, 'q', candidates, baseOpts);
    expect(result).toEqual(candidates);
  });

  it('returns top finalChunks on LLM success', async () => {
    const candidates = Array.from({ length: 6 }, (_, i) => makeMatch(String(i + 1)));
    const mockClient = {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{ message: { content: '["3","1","5"]' } }],
          }),
        },
      },
    };
    const result = await llmRerankChunks(mockClient, 'q', candidates, baseOpts);
    expect(result.map(m => m.id)).toEqual(['3', '1', '5']);
    expect(result.every(m => m.llmReranked)).toBe(true);
  });

  it('falls back to top-k on LLM empty response', async () => {
    const candidates = Array.from({ length: 6 }, (_, i) => makeMatch(String(i + 1)));
    const mockClient = {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{ message: { content: '[]' } }],
          }),
        },
      },
    };
    const result = await llmRerankChunks(mockClient, 'q', candidates, baseOpts);
    expect(result.length).toBe(3);
    expect(result[0].id).toBe('1');
  });

  it('falls back to top-k on LLM error', async () => {
    const candidates = Array.from({ length: 6 }, (_, i) => makeMatch(String(i + 1)));
    const mockClient = {
      chat: {
        completions: {
          create: jest.fn().mockRejectedValue(new Error('API error')),
        },
      },
    };
    const result = await llmRerankChunks(mockClient, 'q', candidates, baseOpts);
    expect(result.length).toBe(3);
  });

  it('fills remaining slots from pool when LLM returns fewer ids than finalChunks', async () => {
    const candidates = Array.from({ length: 6 }, (_, i) => makeMatch(String(i + 1)));
    const mockClient = {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{ message: { content: '["2"]' } }],
          }),
        },
      },
    };
    const result = await llmRerankChunks(mockClient, 'q', candidates, baseOpts);
    const ids = result.map(m => m.id);
    expect(result.length).toBe(3);
    expect(ids[0]).toBe('2');
    expect(ids.filter(id => id === '2').length).toBe(1);
  });
});

describe('setupSse', () => {
  it('sets correct headers and returns sendEvent function', () => {
    const headers = {};
    const written = [];
    const mockRes = {
      setHeader: (k, v) => { headers[k] = v; },
      socket: { setNoDelay: jest.fn() },
      flushHeaders: jest.fn(),
      write: (data) => written.push(data),
    };
    const sendEvent = setupSse(mockRes);
    expect(headers['Content-Type']).toBe('text/event-stream');
    expect(headers['Cache-Control']).toBe('no-cache, no-transform');
    expect(mockRes.flushHeaders).toHaveBeenCalled();
    sendEvent({ token: 'hello' });
    expect(written[0]).toBe('data: {"token":"hello"}\n\n');
  });
});
