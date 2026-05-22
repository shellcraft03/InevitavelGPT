import { queryEmbeddingInNamespace } from './vectorStore.js';
import { sanitizeQuestion, getIp, parseRankedIds, normalizeText } from './chat-utils.js';
import { hasValidHumanSession } from './session.js';
import { verifyTurnstile } from './turnstile.js';
import { checkMinuteLimit, checkDailyLimit, logBlock } from './rateLimiter.js';

export async function guardChatRequest(req, res, { turnstileAction, label, t0 }) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return null;
  }
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    res.status(415).json({ error: 'Unsupported media type' });
    return null;
  }
  const { question: rawQuestion, turnstileToken } = req.body || {};
  if (!rawQuestion) {
    res.status(400).json({ error: 'Missing question' });
    return null;
  }
  const question = sanitizeQuestion(rawQuestion);
  if (!question) {
    res.status(400).json({ error: 'Question is empty' });
    return null;
  }
  const ip = getIp(req);
  const sessionOk = hasValidHumanSession(req);
  const [okRes, rl, daily] = await Promise.all([
    sessionOk ? Promise.resolve({ ok: true }) : verifyTurnstile(turnstileToken, { ip, action: turnstileAction }),
    checkMinuteLimit(ip),
    checkDailyLimit(ip),
  ]);
  console.log(`[timing][${label}] auth=${Date.now() - t0}ms`);
  if (!okRes.ok) {
    console.warn(`[turnstile] failed ip=${ip} reason=${okRes.reason || 'unknown'}`);
    res.status(403).json({ error: 'Turnstile verification failed' });
    return null;
  }
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
  res.setHeader('X-RateLimit-Reset', String(rl.resetSeconds));
  if (!rl.ok) {
    console.warn(`[rate-limit] per-minute ip=${ip} remaining=${rl.remaining} reset=${rl.resetSeconds}s`);
    await logBlock(ip, 'minute');
    res.status(429).json({ error: 'Too many requests' });
    return null;
  }
  if (!daily.ok) {
    console.warn(`[rate-limit] daily ip=${ip} remaining=${daily.remaining} reset=${daily.resetSeconds}s`);
    await logBlock(ip, 'daily');
    res.status(429).json({ error: 'Daily limit reached' });
    return null;
  }
  return { question, ip };
}

export function buildTopicTerms(question, topicExpansions, stopwords) {
  const normalized = normalizeText(question);
  const terms = new Set(
    normalized
      .split(/[^a-z0-9]+/)
      .map(t => t.trim())
      .filter(t => t.length >= 4 && !stopwords.has(t))
  );
  for (const { pattern, terms: expandedTerms } of topicExpansions) {
    if (pattern.test(question)) {
      for (const term of normalizeText(expandedTerms).split(/\s+/)) {
        if (term.length >= 4) terms.add(term);
      }
    }
  }
  return [...terms];
}

export function lexicalRank(matches, question, topicExpansions, stopwords, buildHaystack) {
  const terms = buildTopicTerms(question, topicExpansions, stopwords);
  const getHaystack = buildHaystack || ((m) => `${m.meta?.title || ''} ${m.text || ''}`);
  return matches
    .map(match => {
      const haystack = normalizeText(getHaystack(match));
      const hits = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      const coverage = terms.length > 0 ? hits / terms.length : 0;
      const titleHits = terms.reduce((sum, term) => sum + (normalizeText(match.meta?.title).includes(term) ? 1 : 0), 0);
      const lexicalBoost = coverage * 0.12 + titleHits * 0.02;
      const lexicalPenalty = terms.length > 0 && hits === 0 ? 0.04 : 0;
      return {
        ...match,
        rerankScore: (match.score || 0) + lexicalBoost - lexicalPenalty,
        lexicalHits: hits,
      };
    })
    .sort((a, b) => b.rerankScore - a.rerankScore);
}

export async function llmRerankChunks(client, question, candidates, {
  model, rerankCandidates, finalChunks, systemPrompt, buildItem, label,
}) {
  const pool = candidates.slice(0, rerankCandidates);
  if (pool.length <= finalChunks) return pool;
  try {
    const items = pool.map((match, index) => buildItem(match, index));
    const completion = await client.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 80,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify({ question, candidates: items }) },
      ],
    });
    const rankedIds = parseRankedIds(completion.choices?.[0]?.message?.content);
    if (!rankedIds.length) return pool.slice(0, finalChunks);
    const byId = new Map(pool.map(match => [String(match.id), match]));
    const selected = [];
    const used = new Set();
    for (const id of rankedIds) {
      const match = byId.get(String(id));
      if (match && !used.has(match.id)) {
        selected.push({ ...match, llmReranked: true });
        used.add(match.id);
      }
      if (selected.length >= finalChunks) break;
    }
    for (const match of pool) {
      if (selected.length >= finalChunks) break;
      if (!used.has(match.id)) selected.push(match);
    }
    return selected;
  } catch (err) {
    console.warn(`[rag][${label}] rerank failed:`, err?.message || err);
    return pool.slice(0, finalChunks);
  }
}

export async function retrieveChunks(client, question, {
  namespace, embeddingModel, initialTopK, rerankCandidates, finalChunks,
  rerankModel, rerankSystemPrompt, buildRerankItem,
  rewriteQueryFn,
  topicExpansions, stopwords, buildHaystack,
  label,
}) {
  const tr0 = Date.now();
  const origEmbPromise = client.embeddings.create({ model: embeddingModel, input: [question] });
  const rewritePromise = rewriteQueryFn(question);

  const origEmbRes = await origEmbPromise;
  const origEmbedding = origEmbRes?.data?.[0]?.embedding;
  const origSearchPromise = origEmbedding
    ? queryEmbeddingInNamespace(origEmbedding, namespace, initialTopK)
    : Promise.resolve([]);
  console.log(`[timing][${label}] embed_orig+pinecone_start=${Date.now() - tr0}ms`);

  const focusedQuery = await rewritePromise;
  console.log(`[timing][${label}] rewrite=${Date.now() - tr0}ms`);

  let rewriteSearchPromise = Promise.resolve([]);
  if (focusedQuery && focusedQuery !== question) {
    const rewriteEmbRes = await client.embeddings.create({ model: embeddingModel, input: [focusedQuery] });
    console.log(`[timing][${label}] embed_rewrite=${Date.now() - tr0}ms`);
    const rewriteEmbedding = rewriteEmbRes?.data?.[0]?.embedding;
    if (rewriteEmbedding) {
      rewriteSearchPromise = queryEmbeddingInNamespace(rewriteEmbedding, namespace, initialTopK);
    }
  }

  const resultSets = await Promise.all([origSearchPromise, rewriteSearchPromise]);
  console.log(`[timing][${label}] pinecone=${Date.now() - tr0}ms candidates=${resultSets.flat().length}`);

  const byId = new Map();
  for (const match of resultSets.flat()) {
    const current = byId.get(match.id);
    if (!current || (match.score || 0) > (current.score || 0)) byId.set(match.id, match);
  }

  const ranked = lexicalRank([...byId.values()], question, topicExpansions, stopwords, buildHaystack);
  const chunks = await llmRerankChunks(client, question, ranked, {
    model: rerankModel, rerankCandidates, finalChunks,
    systemPrompt: rerankSystemPrompt, buildItem: buildRerankItem, label,
  });
  console.log(`[timing][${label}] rerank=${Date.now() - tr0}ms chunks=${chunks.length}`);

  return { chunks, dims: origEmbedding?.length || 0, retrievalQuery: focusedQuery };
}

export function setupSse(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (res.socket) res.socket.setNoDelay(true);
  res.flushHeaders();
  return (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function streamCompletion(client, sendEvent, messages, { model, maxTokens, label, t0 }) {
  const stream = await client.chat.completions.create({ model, messages, max_tokens: maxTokens, stream: true });
  console.log(`[timing][${label}] openai_stream_open=${Date.now() - t0}ms`);
  let firstToken = true;
  for await (const chunk of stream) {
    const token = chunk.choices?.[0]?.delta?.content;
    if (token) {
      if (firstToken) {
        console.log(`[timing][${label}] first_token=${Date.now() - t0}ms`);
        firstToken = false;
      }
      sendEvent({ token });
    }
  }
  console.log(`[timing][${label}] total=${Date.now() - t0}ms`);
}
