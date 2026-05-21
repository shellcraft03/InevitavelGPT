import os
import logging
import requests
from coleta.config import CANDIDATES

log = logging.getLogger(__name__)


def fetch_google_trends():
    """Returns dict: slug -> mean score (0-100). Returns None on failure."""
    api_key = os.environ.get("SERPAPI_API_KEY")
    if not api_key:
        log.warning("Google Trends: SERPAPI_API_KEY não configurada")
        return None

    terms = [c["trends_term"] for c in CANDIDATES]
    try:
        resp = requests.get(
            "https://serpapi.com/search",
            params={
                "engine": "google_trends",
                "q": ",".join(terms),
                "geo": "BR",
                "date": "now 7-d",
                "data_type": "TIMESERIES",
                "api_key": api_key,
            },
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json()

        timeline = data.get("interest_over_time", {}).get("timeline_data", [])
        if not timeline:
            log.info("Google Trends: empty response")
            return None

        sums   = {t: 0.0 for t in terms}
        counts = {t: 0   for t in terms}
        for point in timeline:
            for v in point.get("values", []):
                q   = v.get("query")
                val = v.get("extracted_value")
                if q in sums and val is not None:
                    sums[q]   += val
                    counts[q] += 1

        result = {}
        for c in CANDIDATES:
            term = c["trends_term"]
            if counts[term] > 0:
                result[c["slug"]] = round(sums[term] / counts[term], 2)

        log.info(f"Google Trends: {result}")
        return result if result else None
    except Exception as e:
        log.warning(f"Google Trends: {e}")
        return None
