import fs from 'fs/promises';
import path from 'path';
import OpenAI from 'openai';

// Load .env.local if present
try { await import('dotenv').then(d => d.config({ path: '.env.local' })); } catch (e) {}

const STORE_PATH = path.join(process.cwd(), 'data', 'store.json');

async function loadStore() {
  try { return JSON.parse(await fs.readFile(STORE_PATH, 'utf8')); } catch (e) { return { items: [] }; }
}

async function saveStore(store) { await fs.mkdir(path.dirname(STORE_PATH), { recursive: true }); await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf8'); }

async function main() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error('OPENAI_API_KEY not set. Export it or create .env.local with OPENAI_API_KEY.');
    process.exit(1);
  }
  const client = new OpenAI({ apiKey: key });
  const store = await loadStore();
  const items = store.items || [];
  const toFill = items.filter(i => !i.embedding || i.embedding.length === 0);
  console.log(`Found ${toFill.length} items without embeddings (out of ${items.length}).`);
  let count = 0;
  for (const it of toFill) {
    try {
      const resp = await client.embeddings.create({ model: 'text-embedding-3-small', input: it.text });
      const vec = resp?.data?.[0]?.embedding;
      if (vec && vec.length) {
        it.embedding = vec;
        count++;
        console.log(`Filled embedding for ${it.id}`);
      } else {
        console.warn(`No embedding returned for ${it.id}`);
      }
    } catch (err) {
      console.error('Embedding error for', it.id, err?.message || err);
    }
  }
  await saveStore({ items });
  console.log(`Completed. Added ${count} embeddings.`);
}

main().catch(err => { console.error(err); process.exit(1); });
