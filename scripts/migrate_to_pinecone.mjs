import fs from 'fs/promises';
import { Pinecone } from '@pinecone-database/pinecone';

try { await import('dotenv').then(d => d.config({ path: '.env.local' })); } catch (e) {}

const store = JSON.parse(await fs.readFile('data/store.json', 'utf8'));
const items = store.items.filter(i => i.embedding);

console.log(`Migrating ${items.length} vectors to Pinecone index "${process.env.PINECONE_INDEX}"...`);

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const index = pc.index(process.env.PINECONE_INDEX);

const BATCH = 100;
for (let i = 0; i < items.length; i += BATCH) {
  const batch = items.slice(i, i + BATCH).map(item => ({
    id: item.id,
    values: item.embedding,
    metadata: { text: item.text, ...item.meta }
  }));
  await index.upsert({ records: batch });
  console.log(`  ${Math.min(i + BATCH, items.length)}/${items.length} uploaded`);
}

console.log('Done.');
