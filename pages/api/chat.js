import OpenAI from 'openai';
import { getIndexNameForNamespace } from '../../lib/vectorStore.js';
import { intFromEnv, cleanRetrievalQuery, RAG_INITIAL_TOP_K_SPEC, RAG_RERANK_CANDIDATES_SPEC, RAG_FINAL_CHUNKS_SPEC } from '../../lib/chat-utils.js';
import { guardChatRequest, retrieveChunks, setupSse, streamCompletion } from '../../lib/rag.js';
import { LIVRO_TOPIC_EXPANSIONS, LIVRO_STOPWORDS } from '../../lib/rag-domains.js';

const TURNSTILE_ACTION = 'chat';
const LIVRO_NAMESPACE = 'livro-amarelo-v2';
const EMBEDDING_MODEL = 'text-embedding-3-large';
const QUERY_REWRITE_MODEL = process.env.QUERY_REWRITE_MODEL || 'gpt-4.1-nano';
const RERANK_MODEL = process.env.LIVRO_RERANK_MODEL || 'gpt-4.1-nano';
const CHAT_MODEL = 'gpt-4.1';

const INITIAL_TOP_K     = intFromEnv('LIVRO_INITIAL_TOP_K',     ...RAG_INITIAL_TOP_K_SPEC);
const RERANK_CANDIDATES = intFromEnv('LIVRO_RERANK_CANDIDATES', ...RAG_RERANK_CANDIDATES_SPEC);
const FINAL_CHUNKS      = intFromEnv('LIVRO_FINAL_CHUNKS',      ...RAG_FINAL_CHUNKS_SPEC);

const client = new OpenAI({ apiKey: process.env.CUSTOM_OPENAI_API_KEY || process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT_LIVRO;
if (!SYSTEM_PROMPT) throw new Error('Missing env var: SYSTEM_PROMPT_LIVRO');
const QUERY_REWRITE_PROMPT = process.env.SYSTEM_PROMPT_QUERY_REWRITE_LIVRO;
if (!QUERY_REWRITE_PROMPT) throw new Error('Missing env var: SYSTEM_PROMPT_QUERY_REWRITE_LIVRO');

const RERANK_SYSTEM_PROMPT = [
  'Voce reranqueia trechos do Livro Amarelo para responder uma pergunta.',
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

function buildRetrievalQuery(question) {
  let focused = question
    .replace(/^(o que|qual|quais|como)\s+(o\s+)?(livro amarelo|plano)\s+(diz|fala|trata|propoe)\s+(sobre|a respeito de)\s+/i, '')
    .replace(/^(o que|qual|quais|como)\s+(sao|são|e|é)\s+as?\s+propostas?\s+(para|sobre|de)\s+/i, '')
    .trim();
  if (!focused) focused = question;
  const expansions = LIVRO_TOPIC_EXPANSIONS
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
    console.warn('[rag][livro] query rewrite failed:', err?.message || err);
    return fallback;
  }
}

export default async function handler(req, res) {
  const t0 = Date.now();
  try {
    const guard = await guardChatRequest(req, res, { turnstileAction: TURNSTILE_ACTION, label: 'chat', t0 });
    if (!guard) return;
    const { question } = guard;

    let messages;
    let sources = [];

    if (process.env.USE_RAG === 'true') {
      const { chunks: top, dims, retrievalQuery } = await retrieveChunks(client, question, {
        namespace: LIVRO_NAMESPACE,
        embeddingModel: EMBEDDING_MODEL,
        initialTopK: INITIAL_TOP_K,
        rerankCandidates: RERANK_CANDIDATES,
        finalChunks: FINAL_CHUNKS,
        rerankModel: RERANK_MODEL,
        rerankSystemPrompt: RERANK_SYSTEM_PROMPT,
        buildRerankItem: (match, index) => ({
          id: match.id || String(index),
          title: match.meta?.title || match.meta?.file || '',
          page: match.meta?.page ?? null,
          text: String(match.text || '').slice(0, 250),
        }),
        rewriteQueryFn: rewriteRetrievalQuery,
        topicExpansions: LIVRO_TOPIC_EXPANSIONS,
        stopwords: LIVRO_STOPWORDS,
        buildHaystack: (m) => `${m.meta?.title || ''} ${m.meta?.file || ''} ${m.text || ''}`,
        label: 'livro',
      });
      console.log(`[timing][chat] retrieval=${Date.now() - t0}ms model=${EMBEDDING_MODEL} dims=${dims}`);
      if (process.env.DEBUG_RAG === 'true') {
        console.log('[rag][livro]', {
          index: getIndexNameForNamespace(LIVRO_NAMESPACE),
          namespace: LIVRO_NAMESPACE,
          originalQuestion: question,
          embeddingQuery: retrievalQuery,
          matches: top.map(t => ({
            id: t.id,
            score: Number(t.score?.toFixed?.(4) ?? t.score),
            rerankScore: Number(t.rerankScore?.toFixed?.(4) ?? t.rerankScore),
            lexicalHits: t.lexicalHits,
            llmReranked: Boolean(t.llmReranked),
            title: t.meta?.title || '',
            file: t.meta?.file || '',
            page: t.meta?.page ?? null,
          })),
        });
      }
      const contextText = top.map((t, i) =>
        `<fonte id="${i + 1}" arquivo="${t.meta?.file || 'unknown'}" pagina="${t.meta?.page}" score="${t.score?.toFixed(3)}">\n${t.text}\n</fonte>`
      ).join('\n');
      messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `<contexto>\n${contextText}\n</contexto>\n<pergunta>${question}</pergunta>\nResposta:` },
      ];
      sources = top.map((t, i) => ({
        source: `Source ${i + 1}`,
        file: t.meta?.file,
        page: t.meta?.page,
        chunk: t.meta?.chunk,
        title: t.meta?.title,
        score: t.score,
      }));
    } else {
      messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `<pergunta>${question}</pergunta>\nResposta:` },
      ];
    }

    const sendEvent = setupSse(res);
    try {
      await streamCompletion(client, sendEvent, messages, { model: CHAT_MODEL, maxTokens: 1400, label: 'chat', t0 });
      sendEvent({ done: true, sources });
      res.end();
    } catch (streamErr) {
      console.error('stream error:', streamErr?.message || streamErr);
      sendEvent({ error: 'Erro ao gerar resposta.' });
      res.end();
    }
  } catch (err) {
    console.error('chat error:', err?.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    } else {
      res.write(`data: ${JSON.stringify({ error: 'Erro ao gerar resposta.' })}\n\n`);
      res.end();
    }
  }
}
