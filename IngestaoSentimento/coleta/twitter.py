import os
import logging
import requests
from requests_oauthlib import OAuth1
from coleta.config import CANDIDATES

log = logging.getLogger(__name__)


def _auth():
    return OAuth1(
        os.environ["BOT_CONSUMER_KEY"],
        os.environ["BOT_CONSUMER_SECRET"],
        os.environ["BOT_ACCESS_TOKEN"],
        os.environ["BOT_ACCESS_TOKEN_SECRET"],
    )


def fetch_twitter(cursors=None):
    """Returns (dict: slug -> list of tweet texts, dict: slug -> new since_id)."""
    cursors = cursors or {}
    result = {c["slug"]: [] for c in CANDIDATES}
    new_cursors = {}
    auth = _auth()

    for candidate in CANDIDATES:
        try:
            max_results = int(os.environ.get("TWITTER_MAX_RESULTS", "10"))
            params = {
                "query": candidate["twitter_query"],
                "max_results": max_results,
                "tweet.fields": "text",
            }
            since_id = cursors.get(candidate["slug"])
            if since_id:
                params["since_id"] = since_id

            resp = requests.get(
                "https://api.twitter.com/2/tweets/search/recent",
                auth=auth,
                params=params,
                timeout=15,
            )
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
            log.info(f"Twitter {candidate['slug']}: {len(data)} tweets novos")
        except Exception as e:
            log.warning(f"Twitter {candidate['slug']}: {e}")

    return result, new_cursors
