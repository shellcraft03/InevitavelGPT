import OpenAI from 'openai';
import { getIndexNameForNamespace } from '../../lib/vectorStore.js';
import { intFromEnv, cleanRetrievalQuery, RAG_INITIAL_TOP_K_SPEC, RAG_RERANK_CANDIDATES_SPEC, RAG_FINAL_CHUNKS_SPEC } from '../../lib/chat-utils.js';
import { guardChatRequest, retrieveChunks, setupSse, streamCompletion } from '../../lib/rag.js';
import { ENTREVISTAS_TOPIC_EXPANSIONS, ENTREVISTAS_STOPWORDS } from '../../lib/rag-domains.js';

const TURNSTILE_ACTION = 'chat';
const EMBEDDING_MODEL = 'text-embedding-3-large';
const QUERY_REWRITE_MODEL = process.env.QUERY_REWRITE_MODEL || 'gpt-4.1-nano';
const RERANK_MODEL = process.env.INTERVIEW_RERANK_MODEL || 'gpt-4.1-nano';
const CHAT_MODEL = 'gpt-4.1';

const INITIAL_TOP_K     = intFromEnv('INTERVIEW_INITIAL_TOP_K',     ...RAG_INITIAL_TOP_K_SPEC);
const RERANK_CANDIDATES = intFromEnv('INTERVIEW_RERANK_CANDIDATES', ...RAG_RERANK_CANDIDATES_SPEC);
const FINAL_CHUNKS      = intFromEnv('INTERVIEW_FINAL_CHUNKS',      ...RAG_FINAL_CHUNKS_SPEC);

const client = new OpenAI({ apiKey: process.env.CUSTOM_OPENAI_API_KEY || process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT_ENTREVISTAS;
if (!SYSTEM_PROMPT) throw new Error('Missing env var: SYSTEM_PROMPT_ENTREVISTAS');
const QUERY_REWRITE_PROMPT = process.env.SYSTEM_PROMPT_QUERY_REWRITE_ENTREVISTAS;
if (!QUERY_REWRITE_PROMPT) throw new Error('Missing env var: SYSTEM_PROMPT_QUERY_REWRITE_ENTREVISTAS');

const RERANK_SYSTEM_PROMPT = [
  'Voce reranqueia trechos de entrevistas para responder uma pergunta.',
  'Use apenas a relevancia dos trechos para a pergunta.',
  'Prefira trechos que respondem diretamente, com detalhes concretos.',
  'Retorne somente um array JSON com os ids dos trechos mais relevantes em ordem.',
  `Retorne no maximo ${FINAL_CHUNKS} ids.`,
].join(' ');

export const config = {
  api: {
    bodyParser: { sizeLimit: '2kb' },
    responseLimit: false,
  },
};

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function buildRetrievalQuery(question) {
  let focused = question
    .replace(/^(o que|qual|quais|como)\s+(o\s+)?renan\s+santos\s+(pensa|acha|disse|fala|respondeu)\s+(sobre|a respeito de)\s+/i, '')
    .replace(/^(o que|qual|quais|como)\s+(ele|renan)\s+(pensa|acha|disse|fala|respondeu)\s+(sobre|a respeito de)\s+/i, '')
    .trim();
  if (!focused) focused = question;
  const expansions = ENTREVISTAS_TOPIC_EXPANSIONS
    .filter(({ pattern }) => pattern.test(question))
    .map(({ terms }) => terms);
  return [focused, question, ...expansions].join('\n');
}

async function rewriteRetrievalQuery(question) {
  const fallback = buildRetrievalQuery(question);
  try {
    const completion = await client.chat.completions.create({
      model: QUERY_REWRITE_MODEL,
      temperature: 0,
      max_tokens: 100,
      messages: [
        { role: 'system', content: QUERY_REWRITE_PROMPT },
        { role: 'user', content: question },
      ],
    });
    const rewritten = cleanRetrievalQuery(completion.choices?.[0]?.message?.content);
    return rewritten
      ? [rewritten, fallback, `Pergunta original: ${question}`].join('\n')
      : fallback;
  } catch (err) {
    console.warn('[rag][entrevistas] query rewrite failed:', err?.message || err);
    return fallback;
  }
}

export default async function handler(req, res) {
  const t0 = Date.now();
  try {
    const guard = await guardChatRequest(req, res, { turnstileAction: TURNSTILE_ACTION, label: 'entrevistas', t0 });
    if (!guard) return;
    const { question } = guard;

    const { chunks: top, dims, retrievalQuery } = await retrieveChunks(client, question, {
      namespace: 'entrevistas',
      embeddingModel: EMBEDDING_MODEL,
      initialTopK: INITIAL_TOP_K,
      rerankCandidates: RERANK_CANDIDATES,
      finalChunks: FINAL_CHUNKS,
      rerankModel: RERANK_MODEL,
      rerankSystemPrompt: RERANK_SYSTEM_PROMPT,
      buildRerankItem: (match, index) => ({
        id: match.id || String(index),
        title: match.meta?.title || '',
        time: match.meta?.start_seconds ?? null,
        text: String(match.text || '').slice(0, 250),
      }),
      rewriteQueryFn: rewriteRetrievalQuery,
      topicExpansions: ENTREVISTAS_TOPIC_EXPANSIONS,
      stopwords: ENTREVISTAS_STOPWORDS,
      label: 'entrevistas',
    });
    console.log(`[timing][entrevistas] retrieval=${Date.now() - t0}ms model=${EMBEDDING_MODEL} dims=${dims}`);
    if (process.env.DEBUG_RAG === 'true') {
      console.log('[rag][entrevistas]', {
        index: getIndexNameForNamespace('entrevistas'),
        namespace: 'entrevistas',
        originalQuestion: question,
        embeddingQuery: retrievalQuery,
        matches: top.map(t => ({
          id: t.id,
          score: Number(t.score?.toFixed?.(4) ?? t.score),
          rerankScore: Number(t.rerankScore?.toFixed?.(4) ?? t.rerankScore),
          lexicalHits: t.lexicalHits,
          llmReranked: Boolean(t.llmReranked),
          title: t.meta?.title || '',
          channel: t.meta?.channel || '',
          start_seconds: t.meta?.start_seconds ?? null,
        })),
      });
    }

    let contextText = '';
    let sources = [];
    if (top.length > 0) {
      contextText = top.map((t, i) => {
        const secs  = t.meta?.start_seconds ?? null;
        const tempo = secs != null ? formatTime(secs) : '';
        const esc   = (s) => String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
        const text  = t.meta?.context_text || t.text;
        return `<fonte id="${i + 1}" titulo="${esc(t.meta?.title)}" tempo="${esc(tempo)}">\n${text}\n</fonte>`;
      }).join('\n');
      sources = top.map((t, i) => ({
        id:            i + 1,
        text:          t.text || '',
        context_text:  t.meta?.context_text || '',
        source_url:    t.meta?.source_url || '',
        title:         t.meta?.title || '',
        channel:       t.meta?.channel || '',
        individual:    t.meta?.individual || '',
        published_at:  t.meta?.published_at || '',
        start_seconds: t.meta?.start_seconds ?? null,
        end_seconds:   t.meta?.end_seconds ?? null,
        score:         t.score,
      }));
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          `<contexto>\n${contextText}\n</contexto>`,
          `<pergunta>${question}</pergunta>`,
          'Resposta:',
        ].join('\n'),
      },
    ];

    const sendEvent = setupSse(res);
    try {
      await streamCompletion(client, sendEvent, messages, { model: CHAT_MODEL, maxTokens: 1400, label: 'entrevistas', t0 });
      sendEvent({ done: true, sources });
      res.end();
    } catch (streamErr) {
      console.error('stream error:', streamErr?.message || streamErr);
      sendEvent({ error: 'Erro ao gerar resposta.' });
      res.end();
    }
  } catch (err) {
    console.error('chat-entrevistas error:', err?.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    } else {
      res.write(`data: ${JSON.stringify({ error: 'Erro ao gerar resposta.' })}\n\n`);
      res.end();
    }
  }
}
