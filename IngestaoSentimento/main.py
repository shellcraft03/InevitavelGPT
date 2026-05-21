#!/usr/bin/env python3
import os
import sys
import logging
import datetime
import psycopg2

from coleta.config import CANDIDATES
from coleta.db import (ensure_tables, upsert_sentiment, insert_noticias,
                        get_twitter_cursors, save_twitter_cursor,
                        get_existing_news_urls, compute_rss_sentiment,
                        insert_tweets, compute_twitter_sentiment)
from coleta.rss import fetch_rss
from coleta.classifier import classify_texts, classify_texts_individual
from coleta.twitter import fetch_twitter
from coleta.polymarket import fetch_polymarket

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger(__name__)


def _run_twitter_now():
    if "--skip-twitter" in sys.argv:
        return False
    if "--twitter-only" in sys.argv:
        return True
    raw = os.environ.get("TWITTER_UTC_HOURS", "15,18,21")
    hours = {int(h.strip()) for h in raw.split(",") if h.strip()}
    return datetime.datetime.now(datetime.timezone.utc).hour in hours


def main():
    run_twitter  = _run_twitter_now()
    twitter_only = "--twitter-only" in sys.argv
    BRT = datetime.timezone(datetime.timedelta(hours=-3))
    today = datetime.datetime.now(BRT).date()
    conn = psycopg2.connect(os.environ["DATABASE_URL"])

    try:
        ensure_tables(conn)

        # ── RSS ──────────────────────────────────────────────────────────────
        if twitter_only:
            log.info("Modo --twitter-only: pulando RSS e Polymarket")
        if not twitter_only:
            rss_data = fetch_rss()

            # Collect unique articles (by URL) across all candidate searches
            seen_urls = {}   # url -> article dict with relevante_para set
            ordered = []     # insertion-order list of unique articles

            for c in CANDIDATES:
                for item in rss_data.get(c["slug"], []):
                    url = item.get("url", "") or item.get("title", "")
                    if url not in seen_urls:
                        seen_urls[url] = {
                            "titulo":        item.get("title", ""),
                            "text":          item.get("text", item.get("title", "")),
                            "url":           item.get("url", ""),
                            "jornal":        item.get("jornal", ""),
                            "relevante_para": set(),
                            "classifications": {},
                        }
                        ordered.append(seen_urls[url])
                    seen_urls[url]["relevante_para"].add(c["slug"])

            if ordered:
                existing_urls = get_existing_news_urls(conn, today)
                new_articles = [
                    a for a in ordered
                    if not a.get("url") or a["url"] not in existing_urls
                ]
                log.info(f"RSS: {len(ordered)} coletados, {len(new_articles)} novos, {len(ordered) - len(new_articles)} já avaliados")

                if new_articles:
                    # Classify only new articles, per candidate
                    for c in CANDIDATES:
                        relevant = [a for a in new_articles if c["slug"] in a["relevante_para"]]
                        if not relevant:
                            continue
                        texts = [a["text"] for a in relevant]
                        sentiments = classify_texts_individual(texts, c["nome"], c.get("contexto", ""))
                        for article, sentiment in zip(relevant, sentiments):
                            article["classifications"][c["slug"]] = sentiment

                    insert_noticias(conn, today, new_articles)

                # Recompute RSS sentiment from all articles stored for today
                daily = compute_rss_sentiment(conn, today)
                for c in CANDIDATES:
                    t = daily.get(c["slug"])
                    if t and t["total"] > 0:
                        upsert_sentiment(conn, c["slug"], "rss", today,
                                         t["pos"], t["neu"], t["neg"], t["total"])
                        log.info(f"RSS {c['slug']}: +{t['pos']} ~{t['neu']} -{t['neg']} / {t['total']}")

        # ── Twitter ──────────────────────────────────────────────────────────
        if not run_twitter:
            log.info("Twitter: fora do horário configurado, pulado")
        else:
            cursors = {} if "--no-cursor" in sys.argv else get_twitter_cursors(conn)
            twitter_data, new_cursors = fetch_twitter(cursors)
            for c in CANDIDATES:
                items = twitter_data[c["slug"]]  # list of {tweet_id, texto}
                if items:
                    texts = [it["texto"] for it in items]
                    sentiments = classify_texts_individual(texts, c["nome"], c.get("contexto", ""))
                    for item, sentiment in zip(items, sentiments):
                        item["sentimento"] = sentiment
                    insert_tweets(conn, today, c["slug"], items)
                    if c["slug"] in new_cursors:
                        save_twitter_cursor(conn, c["slug"], new_cursors[c["slug"]])
                    log.info(f"Twitter {c['slug']}: {len(items)} tweets novos salvos")
                else:
                    log.info(f"Twitter {c['slug']}: nenhum tweet novo desde o último cursor")

            # Recompute Twitter sentiment from all stored tweets for today
            daily_tw = compute_twitter_sentiment(conn, today)
            for c in CANDIDATES:
                t = daily_tw.get(c["slug"])
                if t and t["total"] > 0:
                    upsert_sentiment(conn, c["slug"], "twitter", today,
                                     t["pos"], t["neu"], t["neg"], t["total"])
                    log.info(f"Twitter {c['slug']}: total dia +{t['pos']} ~{t['neu']} -{t['neg']} / {t['total']}")

        # ── Polymarket ───────────────────────────────────────────────────────
        if not twitter_only:
            pm = fetch_polymarket()
            if pm:
                for c in CANDIDATES:
                    odds = pm.get(c["slug"])
                    if odds is not None:
                        upsert_sentiment(conn, c["slug"], "polymarket", today,
                                         0, 0, 0, 0, odds=odds)

        log.info("Done.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
