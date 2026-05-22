import sys
import json
import os
import re

try:
    from dotenv import load_dotenv
    load_dotenv('.env.local')
except ImportError:
    pass

from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.proxies import WebshareProxyConfig
from youtube_transcript_api._transcripts import TranscriptList

WEBSHARE_USERNAME = os.environ.get('WEBSHARE_PROXY_USERNAME')
WEBSHARE_PASSWORD = os.environ.get('WEBSHARE_PROXY_PASSWORD')

if WEBSHARE_USERNAME and WEBSHARE_PASSWORD:
    ytt_api = YouTubeTranscriptApi(
        proxy_config=WebshareProxyConfig(
            proxy_username=WEBSHARE_USERNAME,
            proxy_password=WEBSHARE_PASSWORD,
            filter_ip_locations=['br', 'us'],
        )
    )
else:
    ytt_api = YouTubeTranscriptApi()


def sanitize(value, max_len=300):
    if not value or not isinstance(value, str):
        return None
    return re.sub(r'[\x00-\x1F\x7F]', ' ', value).strip()[:max_len]


def fetch(video_id):
    fetcher = ytt_api._fetcher
    html = fetcher._fetch_video_html(video_id)
    api_key = fetcher._extract_innertube_api_key(html, video_id)
    innertube_data = fetcher._fetch_innertube_data(video_id, api_key)
    captions_json = fetcher._extract_captions_json(innertube_data, video_id)
    transcript_list = TranscriptList.build(fetcher._http_client, video_id, captions_json)
    transcript = transcript_list.find_transcript(['pt-BR', 'pt', 'pt-PT', 'en'])
    snippets = transcript.fetch()

    segments = [{'text': s.text, 'offset': int(s.start * 1000)} for s in snippets]

    details = innertube_data.get('videoDetails') or {}
    mf = innertube_data.get('microformat', {}).get('playerMicroformatRenderer', {})
    title = sanitize(details.get('title') or mf.get('title', {}).get('simpleText'), 300)
    channel = sanitize(details.get('author') or mf.get('ownerChannelName'), 200)
    published_at = mf.get('publishDate') or mf.get('uploadDate')
    if not published_at:
        m = re.search(r'"publishDate"\s*:\s*"([^"]+)"', html) or \
            re.search(r'"uploadDate"\s*:\s*"([^"]+)"', html)
        published_at = m.group(1).split('T')[0] if m else None

    return {
        'segments': segments,
        'meta': {'title': title, 'channel': channel, 'published_at': published_at},
    }


if __name__ == '__main__':
    video_id = sys.argv[1]
    try:
        result = fetch(video_id)
        sys.stdout.reconfigure(encoding='utf-8')
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({'error': str(e)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
