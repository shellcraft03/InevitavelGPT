import re
import datetime
import logging
import unicodedata
import urllib.parse
import feedparser
from coleta.config import CANDIDATES, ALLOWED_RSS_SOURCES

log = logging.getLogger(__name__)


def strip_html(text):
    return re.sub(r"<[^>]+>", " ", text or "").strip()


def _normalize(text):
    nfkd = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in nfkd if not unicodedata.combining(c))

_ALLOWED_NORMALIZED = {_normalize(t) for t in ALLOWED_RSS_SOURCES}

def _source_allowed(source_title):
    if not source_title:
        return False
    normalized = _normalize(source_title)
    return any(term in normalized for term in _ALLOWED_NORMALIZED)


def _google_news_url(termos):
    query = ' OR '.join(f'"{t}"' for t in termos)
    return (
        "https://news.google.com/rss/search"
        f"?q={urllib.parse.quote(query)}&hl=pt-BR&gl=BR&ceid=BR:pt-419"
    )


def _fetch_feed(url, label):
    """Fetches a Google News RSS feed and returns today's allowed articles."""
    today = datetime.date.today()
    articles = []
    try:
        feed = feedparser.parse(url)
        for entry in feed.entries[:100]:
            published = entry.get("published_parsed") or entry.get("updated_parsed")
            if not published:
                continue
            entry_date = datetime.date(published.tm_year, published.tm_mon, published.tm_mday)
            if entry_date != today:
                continue
            text = (
                strip_html(entry.get("title", ""))
                + " "
                + strip_html(entry.get("summary", ""))
            ).strip()
            if not text:
                continue
            source = entry.get("source") or {}
            jornal = source.get("title", "")
            if not _source_allowed(jornal):
                continue
            articles.append({
                "title":          strip_html(entry.get("title", "")),
                "url":            entry.get("link", ""),
                "jornal":         jornal,
                "text":           text,
                "published_date": entry_date,
            })
        log.info(f"RSS {label}: {len(articles)} artigos hoje")
    except Exception as e:
        log.warning(f"RSS {label}: {e}")
    return articles


def fetch_rss():
    """Returns dict: slug -> list of articles."""
    result = {c["slug"]: [] for c in CANDIDATES}
    for c in CANDIDATES:
        result[c["slug"]] = _fetch_feed(_google_news_url(c["termos"]), c["slug"])
    return result
