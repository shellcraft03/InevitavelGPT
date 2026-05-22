import os
import logging
import requests
from coleta.config import CANDIDATES

log = logging.getLogger(__name__)

_SEARCH_URL = "https://api.twitter.com/2/tweets/search/recent"


def _headers():
    return {"Authorization": f"Bearer {os.environ['TWITTER_BEARER_TOKEN']}"}


def fetch_twitter(cursors=None, max_results=None):
    """Returns (dict: slug -> list of {tweet_id, texto}, dict: slug -> new since_id).

    max_results overrides TWITTER_MAX_RESULTS env var when provided.
    When no cursor exists for a candidate, fetches the most recent tweets
    up to max_results (useful for seeding after a full reprocess).
    """
    cursors = cursors or {}
    result = {c["slug"]: [] for c in CANDIDATES}
    new_cursors = {}

    for candidate in CANDIDATES:
        try:
            n = max_results or int(os.environ.get("TWITTER_MAX_RESULTS", "10"))
            params = {
                "query":        candidate["twitter_query"],
                "max_results":  n,
                "tweet.fields": "text",
            }
            since_id = cursors.get(candidate["slug"])
            if since_id:
                params["since_id"] = since_id

            resp = requests.get(_SEARCH_URL, headers=_headers(), params=params, timeout=15)
            if resp.status_code == 429:
                log.warning("Twitter rate limited, stopping")
                break
            if resp.status_code in (401, 403):
                log.warning(f"Twitter {resp.status_code} for {candidate['slug']}, skipping")
                continue
            resp.raise_for_status()
            data = resp.json().get("data") or []
            result[candidate["slug"]] = [{"tweet_id": t["id"], "texto": t["text"]} for t in data]
            if data:
                new_cursors[candidate["slug"]] = data[0]["id"]
            log.info(f"Twitter {candidate['slug']}: {len(data)} tweets coletados")
        except Exception as e:
            log.warning(f"Twitter {candidate['slug']}: {e}")

    return result, new_cursors
