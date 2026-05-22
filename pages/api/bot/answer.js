import OpenAI from 'openai';
import { sanitizeQuestion, cleanRetrievalQuery } from '../../../lib/chat-utils.js';
import { retrieveChunks } from '../../../lib/rag.js';
import { LIVRO_TOPIC_EXPANSIONS, LIVRO_STOPWORDS, ENTREVISTAS_TOPIC_EXPANSIONS, ENTREVISTAS_STOPWORDS } from '../../../lib/rag-domains.js';

const EMBEDDING_MODEL = 'text-embedding-3-large';
const QUERY_REWRITE_MODEL = process.env.QUERY_REWRITE_MODEL || 'gpt-4.1-nano';
const CHAT_MODEL = 'gpt-4.1';
const INITIAL_TOP_K = 20;
const RERANK_CANDIDATES = 20;
const FINAL_CHUNKS = 8;
const MAX_TOKENS = 800;

const client = new OpenAI({ apiKey: process.env.CUSTOM_OPENAI_API_KEY || process.env.OPENAI_API_KEY });

const RERANK_PROMPTS = {
  livro: [
    'Voce reranqueia trechos do Livro Amarelo para responder uma pergunta.',
    'Use apenas a relevancia dos trechos para a pergunta.',
    'Prefira trechos que respondem diretamente, com detalhes concretos.',
    'Retorne somente um array JSON com os ids dos trechos mais relevantes em ordem.',
    `Retorne no maximo ${FINAL_CHUNKS} ids.`,
  ].join(' '),
  entrevistas: [
    'Voce reranqueia trechos de entrevistas para responder uma pergunta.',
    'Use apenas a relevancia dos trechos para a pergunta.',
    'Prefira trechos que respondem diretamente, com detalhes concretos.',
    'Retorne somente um array JSON com os ids dos trechos mais relevantes em ordem.',
    `Retorne no maximo ${FINAL_CHUNKS} ids.`,
  ].join(' '),
};

function buildRerankItem(match, index, type) {
  const base = {
    id: match.id || String(index),
    title: match.meta?.title || (type === 'livro' ? match.meta?.file : '') || '',
    text: String(match.text || '').slice(0, 250),
  };
  if (type === 'livro') return { ...base, page: match.meta?.page ?? null };
  return { ...base, time: match.meta?.start_seconds ?? null };
}

async function rewriteQuery(question, promptEnvKey) {
  const prompt = process.env[promptEnvKey];
  if (!prompt) return question;
  try {
    const res = await client.chat.completions.create({
      model: QUERY_REWRITE_MODEL,
      temperature: 0,
      max_tokens: 100,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: question },
      ],
    });
    return cleanRetrievalQuery(res.choices?.[0]?.message?.content) || question;
  } catch {
    return question;
  }
}

function buildContext(chunks, type) {
  if (type === 'livro') {
    return chunks
      .map((t, i) =>
        `<fonte id="${i + 1}" arquivo="${t.meta?.file || 'unknown'}" pagina="${t.meta?.page}">\n${t.text}\n</fonte>`
      )
      .join('\n');
  }
  return chunks
    .map((t, i) => {
      const text = t.meta?.context_text || t.text;
      return `<fonte id="${i + 1}" titulo="${t.meta?.title || ''}">\n${text}\n</fonte>`;
    })
    .join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.BOT_API_SECRET;
  if (!secret || req.headers['x-bot-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { question: rawQuestion, type } = req.body || {};
  if (!rawQuestion || !['livro', 'entrevistas'].includes(type)) {
    return res.status(400).json({ error: 'Missing question or invalid type' });
  }

  const question = sanitizeQuestion(rawQuestion);
  if (!question) return res.status(400).json({ error: 'Question is empty after sanitization' });

  const isLivro = type === 'livro';
  const namespace = isLivro ? 'livro-amarelo-v2' : 'entrevistas';
  const rewritePromptKey = isLivro ? 'SYSTEM_PROMPT_QUERY_REWRITE_LIVRO' : 'SYSTEM_PROMPT_QUERY_REWRITE_ENTREVISTAS';
  const rerankModel = isLivro
    ? (process.env.LIVRO_RERANK_MODEL || 'gpt-4.1-nano')
    : (process.env.INTERVIEW_RERANK_MODEL || 'gpt-4.1-nano');
  const systemPromptKey = isLivro ? 'SYSTEM_PROMPT_LIVRO' : 'SYSTEM_PROMPT_ENTREVISTAS';
  const systemPrompt = process.env[systemPromptKey];

  if (!systemPrompt) {
    return res.status(500).json({ error: `Missing env var: ${systemPromptKey}` });
  }

  try {
    const { chunks } = await retrieveChunks(client, question, {
      namespace,
      embeddingModel: EMBEDDING_MODEL,
      initialTopK: INITIAL_TOP_K,
      rerankCandidates: RERANK_CANDIDATES,
      finalChunks: FINAL_CHUNKS,
      rerankModel,
      rerankSystemPrompt: RERANK_PROMPTS[type],
      buildRerankItem: (match, index) => buildRerankItem(match, index, type),
      rewriteQueryFn: (q) => rewriteQuery(q, rewritePromptKey),
      topicExpansions: isLivro ? LIVRO_TOPIC_EXPANSIONS : ENTREVISTAS_TOPIC_EXPANSIONS,
      stopwords: isLivro ? LIVRO_STOPWORDS : ENTREVISTAS_STOPWORDS,
      label: `bot/${type}`,
    });

    const contextText = buildContext(chunks, type);
    const messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `<contexto>\n${contextText}\n</contexto>\n<pergunta>${question}</pergunta>\nResposta:`,
      },
    ];

    const completion = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages,
      max_tokens: MAX_TOKENS,
    });

    const answer = completion.choices?.[0]?.message?.content || '';
    return res.status(200).json({ answer, question, type });
  } catch (err) {
    console.error('[bot/answer]', err?.message || err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
