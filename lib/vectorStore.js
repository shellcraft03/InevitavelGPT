import { Pinecone } from '@pinecone-database/pinecone';

const loggedIndexStats = new Set();

let _pineconeClient = null;
function getPinecone() {
  if (!_pineconeClient) _pineconeClient = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  return _pineconeClient;
}

async function withRetry(fn, maxRetries = 2, baseDelayMs = 200) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err?.status ?? err?.statusCode;
      const isTransient = !status || status === 429 || status >= 500;
      if (attempt === maxRetries || !isTransient) throw err;
      await new Promise(r => setTimeout(r, baseDelayMs * 2 ** attempt));
    }
  }
}

function shouldDebugRag() {
  return process.env.DEBUG_RAG === 'true';
}

function getIndex(indexName) {
  return getPinecone().index(indexName);
}

export async function addItems(items, options = {}) {
  const indexName = options.indexName || getIndexNameForNamespace(options.namespace);
  if (!indexName) throw new Error(`Missing Pinecone index env var for namespace "${options.namespace || 'default'}"`);
  let index = getIndex(indexName);
  if (options.namespace) index = index.namespace(options.namespace);

  const records = items
    .filter(i => i.embedding)
    .map(i => ({
      id: i.id,
      values: i.embedding,
      metadata: { text: i.text, ...i.meta }
    }));

  const BATCH = 100;
  for (let i = 0; i < records.length; i += BATCH) {
    await index.upsert({ records: records.slice(i, i + BATCH) });
  }
}

export async function queryEmbeddingInNamespace(embedding, namespace, k = 6) {
  const indexName = getIndexNameForNamespace(namespace);
  if (!indexName) throw new Error(`Missing Pinecone index env var for namespace "${namespace}"`);

  const index = getIndex(indexName).namespace(namespace);
  await logIndexStatsOnce(index, indexName, namespace, embedding?.length);
  const result = await withRetry(() => index.query({
    vector: embedding,
    topK: k,
    includeMetadata: true,
  }));

  return (result.matches || []).map(m => ({
    score: m.score,
    id: m.id,
    text: m.metadata?.text || '',
    meta: m.metadata || {},
  }));
}

export function getIndexNameForNamespace(namespace) {
  if (namespace === 'entrevistas') {
    return process.env.PINECONE_INDEX_ENTREVISTAS;
  }
  if (namespace === 'livro-amarelo-v2') {
    return process.env.PINECONE_INDEX_LIVRO;
  }
}

async function logIndexStatsOnce(index, indexName, namespace, embeddingDims) {
  if (!shouldDebugRag()) return;

  const key = `${indexName}:${namespace}`;
  if (loggedIndexStats.has(key)) return;
  loggedIndexStats.add(key);

  try {
    const stats = await index.describeIndexStats();
    const namespaceStats = stats.namespaces?.[namespace];
    console.log('[pinecone][stats]', {
      index: indexName,
      namespace,
      indexDimension: stats.dimension,
      queryDimension: embeddingDims,
      namespaceRecordCount: namespaceStats?.recordCount || 0,
      totalRecordCount: stats.totalRecordCount,
    });

    if (!namespaceStats?.recordCount) {
      console.warn(`[pinecone] namespace "${namespace}" is empty in index "${indexName}"`);
    }
    if (stats.dimension && embeddingDims && stats.dimension !== embeddingDims) {
      console.warn(`[pinecone] dimension mismatch index=${stats.dimension} query=${embeddingDims}`);
    }
  } catch (err) {
    console.warn('[pinecone] could not describe index stats:', err?.message || err);
  }
}

export async function clearStore(options = {}) {
  const indexName = options.indexName || getIndexNameForNamespace(options.namespace);
  if (!indexName) throw new Error(`Missing Pinecone index env var for namespace "${options.namespace || 'default'}"`);
  let index = getIndex(indexName);
  if (options.namespace) index = index.namespace(options.namespace);
  await index.deleteAll();
}

