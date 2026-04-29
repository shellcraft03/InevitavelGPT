<div align="center">

# 📙 o Livro Amarelo — Q&A

**Sistema de perguntas e respostas sobre o Programa de Governo de Arthur do Val para São Paulo.**

Powered by RAG (Retrieval-Augmented Generation) com OpenAI · Protegido por Cloudflare Turnstile

---

![Paleta](https://img.shields.io/badge/cor-FCBF22-FCBF22?style=flat-square&labelColor=000000)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o--mini-412991?style=flat-square&logo=openai)
![License](https://img.shields.io/badge/licença-MIT-white?style=flat-square)

</div>

---

## O que é

O **Livro Amarelo Q&A** é uma aplicação web que permite explorar o Programa de Governo *Muda São Paulo* de Arthur do Val por meio de perguntas em linguagem natural. O sistema indexa o PDF do programa, gera embeddings semânticos e usa um modelo de linguagem para responder com base exclusivamente no conteúdo do documento — citando páginas e capítulos como fonte.

As respostas são formatadas em parágrafos de até 140 caracteres, prontas para serem compartilhadas como thread no X (Twitter).

---

## Funcionalidades

- **RAG completo** — busca semântica por embeddings + geração de resposta contextualizada
- **Proteção por CAPTCHA** — Cloudflare Turnstile com token por requisição
- **Rate limiting** — por IP, com suporte a Redis ou fallback em memória
- **Fallback de embeddings** — tenta múltiplos modelos; usa busca textual se nenhum estiver disponível
- **Upload de PDF** — endpoint para indexar novos documentos com validação de tipo e tamanho
- **Respostas concretas** — o prompt instrui o modelo a não incluir frases genéricas

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 16 · React 18 |
| LLM | OpenAI GPT-4o-mini |
| Embeddings | OpenAI text-embedding-3-small |
| Vector store | JSON file-based (local) |
| CAPTCHA | Cloudflare Turnstile |
| Rate limit | In-memory · Redis (opcional) |
| PDF parsing | pdf-parse |

---

## Estrutura do projeto

```
livro-amarelo/
├── pages/
│   ├── index.js          # Página de verificação (Turnstile)
│   ├── qa.js             # Interface de perguntas e respostas
│   ├── _app.js           # App wrapper com CSS global
│   └── api/
│       ├── chat.js       # Endpoint principal RAG + LLM
│       └── ingest-pdf.js # Endpoint de upload e indexação de PDF
├── hooks/
│   └── useTurnstile.js   # Hook React para o widget Turnstile
├── lib/
│   ├── turnstile.js      # Verificação server-side do token
│   ├── chunker.js        # Divisão e normalização de texto
│   ├── vectorStore.js    # Armazenamento e busca de embeddings
│   └── rateLimiter.js    # Rate limiting por IP
├── scripts/
│   ├── index_pdf.mjs         # Indexar PDFs da pasta data/books/
│   └── generate_embeddings.mjs  # Gerar embeddings para itens sem vetor
├── styles/
│   └── globals.css       # Paleta de cores e reset global
├── public/
│   └── cover.png         # Ilustração da capa
└── data/
    ├── books/            # PDFs fonte (não versionados)
    └── store.json        # Vector store local (não versionado)
```

---

## Configuração

### 1. Instalar dependências

```bash
npm install
```

### 2. Variáveis de ambiente

Crie um arquivo `.env.local` na raiz com as seguintes chaves:

```env
# OpenAI
OPENAI_API_KEY=sk-...

# Cloudflare Turnstile
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x...
TURNSTILE_SECRET=0x...

# Habilitar pipeline RAG
USE_RAG=true

# Modelo de embedding (opcional — padrão: text-embedding-3-small)
# EMBEDDING_MODEL=text-embedding-3-small
```

> **Atenção:** o projeto OpenAI precisa ter acesso ao modelo `text-embedding-3-small`. Verifique em *platform.openai.com → Projects → Model access*.

### 3. Indexar o PDF

Coloque o PDF do programa de governo em `data/books/` e execute:

```bash
# Primeira indexação
npm run index:pdf

# Re-indexar do zero (limpa o store antes)
npm run index:pdf -- --reindex
```

### 4. Gerar embeddings

Se a indexação salvou itens sem embedding (falha na API), preencha-os:

```bash
npm run generate:embeddings
```

O script faz um preflight check e informa se o modelo não está acessível antes de processar todos os itens.

### 5. Iniciar o servidor

```bash
npm run dev      # desenvolvimento
npm run build && npm start  # produção
```

---

## Fluxo da aplicação

```
Usuário
  │
  ▼
┌─────────────────────────────┐
│  /  — Verificação Turnstile │  Resolve o CAPTCHA → clica "Entrar"
└──────────────┬──────────────┘
               │ token salvo em sessionStorage
               ▼
┌─────────────────────────────┐
│  /qa — Interface Q&A        │  Digita pergunta → Enter ou botão
└──────────────┬──────────────┘
               │ token fresco gerado por requisição
               ▼
┌─────────────────────────────┐
│  /api/chat                  │
│  1. Verifica Turnstile      │
│  2. Rate limit por IP       │
│  3. Embed a pergunta        │
│  4. Busca top-6 chunks      │
│  5. Monta prompt com ctx    │
│  6. GPT-4o-mini responde    │
└──────────────┬──────────────┘
               │
               ▼
         Resposta + fontes
```

---

## Scripts disponíveis

| Comando | Descrição |
|---|---|
| `npm run dev` | Servidor de desenvolvimento na porta 3000 |
| `npm run build` | Build de produção |
| `npm start` | Servidor de produção |
| `npm run index:pdf` | Indexar PDFs em `data/books/` |
| `npm run index:pdf -- --reindex` | Limpar store e re-indexar |
| `npm run generate:embeddings` | Preencher embeddings nulos |

---

## Identidade visual

A paleta segue a identidade do Livro Amarelo:

| Token | Hex | Uso |
|---|---|---|
| Amarelo | `#FCBF22` | Cor primária, botões, destaques |
| Preto | `#000000` | Texto, bordas, header |
| Branco | `#FFFFFF` | Fundos de cards, texto sobre preto |
| Cinza claro | `#F2F2F2` | Fundo da página Q&A |

---

<div align="center">

**São Paulo · Programa de Governo 2021–2024**

</div>
