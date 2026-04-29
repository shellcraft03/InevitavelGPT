import fs from 'fs/promises';
import path from 'path';
import OpenAI from 'openai';

try { await import('dotenv').then(d => d.config({ path: '.env.local' })); } catch (e) {}

const STORE_PATH = path.join(process.cwd(), 'data', 'store.json');

async function loadStore() {
  try { return JSON.parse(await fs.readFile(STORE_PATH, 'utf8')); } catch (e) { return { items: [] }; }
}

async function saveStore(store) {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

async function main() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error('OPENAI_API_KEY not set. Export it or create .env.local with OPENAI_API_KEY.');
    process.exit(1);
  }
  const client = new OpenAI({ apiKey: key });

  // Preflight: verify the embedding model is accessible before processing all items
  const preferred = process.env.EMBEDDING_MODEL ? process.env.EMBEDDING_MODEL.split(',') : ['text-embedding-3-small'];
  const alternatives = ['text-embedding-3-large', 'text-embedding-3-small', 'text-embedding-ada-002'];
  const modelsToTry = [...new Set([...preferred, ...alternatives])];

  console.log('Checking embedding model access...');
  let workingModel = null;
  for (const m of modelsToTry) {
    try {
      const test = await client.embeddings.create({ model: m, input: 'test' });
      if (test?.data?.[0]?.embedding?.length) {
        workingModel = m;
        console.log(`Model OK: ${m}`);
        break;
      }
    } catch (err) {
      const msg = err?.message || String(err);
      if (msg.includes('403') || msg.includes('does not have access')) {
        console.error(`Model NOT accessible (403): ${m}`);
        console.error('  → Go to platform.openai.com → Projects → your project → Model access → enable this model');
      } else {
        console.error(`Model ${m} failed: ${msg}`);
      }
    }
  }

  if (!workingModel) {
    console.error('\nNo working embedding model found. Fix model access in the OpenAI dashboard and retry.');
    process.exit(1);
  }

  const store = await loadStore();
  const items = store.items || [];
  const toFill = items.filter(i => !i.embedding || i.embedding.length === 0);
  console.log(`\nFound ${toFill.length} items without embeddings (out of ${items.length}).`);
  if (toFill.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  let count = 0;
  for (const it of toFill) {
    try {
      const resp = await client.embeddings.create({ model: workingModel, input: it.text });
      const vec = resp?.data?.[0]?.embedding;
      if (vec && vec.length) {
        it.embedding = vec;
        count++;
        process.stdout.write(`\r  Embedded ${count}/${toFill.length}`);
      } else {
        console.warn(`\nEmpty embedding returned for ${it.id}`);
      }
    } catch (err) {
      console.error(`\nEmbedding error for ${it.id}: ${err?.message || err}`);
    }
  }

  await saveStore({ items });
  console.log(`\nCompleted. Added ${count} embeddings.`);
}

main().catch(err => { console.error(err); process.exit(1); });
