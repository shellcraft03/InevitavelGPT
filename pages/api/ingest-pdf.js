import formidable from 'formidable';
import fs from 'fs/promises';
import pdf from 'pdf-parse';
import OpenAI from 'openai';
import { addItems } from '../../lib/vectorStore.js';
import { checkRateLimit } from '../../lib/rateLimiter.js';
import { verifyTurnstile } from '../../lib/turnstile.js';
import { chunkText } from '../../lib/chunker.js';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const form = new formidable.IncomingForm({ maxFileSize: MAX_FILE_SIZE });

  let parsed;
  try {
    parsed = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) return reject(err);
        resolve({ fields, files });
      });
    });
  } catch (err) {
    const msg = err.message?.includes('maxFileSize') ? 'File exceeds 50 MB limit' : 'Failed to parse upload';
    return res.status(400).json({ error: msg });
  }

  const file = parsed.files?.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });

  // Validate file type
  const filename = (file.originalFilename || file.name || '').toLowerCase();
  const mimetype = file.mimetype || file.type || '';
  if (!filename.endsWith('.pdf') && !mimetype.includes('pdf')) {
    return res.status(400).json({ error: 'Only PDF files are accepted' });
  }

  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
  const rl = await checkRateLimit(ip, 5, 60);
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
  res.setHeader('X-RateLimit-Reset', String(rl.resetSeconds));
  if (!rl.ok) return res.status(429).json({ error: 'Too many requests' });

  const turnstileToken = parsed.fields?.turnstileToken || parsed.fields?.turnstiletoken;
  const okRes = await verifyTurnstile(turnstileToken);
  if (!okRes.ok) return res.status(403).json({ error: 'Turnstile verification failed' });

  const buffer = await fs.readFile(file.filepath || file.path);

  let data;
  try {
    data = await pdf(buffer);
  } catch (err) {
    console.error('PDF parse error', err);
    return res.status(400).json({ error: 'Failed to parse PDF' });
  }

  const pages = (data.text || '').split(/\f/).map(p => p.trim()).filter(Boolean);

  const items = [];
  for (let i = 0; i < pages.length; i++) {
    const pageChunks = chunkText(pages[i], 1000);
    for (let j = 0; j < pageChunks.length; j++) {
      items.push({ id: `${Date.now()}-${i}-${j}`, text: pageChunks[j], meta: { page: i + 1, pageChunk: j } });
    }
  }

  const client = new OpenAI({ apiKey: process.env.CUSTOM_OPENAI_API_KEY || process.env.OPENAI_API_KEY });
  const outItems = [];
  for (const it of items) {
    try {
      const emb = await client.embeddings.create({ model: 'text-embedding-3-small', input: it.text });
      outItems.push({ ...it, embedding: emb.data[0].embedding });
    } catch (err) {
      console.error('Embedding error for chunk', it.id, err?.message || err);
      outItems.push(it);
    }
  }

  await addItems(outItems);

  res.json({ ok: true, pages: pages.length, chunks: outItems.length });
}
