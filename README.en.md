<div align="center">

**🌐 Language / Idioma:** [English](README.en.md) . [Português](README.md)

# o Livro Amarelo — Q&A

**Explore O Livro Amarelo through natural language questions.**

Retrieval-Augmented Generation with OpenAI · Protected by Cloudflare Turnstile

---

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4.1--mini-412991?style=flat-square&logo=openai)
![Pinecone](https://img.shields.io/badge/Pinecone-Vector%20DB-00B07D?style=flat-square)
![Neon](https://img.shields.io/badge/Neon-Postgres-00E699?style=flat-square&logo=postgresql&logoColor=black)
![Upstash](https://img.shields.io/badge/Upstash-Rate%20Limit-00E9A3?style=flat-square&logo=upstash)
![Turnstile](https://img.shields.io/badge/Turnstile-CAPTCHA-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-white?style=flat-square)

</div>

---

## What is it

**O Livro Amarelo** (The Yellow Book) is a long-term national project aimed at transforming Brazil into the world's fifth largest economy over the coming decades. It is a concrete plan, built on objective and structured proposals, designed to guide the country's sustainable and consistent development.

This web application allows users to explore the content of O Livro Amarelo through natural language questions. The system indexes the document, generates semantic embeddings, and uses a language model to answer based exclusively on the document's content — citing page numbers as sources.

---

## Features

- **Full RAG pipeline** — semantic search via embeddings + contextualized response generation
- **CAPTCHA protection** — Cloudflare Turnstile with a fresh token per request
- **Rate limiting** — 10 req/min and 50 req/day per IP via Sliding Window (`@upstash/ratelimit`) · only blocked requests are logged to the `rl:blocked` Redis key (persistent list, no TTL, timestamp in Brasília timezone) · in-memory fallback (local dev)
- **Concrete answers** — the model is instructed to cite only proposals explicitly found in the document
- **Sharing** — buttons to copy text or download the answer as a JPEG image
- **Federal deputies** — `/deputados` page showing Chamber of Deputies composition by party and state, via the Câmara dos Deputados API; party name resolved via join with the membership database
- **Party membership data** — `/filiados` page showing party affiliation counts by state, automatically updated every Monday via GitHub Actions from public TSE data
- **Responsive** — layout adapted for desktop and mobile devices

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 · React 18 |
| LLM | OpenAI GPT-4.1-mini |
| Embeddings | OpenAI text-embedding-3-small |
| Vector store | Pinecone (cloud vector database) |
| Relational DB | Neon Postgres (serverless) |
| CAPTCHA | Cloudflare Turnstile |
| Rate limit | @upstash/ratelimit · Sliding Window · Upstash Redis (serverless) · in-memory fallback (local dev) |
| Analytics | Google Analytics 4 |
| PDF parsing | pdf-parse |
| Data automation | GitHub Actions (weekly cron) |

---

## Project structure

```
livro-amarelo/
├── .github/
│   └── workflows/
│       └── update-filiados.yml   # Weekly cron: updates membership (TSE) and deputies (Câmara API)
├── pages/
│   ├── index.js              # Verification page (Turnstile)
│   ├── inicio.js             # Q&A interface
│   ├── deputados.js          # Federal deputies page by party and state
│   ├── filiados.js           # Party membership page by state
│   ├── sobre.js              # About page
│   ├── privacidade.js        # Privacy policy
│   ├── _app.js               # App wrapper — global CSS + Google Analytics
│   └── api/
│       ├── chat.js           # Main RAG + LLM endpoint
│       ├── deputados.js      # Deputies endpoint (Neon + join with filiados for party name)
│       └── filiados.js       # Party membership endpoint (reads from Neon Postgres)
├── hooks/
│   └── useTurnstile.js       # React hook for the Turnstile widget
├── lib/
│   ├── turnstile.js          # Server-side token verification
│   ├── chunker.js            # Text splitting and normalization
│   ├── vectorStore.js        # Embedding storage and search
│   └── rateLimiter.js        # IP-based rate limiting
├── scripts/
│   ├── aggregate_deputados.mjs   # Fetches deputies from Câmara API and inserts into Neon
│   ├── aggregate_filiados.mjs    # Streams TSE CSV and inserts into Neon
│   ├── index_pdf.mjs             # Index PDFs from data/books/
│   ├── generate_embeddings.mjs   # Generate embeddings for items without vectors
│   └── migrate_to_pinecone.mjs   # Upload vectors from store.json to Pinecone
├── styles/
│   └── globals.css           # Color palette, reset and responsive classes
├── public/
│   └── cover.png             # Cover illustration
└── data/
    └── books/                # Source PDFs (not versioned)
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Create a `.env.local` file at the project root:

```env
# OpenAI
OPENAI_API_KEY=sk-...

# Cloudflare Turnstile
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x...
TURNSTILE_SECRET=0x...

# Pinecone
PINECONE_API_KEY=pcsk-...
PINECONE_INDEX=your-index-name

# Enable RAG pipeline
USE_RAG=true

# Embedding model (optional — default: text-embedding-3-small)
# EMBEDDING_MODEL=text-embedding-3-small

# Upstash Redis for distributed rate limiting
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# Neon Postgres for party membership data
DATABASE_URL=postgresql://...
```

> **Pinecone:** create an index in the [Pinecone console](https://app.pinecone.io) with dimension **1536** (compatible with `text-embedding-3-small`) and a region of your choice. After indexing PDFs locally, run the migration script (step 3b) to upload the vectors to Pinecone.

> **Note:** Your OpenAI project must have access to two models:
> - `text-embedding-3-small` — for embedding generation during indexing and queries
> - `gpt-4.1-mini` — for natural language response generation
>
> Check at *platform.openai.com → Projects → Model access*. These are the default models, but developers can swap them for any models they prefer by editing the `EMBEDDING_MODEL` variable and the `model` field in `pages/api/chat.js`.

> **Neon:** create a project at [neon.tech](https://neon.tech) and copy the connection string in `postgresql://...` format. The `filiados_partidarios` table is created automatically on the first run of `aggregate_filiados.mjs`. Also add `DATABASE_URL` as a repository secret on GitHub (Actions → Secrets) for the automatic update workflow to work.

### 3. Index the document and upload to Pinecone

Place the PDF in `data/books/` and run:

```bash
# First-time indexing (extracts text, generates chunks and embeddings locally)
npm run index:pdf

# Re-index from scratch (clears the store first)
npm run index:pdf -- --reindex
```

#### 3b. Migrate vectors to Pinecone

After local indexing, upload the vectors to Pinecone:

```bash
node scripts/migrate_to_pinecone.mjs
```

The script reads the local `store.json` and uploads all vectors in batches of 100. After migration, `store.json` is no longer needed in production — vectors are stored in Pinecone.

### 4. Populate the party membership database

Download the TSE affiliation file and process it with the aggregation script:

```bash
# Download and extract
curl -L -o filiacao.zip "https://cdn.tse.jus.br/estatistica/sead/odsele/filiacao_partidaria/perfil_filiacao_partidaria.zip"
mkdir -p tse_data && unzip filiacao.zip -d tse_data/

# Process and insert into the database (~12M rows, ~5 min)
node scripts/aggregate_filiados.mjs ./tse_data

# Clean up
rm -rf filiacao.zip tse_data/
```

The script uses streaming to process the 3.3 GB CSV without exhausting memory. On each run, data for the period found in the file is dropped and re-inserted — no duplicates possible.

After the initial load, the GitHub Actions workflow updates the database automatically every Monday at 08:00 BRT.

### 5. Generate missing embeddings

If indexing saved items without embeddings (temporary API failure):

```bash
npm run generate:embeddings
```

The script runs a preflight check and reports whether the model is accessible before processing.

### 6. Start the server

```bash
npm run dev                    # development (port 3000)
npm run build && npm start     # production
```

---

## Application flow

```
User
  │
  ▼
┌──────────────────────────────────────┐
│  /  — Turnstile Verification         │  Solve CAPTCHA → click "Enter"
└─────────────┬────────────────────────┘
              │ token saved in sessionStorage
              ▼
┌──────────────────────────────────────┐
│  /inicio — Q&A Interface             │  Type question → Enter or button
└─────────────┬────────────────────────┘
              │ fresh token generated per request
              ▼
┌──────────────────────────────────────┐
│  /api/chat                           │
│  1. Verify POST method               │
│  2. Rate limit (min + day)           │
│  3. Verify Turnstile                 │
│  4. Embed the question               │
│  5. Retrieve top-6 chunks (Pinecone) │
│  6. Build prompt with context        │
│  7. GPT-4.1-mini responds            │
└─────────────┬────────────────────────┘
              │
              ▼
        Answer with page citation
        + copy text / download image options

┌──────────────────────────────────────┐
│  /filiados — Party Membership        │  Filter by state and period
└─────────────┬────────────────────────┘
              │
              ▼
┌──────────────────────────────────────┐
│  /api/filiados                       │
│  Reads from Neon Postgres            │
│  Cache: 1h (s-maxage)               │
└──────────────────────────────────────┘
              ▲
              │ every Monday 08:00 BRT
┌──────────────────────────────────────┐
│  GitHub Actions                      │
│  Downloads TSE ZIP (~221 MB)         │
│  Streams 12M rows                    │
│  Drop + insert into Neon             │
└──────────────────────────────────────┘
```

---

## Available scripts

| Command | Description |
|---|---|
| `npm run dev` | Development server on port 3000 |
| `npm run build` | Production build |
| `npm start` | Production server |
| `npm run index:pdf` | Index PDFs in `data/books/` |
| `npm run index:pdf -- --reindex` | Clear local store and re-index |
| `npm run generate:embeddings` | Fill in missing embeddings |
| `node scripts/migrate_to_pinecone.mjs` | Upload vectors from store.json to Pinecone |
| `node scripts/aggregate_filiados.mjs ./tse_data` | Process TSE CSV and insert into Neon |
| `node scripts/aggregate_deputados.mjs` | Fetch deputies from Câmara API and insert into Neon |

---

<div align="center">

**o Livro Amarelo · O Futuro é Glorioso**

</div>
