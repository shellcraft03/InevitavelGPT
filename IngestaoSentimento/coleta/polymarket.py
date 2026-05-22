import json
import os
import logging
import requests
from coleta.config import CANDIDATES

log = logging.getLogger(__name__)

POLYMARKET_SLUG = "brazil-presidential-election"


def _proxies():
    user = os.environ.get("WEBSHARE_PROXY_USERNAME")
    pwd  = os.environ.get("WEBSHARE_PROXY_PASSWORD")
    if not user or not pwd:
        return None
    url = f"http://{user}:{pwd}@p.webshare.io:80"
    return {"http": url, "https": url}


def fetch_polymarket():
    """Returns dict: slug -> probability float (0-1). Returns None if market not found."""
    try:
        resp = requests.get(
            "https://gamma-api.polymarket.com/events",
            params={"slug": POLYMARKET_SLUG, "limit": 1},
            timeout=15,
            proxies=_proxies(),
        )
        resp.raise_for_status()
        events = resp.json()
        if not events:
            log.info("Polymarket: event not found")
            return None

        event = events[0]
        markets = event.get("markets") or []
        log.info(f"Polymarket: '{event.get('title')}' — {len(markets)} markets")

        result = {}
        for market in markets:
            raw_outcomes = market.get("outcomes", [])
            raw_prices = market.get("outcomePrices", [])
            if isinstance(raw_outcomes, str):
                raw_outcomes = json.loads(raw_outcomes)
            if isinstance(raw_prices, str):
                raw_prices = json.loads(raw_prices)

            question = (market.get("question") or market.get("groupItemTitle") or "").lower()
            first_outcome = str(raw_outcomes[0]).lower() if raw_outcomes else ""
            is_binary = first_outcome in ("yes", "no", "sim", "não")

            if is_binary:
                for c in CANDIDATES:
                    if any(t.lower() in question for t in c["termos"]):
                        yes_idx = next(
                            (i for i, o in enumerate(raw_outcomes) if str(o).lower() in ("yes", "sim")),
                            0,
                        )
                        if yes_idx < len(raw_prices):
                            result[c["slug"]] = float(raw_prices[yes_idx])
                        break
            else:
                for i, outcome in enumerate(raw_outcomes):
                    for c in CANDIDATES:
                        if any(t.lower() in str(outcome).lower() for t in c["termos"]):
                            if i < len(raw_prices):
                                result[c["slug"]] = float(raw_prices[i])
                            break

        log.info(f"Polymarket odds: {result}")
        return result if result else None
    except Exception as e:
        log.warning(f"Polymarket: {e}")
        return None
