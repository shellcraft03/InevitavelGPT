<div align="center">

**🌐 Language / Idioma:** [English](README.en.md) . [Português](README.md)

# InevitávelGPT — Q&A

**Explore Livro Amarelo and Renan Santos's interviews through natural language questions.**

Retrieval-Augmented Generation with OpenAI · Protected by Cloudflare Turnstile

---

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4.1-412991?style=flat-square&logo=openai)
![Pinecone](https://img.shields.io/badge/Pinecone-Vector%20DB-00B07D?style=flat-square)
![Neon](https://img.shields.io/badge/Neon-Postgres-00E699?style=flat-square&logo=postgresql&logoColor=black)
![Upstash](https://img.shields.io/badge/Upstash-Rate%20Limit-00E9A3?style=flat-square&logo=upstash)
![Turnstile](https://img.shields.io/badge/Turnstile-CAPTCHA-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-white?style=flat-square)

</div>

---

## What is it

**O Livro Amarelo** (The Yellow Book) is a long-term national project aimed at transforming Brazil into the world's fifth largest economy over the coming decades. It is a concrete plan, built on objective and structured proposals, designed to guide the country's sustainable and consistent development.

This web application allows users to explore the content of O Livro Amarelo and Renan Santos's interviews through natural language questions. The system indexes documents and transcripts, generates semantic embeddings, and uses a language model to answer based exclusively on the indexed content — citing sources.

---

## Features

- **Full RAG pipeline** — semantic search via embeddings + contextualized response generation
- **Renan Responde** — Q&A based on YouTube interviews: automatic transcription, AI speaker filtering, sentence-boundary chunking, inline citations `[1][2]` with direct links to the exact moment in the video; copy-text and download-as-image buttons for sharing answers
- **Automatic interview curation** — an AI agent periodically evaluates links submitted by users and approves/rejects them based on defined criteria (main interviewee, complete interview, independent channel, substantive political content)
- **User video submission** — form on the `/entrevistas` page to suggest YouTube links; protected by Turnstile + rate limit
- **CAPTCHA protection** — Cloudflare Turnstile with lazy initialization (activates only on input focus); on entry it creates an HMAC-SHA256 HttpOnly session cookie (1h TTL) — chat endpoints skip Turnstile while the session is valid
- **Shared rate limiting** — 10 req/min and 50 req/day per IP via Sliding Window (`@upstash/ratelimit`); counters shared across all endpoints (book chat, interview chat, and video submission) · in-memory fallback (local dev)
- **Channel blocking** — curation automatically rejects videos from channels configured in `BLOCKED_YOUTUBE_CHANNEL_NAMES` (semicolon-separated terms)
- **Concrete answers** — the model cites only what is explicitly found in the indexed sources
- **Federal deputies** — `/deputados` page showing Chamber of Deputies composition by party and state, via the Câmara dos Deputados API
- **Party membership data** — `/filiados` page showing party affiliation counts by state, automatically updated every Monday via GitHub Actions from public TSE data
- **Pix donations (Livepix)** — Bot X/Twitter users donate via Pix; balance is credited automatically via webhook and converted into bot usage credits
- **2026 election sentiment tracker** — tracks public sentiment for the Brazilian presidential race: collects RSS news, Twitter/X posts, and Polymarket odds; classifies each item per candidate via GPT; displays scores, historical charts, and a daily news list; Python worker deployed on Railway (`IngestaoSentimento/`)
- **Responsive** — layout adapted for desktop and mobile devices

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 · React 18 |
| LLM | OpenAI GPT-4.1 (book and interviews) |
| Embeddings | OpenAI text-embedding-3-large (book and interviews) |
| Vector store | Pinecone — namespace `livro-amarelo-v2` (book) and `entrevistas` (YouTube) |
| Relational DB | Neon Postgres (serverless) |
| YouTube transcription | youtube-transcript-api (Python, CI) · youtube-transcript (Node, local) |
| CAPTCHA | Cloudflare Turnstile |
| Rate limit | @upstash/ratelimit · Sliding Window · Upstash Redis (serverless) · in-memory fallback (local dev) |
| Analytics | Google Analytics 4 |
| PDF parsing | pdf-parse |
| Data automation | GitHub Actions (weekly cron + manual trigger) |
| Image generation (bot) | canvas (node-canvas) · Inter TTF bundled in `public/fonts/` |
| Bot X/Twitter | Python 3.11 · Railway (multi-user worker) · X API v2 |
| Election sentiment | Python 3.11 · Railway (hourly cron) · OpenAI GPT-4o-mini · X API v2 · Polymarket API |
| Payments | Livepix (Pix) — webhook for automatic balance crediting |

---

## Project structure

```
livro-amarelo/
├── .github/
│   └── workflows/
│       ├── update-filiados.yml      # Weekly cron: updates membership (TSE) and deputies (Câmara API)
│       └── curate-videos.yml        # Daily at 18:00 BRT + manual trigger: curation + indexing of YouTube interviews
├── pages/
│   ├── index.js                     # Verification page (Turnstile)
│   ├── inicio.js                    # Q&A interface — Livro Amarelo
│   ├── renan-santos-responde.js     # Q&A interface — Interviews (Renan Responde)
│   ├── entrevistas.js               # Indexed interviews list + submission form
│   ├── deputados.js                 # Federal deputies by party and state
│   ├── filiados.js                  # Party membership by state
│   ├── sentimento.js                # 2026 election sentiment tracker
│   ├── metodologia-sentimento.js    # Scoring methodology (with live calculation demo)
│   ├── noticias-sentimento.js       # Daily news with sentiment classifications
│   ├── sobre.js                     # About page
│   ├── privacidade.js               # Privacy policy
│   ├── _app.js                      # App wrapper — global CSS + Google Analytics
│   └── api/
│       ├── chat.js                  # RAG + LLM — Livro Amarelo
│       ├── chat-entrevistas.js      # RAG + LLM — YouTube interviews (entrevistas namespace)
│       ├── session.js               # GET check session · POST create session cookie via Turnstile
│       ├── videos.js                # GET indexed list · POST suggestion submission
│       ├── deputados.js             # Deputies endpoint (Neon + join with filiados)
│       ├── filiados.js              # Party membership endpoint (Neon Postgres)
│       ├── sentimento.js            # Sentiment data per candidate (reads from Neon)
│       ├── noticias-sentimento.js   # Daily news with sentiment classifications
│       ├── tweets-sentimento.js     # Daily tweets per candidate
│       ├── bot/
│       │   ├── answer.js            # RAG for the bot — returns { answer, question, type } (X-Bot-Secret)
│       │   └── image.js             # Generates 1080px JPEG with node-canvas + Inter TTF (X-Bot-Secret)
│       └── livepix/
│           ├── create-payment.js    # Creates Pix charge via Livepix and stores reference in Neon
│           └── webhook.js           # Receives payment confirmation and credits user balance
├── hooks/
│   ├── useTurnstile.js              # React hook for the Turnstile widget
│   ├── useSessionGate.js            # React hook to verify session via cookie and redirect if invalid
│   ├── useDarkMode.js               # React hook for dark mode (default: on; persisted in localStorage)
│   └── usePullToRefresh.js          # React hook for pull-to-refresh on mobile devices
├── lib/
│   ├── turnstile.js                 # Server-side token verification
│   ├── session.js                   # HMAC-SHA256 session cookie generation and validation
│   ├── chunker.js                   # Text splitting and normalization (PDF)
│   ├── vectorStore.js               # Embedding storage and search (Pinecone)
│   └── rateLimiter.js               # IP-based rate limiting (shared across endpoints)
├── proxy.js                         # Next.js middleware: per-request nonce-based CSP; injects x-nonce header for _document and GA
├── curar-indexar.bat                # Interactive local menu for video management (curation + indexing)
├── scripts/
│   ├── process_videos_ci.py         # CI: curation + indexing in a single pass (Python); blocks configured channels; prefers BR → US proxies
│   ├── migrate_videos.mjs           # Create/update videos table in Neon
│   ├── curate_videos.mjs            # Curate pending videos via GPT-4.1-mini (local use)
│   ├── index_youtube.mjs            # Transcription, speaker filter, chunking, embeddings → Pinecone (local use)
│   ├── manage_videos.mjs            # Manual management: list, approve, reject and reset videos
│   ├── reset_entrevistas_index.mjs  # Delete Pinecone vectors and unindex videos in Neon
│   ├── lib/
│   │   └── transcript_cache.mjs     # Disk-based transcript cache (local use)
│   ├── aggregate_deputados.mjs      # Fetch deputies from Câmara API and insert into Neon
│   ├── aggregate_filiados.mjs       # Stream TSE CSV and insert into Neon
│   ├── index_pdf.mjs                # Index PDFs from data/books/
│   ├── generate_embeddings.mjs      # Generate embeddings for items without vectors
│   └── migrate_to_pinecone.mjs      # Upload vectors from store.json to Pinecone
├── styles/
│   └── globals.css                  # Color palette, reset and responsive classes
├── public/
│   ├── cover.png                    # Cover illustration
│   └── fonts/                       # Bundled Inter TTF for server-side image generation
│       ├── Inter-Regular.ttf
│       ├── Inter-Bold.ttf
│       ├── Inter-Italic.ttf
│       └── Inter-BoldItalic.ttf
├── BotTwitter2/                     # Multi-user Python worker — Bot X/Twitter (Railway)
│   ├── Procfile                     # worker: python main.py
│   ├── runtime.txt                  # python-3.11
│   ├── requirements.txt
│   ├── main.py                      # worker main loop
│   ├── run-local-worker.bat          # loads local .env and runs the worker on Windows
│   └── InevitavelGPT2/
│       ├── api.py                   # calls /api/bot/answer and /api/bot/image
│       ├── db.py                    # Neon connection
│       ├── worker.py                # multi-user orchestration
│       └── x_api.py                 # mention reads, media upload and reply
└── IngestaoSentimento/              # Python worker — 2026 election sentiment tracker (Railway)
    ├── railway.toml                 # hourly cron; startCommand = python main.py
    ├── main.py                      # orchestrator: RSS + Twitter + Polymarket
    └── coleta/
        ├── config.py                # candidate list and allowed RSS sources
        ├── classifier.py            # classify_texts_individual via OpenAI
        ├── db.py                    # Neon tables: upsert, query and migrations
        ├── rss.py                   # fetch Google News RSS per candidate
        ├── twitter.py               # fetch tweets via X API (since_id cursor)
        └── polymarket.py            # fetch odds via public Polymarket API
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
PINECONE_INDEX_LIVRO=your-index-name         # book index (3072 dim, text-embedding-3-large, namespace livro-amarelo-v2)
PINECONE_INDEX_ENTREVISTAS=your-index-name   # interviews index (3072 dim, text-embedding-3-large, namespace entrevistas)

# Enable RAG pipeline
USE_RAG=true

# Upstash Redis for distributed rate limiting
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# Neon Postgres
DATABASE_URL=postgresql://...

# Webshare (proxy for YouTube Transcript API — required for the Python CI script)
WEBSHARE_PROXY_USERNAME=...
WEBSHARE_PROXY_PASSWORD=...

# System prompts (used by scripts and API routes)
SYSTEM_PROMPT_CURADORIA=...
SYSTEM_PROMPT_QUERY_REWRITE_LIVRO=...
SYSTEM_PROMPT_QUERY_REWRITE_ENTREVISTAS=...

# Session secret (required)
APP_SESSION_SECRET=...

# YouTube channels blocked during curation (semicolon-separated terms)
BLOCKED_YOUTUBE_CHANNEL_NAMES=...

# Twitter bot — protects /api/bot/answer and /api/bot/image
BOT_API_SECRET=...

# Livepix (Pix payments — Bot X/Twitter)
LIVEPIX_CLIENT_ID=...
LIVEPIX_CLIENT_SECRET=...
LIVEPIX_WEBHOOK_SECRET=...     # required; protects /api/livepix/webhook
NEXT_PUBLIC_SITE_URL=https://www.inevitavelgpt.com  # used to build the checkout return URL
```

> **Pinecone:** the project uses two indexes. `PINECONE_INDEX_LIVRO`: dimension **3072**, compatible with `text-embedding-3-large`, namespace `livro-amarelo-v2` (Livro Amarelo). `PINECONE_INDEX_ENTREVISTAS`: dimension **3072**, compatible with `text-embedding-3-large`, namespace `entrevistas` (YouTube).

> **Neon:** the `videos` table is created/updated by `migrate_videos.mjs`. Run it once before indexing any interviews.

### Bot X/Twitter admin panel

The Bot X/Twitter admin panel was prepared as a separate application, intended for local execution and maintenance in a private repository. For security reasons, this public repository does not contain an admin page, `/api/.../admin` routes, admin authentication, an admin secret, or the panel files.

That external panel uses the same Neon database as this project to operate Bot X/Twitter access and billing. The implemented logic works with the `igpt2_users`, `igpt2_access_grants`, `igpt2_balance_events`, `igpt2_global_settings`, `igpt2_automation_runs`, `igpt2_automation_state`, and `igpt2_livepix_payments` tables.

External panel responsibilities:

- search users connected to Bot X/Twitter;
- change access status (`pending`, `approved`, `blocked`);
- add or remove balance in cents, recording events in `igpt2_balance_events`;
- configure the global response cost in `igpt2_global_settings` (`tweet_cost_cents`);
- inspect the latest operational logs persisted by the worker.

The public site only consumes this data: the user page shows balance, response cost, and recent history; the `BotTwitter2/` worker enforces access status, checks balance, and debits the configured database cost for each published reply.

### 3. Index the Livro Amarelo

```bash
# Place the PDF in data/books/ and run:
npm run index:pdf

# Re-index from scratch
npm run index:pdf -- --reindex

# Upload vectors to Pinecone
node scripts/migrate_to_pinecone.mjs
```

### 4. Set up YouTube interviews

```bash
# Create the table in Neon
node scripts/migrate_videos.mjs

# Insert a video manually (or via the form on /entrevistas)
# then run the full pipeline locally:
node scripts/curate_videos.mjs    # AI curation
node scripts/index_youtube.mjs    # transcription + embeddings → Pinecone
```

To manage videos locally on Windows, run `curar-indexar.bat` — an interactive menu (options 1–7) with automatic curation, manual curation, indexing, rejection and curation/index reset. Option 7 opens a sub-menu with 4 reset variants.

In CI, the `curate-videos.yml` workflow uses `scripts/process_videos_ci.py` — a Python script that handles curation and indexing in a single pass (no redundant transcript download). It runs automatically every day at 18:00 BRT and can also be triggered manually in GitHub Actions.

### 5. Populate party membership and deputies

```bash
# TSE membership data
curl -L -o filiacao.zip "https://cdn.tse.jus.br/estatistica/sead/odsele/filiacao_partidaria/perfil_filiacao_partidaria.zip"
mkdir -p tse_data && unzip filiacao.zip -d tse_data/
node scripts/aggregate_filiados.mjs ./tse_data
rm -rf filiacao.zip tse_data/

# Federal deputies
node scripts/aggregate_deputados.mjs
```

After the initial load, the `update-filiados.yml` workflow updates both automatically every Monday at 08:00 BRT.

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
┌───────────────────────────────────────────────┐
│  /  — Turnstile Verification                  │  Solve CAPTCHA → click "Enter"
└─────────────┬─────────────────────────────────┘
              │ POST /api/session → HttpOnly cookie ia_session (HMAC-SHA256, TTL 1h)
              ▼
┌─────────────────────────────────────────────────────────┐
│  /inicio — Q&A Livro Amarelo                            │
│  /renan-santos-responde — Renan Responde (interviews)   │
└─────────────┬───────────────────────────────────────────┘
              │ GET /api/session validates cookie; redirects to / if invalid
              │ ia_session cookie sent automatically by the browser
              ▼
┌───────────────────────────────────────────┐
│  /api/chat  or  /api/chat-entrevistas     │
│  1. Verify session (cookie) or Turnstile  │
│  2. Rate limit per IP (min + day)         │
│  3. Rewrite query + generate embeddings   │
│  4. Retrieve and re-rank chunks (Pinecone)│
│  5. Build prompt with context             │
│  6. GPT-4.1 responds via streaming        │
└─────────────┬─────────────────────────────┘
              │
              ▼
        Answer with inline citations [1][2]
        + source list with links to the exact moment in YouTube

┌───────────────────────────────────────────┐
│  /entrevistas — List + submission         │
│  Search by title or channel               │
│  Link suggestion form                     │
│  Turnstile + rate limit per request       │
└───────────────────────────────────────────┘

┌───────────────────────────────────────────┐
│  GitHub Actions — curate-videos.yml       │  daily 18:00 BRT + manual trigger
│  process_videos_ci.py                     │
│  Phase 1: videos pending curation         │
│     Transcript (pt-BR → pt → en)          │
│     GPT evaluates → approve or reject     │
│     If approved: index in same pass       │
│  Phase 2: approved but not yet indexed    │
│     Transcript → speaker filter (GPT)     │
│     Sentence-boundary chunking            │
│     Embeddings → Pinecone (entrevistas)   │
│     Save title, channel and date to Neon  │
└───────────────────────────────────────────┘

┌───────────────────────────────────────────┐
│  GitHub Actions — update-filiados.yml     │  every Monday at 08:00 BRT
│  Membership: TSE ZIP → stream → Neon      │
│  Deputies: Câmara API → Neon              │
└───────────────────────────────────────────┘
```

---

## Multi-user Bot X/Twitter

The `BotTwitter2/` directory contains the **Python worker** deployed on **Railway** for operating Bot X/Twitter with authenticated user accounts. Users connect their X/Twitter account to identify themselves — the worker monitors mentions to **@Inevitavel_Bot** and processes only those from approved accounts, publishing replies from the **@Inevitavel_Bot** profile using the bot's own OAuth 1.0a credentials.

The worker reads mentions to @Inevitavel_Bot via OAuth 1.0a and only processes tweets that contain the keyword configured in `INEVITAVEL_GPT_KEYWORD` together with "livro amarelo" or "renan santos", and whose author is in the list of approved accounts with sufficient balance. It then generates the RAG answer, creates the image, and publishes the reply from @Inevitavel_Bot.

For local testing on Windows, configure `BotTwitter2/InevitavelGPT2/.env` and run `BotTwitter2/run-local-worker.bat`. The script can also load variables from the root `.env.local` when needed.

### How it works

```
User connects their own X/Twitter account at /inevitavelgpt2
  │
  ▼
OAuth callback saves user, access status, and state in Neon
  │
  ▼
BotTwitter2 Railway/local worker (main.py — periodic loop)
  │ selects approved accounts with enough balance
  │ reads mentions to @Inevitavel_Bot
  │
  ├─ No new mentions → wait for next cycle
  │
  ▼
worker.py
  │ skips mentions from non-approved authors or with insufficient balance
  │ requires configured keyword + eligible topic
  │ extracts question + type (livro | entrevistas)
  │
  ▼
POST /api/bot/answer  (Vercel · X-Bot-Secret)
  │ same RAG pipeline as the web chat
  ▼
POST /api/bot/image   (Vercel · X-Bot-Secret)
  │ node-canvas + bundled Inter TTF → 1080px JPEG
  ▼
OAuth 1.0a @Inevitavel_Bot: media upload + reply to original tweet
  │
  ▼
balance debited in igpt2_access_grants
event recorded in igpt2_balance_events
summary run recorded in igpt2_automation_runs
global cursor updated in igpt2_global_settings (bot_mentions_since_id)
```

### Deploy on Railway

1. Connect the repository to Railway and set the **root directory** to `BotTwitter2/`.
2. No state volume is required: `BotTwitter2/` persists state in Neon.
3. Set the environment variables below in the Railway dashboard.

### Environment variables — Railway

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon URL used by the site and the worker |
| `X_CLIENT_ID` | X/Twitter OAuth 2.0 Client ID |
| `X_CLIENT_SECRET` | X/Twitter OAuth 2.0 Client Secret, when applicable |
| `BOT_API_URL` | Full URL of `/api/bot/answer` on Vercel or locally (e.g. `https://www.inevitavelgpt.com/api/bot/answer`) |
| `BOT_API_SECRET` | Same value as `BOT_API_SECRET` set on Vercel |
| `INEVITAVEL_GPT_KEYWORD` | Required keyword in the tweet (e.g. `GPT`); no default |
| `IGPT2_BOT_HANDLE` | Handle of the bot that publishes replies (e.g. `@Inevitavel_Bot`); required |
| `BOT_CONSUMER_KEY` | X/Twitter app API Key for the bot (OAuth 1.0a) |
| `BOT_CONSUMER_SECRET` | X/Twitter app API Key Secret for the bot (OAuth 1.0a) |
| `BOT_ACCESS_TOKEN` | Access Token for the @Inevitavel_Bot profile (OAuth 1.0a) |
| `BOT_ACCESS_TOKEN_SECRET` | Access Token Secret for the @Inevitavel_Bot profile (OAuth 1.0a) |
| `IGPT2_WORKER_INTERVAL_SECONDS` | Optional interval in seconds; defaults: local `60`, Railway `300` |

> `BOT_API_SECRET` must also be set in **Vercel** environment variables — it protects both `/api/bot/answer` and `/api/bot/image`.

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
| `node scripts/migrate_videos.mjs` | Create/update videos table in Neon |
| `node scripts/curate_videos.mjs` | Curate pending videos |
| `node scripts/index_youtube.mjs` | Index approved interviews into Pinecone |
| `node scripts/manage_videos.mjs --list-pending` | List videos pending curation |
| `node scripts/manage_videos.mjs --list-all` | List all videos with their status |
| `node scripts/manage_videos.mjs --manual-curate` | Manually curate a specific video |
| `node scripts/manage_videos.mjs --reject-curated` | Manually reject an already approved video |
| `node scripts/manage_videos.mjs --reset-curation-all` | Reset curation for all videos (Pinecone vectors kept) |
| `node scripts/manage_videos.mjs --reset-curation-video` | Reset curation for a specific video (Pinecone vectors kept) |
| `node scripts/reset_entrevistas_index.mjs` | Delete Pinecone vectors and unindex all videos |
| `curar-indexar.bat` | Interactive local menu with all the options above (Windows) |
| `node scripts/migrate_to_pinecone.mjs` | Upload vectors from store.json to Pinecone |
| `node scripts/aggregate_filiados.mjs ./tse_data` | Process TSE CSV and insert into Neon |
| `node scripts/aggregate_deputados.mjs` | Fetch deputies from Câmara API and insert into Neon |

---

## 2026 Election Sentiment Tracker (IngestaoSentimento)

The `IngestaoSentimento/` directory contains the **Python worker** deployed on **Railway** that collects and classifies sentiment data for the 2026 election tracker.

### What it collects

- **RSS** — Google News per candidate; articles classified individually by GPT as positive, neutral, or negative; only articles published on the current UTC day are processed
- **Twitter/X** — tweets mentioning each candidate, collected via X API v2 with a `since_id` cursor to avoid reprocessing
- **Polymarket** — win odds per candidate via the public Polymarket API

### Scoring method

Each source produces a score adjusted for confidence (data volume):

```
raw        = (% positive − % negative + 100) ÷ 2   [scale 0–100]
confidence = min(volume / 30, 1)                    [caps at 30 items]
adjusted   = 50 + (raw − 50) × confidence
```

Overall score: weighted average of available sources — **Polymarket 80% · News 10% · Twitter 10%**.

### Schedule

The worker runs every hour (`0 * * * *` on Railway). Twitter is collected only at the hours configured in `TWITTER_UTC_HOURS` (default: `15,18,21` = 12:00, 15:00, 18:00 BRT).

### Environment variables — Railway (IngestaoSentimento)

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon — same database as the site |
| `OPENAI_API_KEY` | For sentiment classification (GPT-4o-mini) |
| `TWITTER_BEARER_TOKEN` | X API v2 bearer token |
| `TWITTER_UTC_HOURS` | UTC hours for Twitter collection (default: `15,18,21`) |

### Deploy on Railway

1. Connect the repository to Railway and set the **root directory** to `IngestaoSentimento/`.
2. Set the environment variables above.
3. `railway.toml` already defines the cron schedule and start command.

---

<div align="center">

**InevitávelGPT · O Futuro é Glorioso**

</div>
