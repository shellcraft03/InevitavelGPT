import logging
from coleta.config import CANDIDATES

log = logging.getLogger(__name__)


def ensure_tables(conn):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS eleicoes_candidatos (
                slug    VARCHAR(50) PRIMARY KEY,
                nome    VARCHAR(100) NOT NULL,
                partido VARCHAR(50),
                ativo   BOOLEAN DEFAULT TRUE
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS eleicoes_sentimento (
                id              SERIAL PRIMARY KEY,
                candidato_slug  VARCHAR(50) NOT NULL REFERENCES eleicoes_candidatos(slug),
                fonte           VARCHAR(30) NOT NULL,
                data            DATE NOT NULL,
                positivo        NUMERIC(5,2),
                neutro          NUMERIC(5,2),
                negativo        NUMERIC(5,2),
                volume          INTEGER,
                pos_count       INTEGER DEFAULT 0,
                neu_count       INTEGER DEFAULT 0,
                neg_count       INTEGER DEFAULT 0,
                score_tendencia NUMERIC(8,2),
                odds            NUMERIC(6,4),
                atualizado_em   TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(candidato_slug, fonte, data)
            )
        """)
        # Migration: add count columns if missing
        cur.execute("""
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'eleicoes_sentimento' AND column_name = 'pos_count'
                ) THEN
                    ALTER TABLE eleicoes_sentimento
                        ADD COLUMN pos_count INTEGER DEFAULT 0,
                        ADD COLUMN neu_count INTEGER DEFAULT 0,
                        ADD COLUMN neg_count INTEGER DEFAULT 0;
                END IF;
            END $$
        """)
        # Migration: back-fill count columns from percentages for old rows
        cur.execute("""
            UPDATE eleicoes_sentimento
            SET
                pos_count = ROUND(COALESCE(positivo, 0) * volume / 100),
                neu_count = ROUND(COALESCE(neutro,   0) * volume / 100),
                neg_count = ROUND(COALESCE(negativo, 0) * volume / 100)
            WHERE pos_count = 0 AND neu_count = 0 AND neg_count = 0
              AND volume IS NOT NULL AND volume > 0
        """)
        # Migration: drop old single-table design if it has candidato_slug column
        cur.execute("""
            DO $$ BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'eleicoes_noticias' AND column_name = 'candidato_slug'
                ) THEN
                    DROP TABLE eleicoes_noticias CASCADE;
                END IF;
            END $$
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS eleicoes_noticias (
                id             SERIAL PRIMARY KEY,
                data           DATE NOT NULL,
                titulo         TEXT NOT NULL,
                url            TEXT,
                jornal         VARCHAR(200),
                published_date DATE,
                coletado_em    TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        # Migration: add published_date column if missing
        cur.execute("""
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'eleicoes_noticias' AND column_name = 'published_date'
                ) THEN
                    ALTER TABLE eleicoes_noticias ADD COLUMN published_date DATE;
                END IF;
            END $$
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS eleicoes_noticias_classificacoes (
                id             SERIAL PRIMARY KEY,
                noticia_id     INTEGER NOT NULL REFERENCES eleicoes_noticias(id) ON DELETE CASCADE,
                candidato_slug VARCHAR(50) NOT NULL REFERENCES eleicoes_candidatos(slug),
                sentimento     VARCHAR(10) NOT NULL,
                relevante      BOOLEAN DEFAULT FALSE,
                UNIQUE(noticia_id, candidato_slug)
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS eleicoes_twitter_cursors (
                candidato_slug VARCHAR(50) PRIMARY KEY REFERENCES eleicoes_candidatos(slug),
                since_id       TEXT NOT NULL,
                atualizado_em  TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS eleicoes_tweets (
                id             SERIAL PRIMARY KEY,
                tweet_id       TEXT NOT NULL,
                candidato_slug VARCHAR(50) NOT NULL REFERENCES eleicoes_candidatos(slug),
                data           DATE NOT NULL,
                texto          TEXT NOT NULL,
                sentimento     VARCHAR(10),
                coletado_em    TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(tweet_id, candidato_slug)
            )
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_tweets_slug_data
            ON eleicoes_tweets (candidato_slug, data)
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_noticias_data
            ON eleicoes_noticias (data)
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_classificacoes_slug_relevante
            ON eleicoes_noticias_classificacoes (candidato_slug, relevante)
        """)
        for c in CANDIDATES:
            cur.execute("""
                INSERT INTO eleicoes_candidatos (slug, nome, partido)
                VALUES (%s, %s, %s)
                ON CONFLICT (slug) DO UPDATE
                    SET nome = EXCLUDED.nome, partido = EXCLUDED.partido
            """, (c["slug"], c["nome"], c["partido"]))
    conn.commit()
    log.info("Tables ready")


def clear_rss_today(conn, date):
    """Deletes all RSS news and sentiment for the given date so they can be reprocessed."""
    with conn.cursor() as cur:
        cur.execute("""
            DELETE FROM eleicoes_noticias_classificacoes
            WHERE noticia_id IN (
                SELECT id FROM eleicoes_noticias WHERE data = %s
            )
        """, (date,))
        cur.execute("DELETE FROM eleicoes_noticias WHERE data = %s", (date,))
        cur.execute(
            "DELETE FROM eleicoes_sentimento WHERE fonte = 'rss' AND data = %s",
            (date,)
        )
    conn.commit()
    log.info(f"RSS data cleared for {date}")


def get_existing_news_urls(conn, date):
    """Returns set of URLs already stored for the given date."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT url FROM eleicoes_noticias WHERE data = %s AND url IS NOT NULL",
            (date,)
        )
        return {row[0] for row in cur.fetchall()}


def insert_noticias(conn, date, articles):
    with conn.cursor() as cur:
        for article in articles:
            cur.execute(
                """INSERT INTO eleicoes_noticias (data, titulo, url, jornal, published_date)
                   VALUES (%s, %s, %s, %s, %s) RETURNING id""",
                (date,
                 article["titulo"][:500],
                 article["url"][:1000] if article.get("url") else None,
                 article["jornal"][:200] if article.get("jornal") else None,
                 article.get("published_date")),
            )
            noticia_id = cur.fetchone()[0]
            for slug, sentimento in article["classifications"].items():
                relevante = slug in article.get("relevante_para", set())
                cur.execute(
                    """INSERT INTO eleicoes_noticias_classificacoes
                           (noticia_id, candidato_slug, sentimento, relevante)
                       VALUES (%s, %s, %s, %s)
                       ON CONFLICT (noticia_id, candidato_slug) DO UPDATE
                           SET sentimento = EXCLUDED.sentimento,
                               relevante  = EXCLUDED.relevante""",
                    (noticia_id, slug, sentimento, relevante),
                )


def compute_rss_sentiment(conn, date):
    """Recomputes RSS sentiment from stored articles for the given date.
    Returns {slug: {pos, neu, neg, total}} based on eleicoes_noticias_classificacoes."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT
                nc.candidato_slug,
                COUNT(*) FILTER (WHERE nc.sentimento = 'positivo') AS pos,
                COUNT(*) FILTER (WHERE nc.sentimento = 'neutro')    AS neu,
                COUNT(*) FILTER (WHERE nc.sentimento = 'negativo')  AS neg,
                COUNT(*)                                             AS total
            FROM eleicoes_noticias n
            JOIN eleicoes_noticias_classificacoes nc ON nc.noticia_id = n.id
            WHERE n.data = %s AND nc.relevante = TRUE
            GROUP BY nc.candidato_slug
        """, (date,))
        return {
            row[0]: {'pos': row[1], 'neu': row[2], 'neg': row[3], 'total': row[4]}
            for row in cur.fetchall()
        }


def insert_tweets(conn, date, slug, tweets):
    """tweets: list of {tweet_id, texto, sentimento}"""
    with conn.cursor() as cur:
        for t in tweets:
            cur.execute("""
                INSERT INTO eleicoes_tweets (tweet_id, candidato_slug, data, texto, sentimento)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (tweet_id, candidato_slug) DO UPDATE SET
                    sentimento = EXCLUDED.sentimento
            """, (t['tweet_id'], slug, date, t['texto'][:1000], t['sentimento']))


def compute_twitter_sentiment(conn, date):
    """Recomputes Twitter sentiment from stored tweets for the given date."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT
                candidato_slug,
                COUNT(*) FILTER (WHERE sentimento = 'positivo') AS pos,
                COUNT(*) FILTER (WHERE sentimento = 'neutro')    AS neu,
                COUNT(*) FILTER (WHERE sentimento = 'negativo')  AS neg,
                COUNT(*) AS total
            FROM eleicoes_tweets
            WHERE data = %s AND sentimento IS NOT NULL
            GROUP BY candidato_slug
        """, (date,))
        return {
            row[0]: {'pos': row[1], 'neu': row[2], 'neg': row[3], 'total': row[4]}
            for row in cur.fetchall()
        }


def get_twitter_cursors(conn):
    """Returns {slug: since_id} for all candidates that have a cursor."""
    with conn.cursor() as cur:
        cur.execute("SELECT candidato_slug, since_id FROM eleicoes_twitter_cursors")
        return {row[0]: row[1] for row in cur.fetchall()}


def save_twitter_cursor(conn, slug, since_id):
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO eleicoes_twitter_cursors (candidato_slug, since_id)
            VALUES (%s, %s)
            ON CONFLICT (candidato_slug) DO UPDATE SET
                since_id      = EXCLUDED.since_id,
                atualizado_em = NOW()
        """, (slug, since_id))


def upsert_sentiment(conn, slug, fonte, date, pos, neu, neg, vol,
                     score_tendencia=None, odds=None, accumulate=False):
    total = pos + neu + neg
    pct_pos = round(pos / total * 100, 2) if total else None
    pct_neu = round(neu / total * 100, 2) if total else None
    pct_neg = round(neg / total * 100, 2) if total else None
    with conn.cursor() as cur:
        if accumulate and total > 0:
            cur.execute("""
                INSERT INTO eleicoes_sentimento
                    (candidato_slug, fonte, data,
                     positivo, neutro, negativo, volume,
                     pos_count, neu_count, neg_count,
                     score_tendencia, odds, atualizado_em)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (candidato_slug, fonte, data) DO UPDATE SET
                    pos_count     = eleicoes_sentimento.pos_count + EXCLUDED.pos_count,
                    neu_count     = eleicoes_sentimento.neu_count + EXCLUDED.neu_count,
                    neg_count     = eleicoes_sentimento.neg_count + EXCLUDED.neg_count,
                    volume        = eleicoes_sentimento.volume + EXCLUDED.volume,
                    positivo      = ROUND(
                                      (eleicoes_sentimento.pos_count + EXCLUDED.pos_count)::numeric
                                      / NULLIF(eleicoes_sentimento.volume + EXCLUDED.volume, 0) * 100, 2),
                    neutro        = ROUND(
                                      (eleicoes_sentimento.neu_count + EXCLUDED.neu_count)::numeric
                                      / NULLIF(eleicoes_sentimento.volume + EXCLUDED.volume, 0) * 100, 2),
                    negativo      = ROUND(
                                      (eleicoes_sentimento.neg_count + EXCLUDED.neg_count)::numeric
                                      / NULLIF(eleicoes_sentimento.volume + EXCLUDED.volume, 0) * 100, 2),
                    atualizado_em = NOW()
            """, (slug, fonte, date, pct_pos, pct_neu, pct_neg, total,
                  pos, neu, neg, score_tendencia, odds))
        else:
            cur.execute("""
                INSERT INTO eleicoes_sentimento
                    (candidato_slug, fonte, data, positivo, neutro, negativo, volume,
                     pos_count, neu_count, neg_count,
                     score_tendencia, odds, atualizado_em)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (candidato_slug, fonte, data) DO UPDATE SET
                    positivo        = EXCLUDED.positivo,
                    neutro          = EXCLUDED.neutro,
                    negativo        = EXCLUDED.negativo,
                    volume          = EXCLUDED.volume,
                    pos_count       = EXCLUDED.pos_count,
                    neu_count       = EXCLUDED.neu_count,
                    neg_count       = EXCLUDED.neg_count,
                    score_tendencia = EXCLUDED.score_tendencia,
                    odds            = EXCLUDED.odds,
                    atualizado_em   = NOW()
            """, (slug, fonte, date, pct_pos, pct_neu, pct_neg,
                  vol if total else None, pos, neu, neg, score_tendencia, odds))
