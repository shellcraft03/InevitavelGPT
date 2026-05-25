import logging
import os

import requests

from . import db
from .x_api import post_tweet

_VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos'
_LIVE_URL = 'https://www.youtube.com/channel/{channel_id}/live'
_LIVE_CHECK_HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
_MAX_TITLE_LEN = 100


def _ensure_tables(conn):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS ylive_channels (
                id SERIAL PRIMARY KEY,
                handle TEXT NOT NULL UNIQUE,
                channel_id TEXT NOT NULL,
                channel_name TEXT,
                twitter_handle TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        cur.execute("ALTER TABLE ylive_channels ADD COLUMN IF NOT EXISTS twitter_handle TEXT")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS ylive_posted (
                id SERIAL PRIMARY KEY,
                channel_id TEXT NOT NULL,
                video_id TEXT NOT NULL UNIQUE,
                tweet_id TEXT,
                posted_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
    conn.commit()


def _load_channels(conn):
    with db.dict_cursor(conn) as cur:
        cur.execute('SELECT handle, channel_id, channel_name, twitter_handle FROM ylive_channels')
        return cur.fetchall()


def _check_live_url(channel_id):
    """Check if channel is live via the /live page HTML.

    Returns (is_live, blocked).
    blocked=True means YouTube rejected the request — fall back to API without pre-check.
    """
    url = _LIVE_URL.format(channel_id=channel_id)
    try:
        resp = requests.get(url, headers=_LIVE_CHECK_HEADERS, allow_redirects=True, timeout=15)
    except Exception as exc:
        logging.warning('Live URL request failed for %s: %s', channel_id, exc)
        return False, True

    if resp.status_code in (403, 429):
        logging.warning('YouTube blocked live URL check for %s (HTTP %s)', channel_id, resp.status_code)
        return False, True

    final_url = resp.url
    if 'consent' in final_url or 'accounts.google' in final_url:
        logging.warning('YouTube redirected to consent/login for %s — blocked', channel_id)
        return False, True

    if channel_id not in resp.text:
        logging.warning('Channel ID not found in live page for %s — possible silent block', channel_id)
        return False, True

    return '"isLive":true' in resp.text, False


def _get_live_videos_api(channel_id):
    """Fallback: playlistItems + videos.list (2 quota units)."""
    playlist_id = 'UU' + channel_id[2:]
    resp = requests.get(
        'https://www.googleapis.com/youtube/v3/playlistItems',
        params={
            'part': 'contentDetails',
            'playlistId': playlist_id,
            'maxResults': 15,
            'key': os.environ['YOUTUBE_API_KEY'],
        },
        timeout=15,
    )
    resp.raise_for_status()
    video_ids = [item['contentDetails']['videoId'] for item in resp.json().get('items', [])]
    if not video_ids:
        return []

    resp = requests.get(
        _VIDEOS_URL,
        params={
            'part': 'snippet',
            'id': ','.join(video_ids),
            'key': os.environ['YOUTUBE_API_KEY'],
        },
        timeout=15,
    )
    resp.raise_for_status()
    live = []
    for item in resp.json().get('items', []):
        if item.get('snippet', {}).get('liveBroadcastContent') == 'live':
            live.append({'video_id': item['id'], 'title': item['snippet'].get('title', '')})
    return live


def _already_posted(conn, video_id):
    with db.dict_cursor(conn) as cur:
        cur.execute('SELECT id FROM ylive_posted WHERE video_id = %s', (video_id,))
        return cur.fetchone() is not None


def _record_posted(conn, channel_id, video_id, tweet_id):
    with conn.cursor() as cur:
        cur.execute(
            'INSERT INTO ylive_posted (channel_id, video_id, tweet_id) VALUES (%s, %s, %s)'
            ' ON CONFLICT (video_id) DO NOTHING',
            (channel_id, video_id, tweet_id),
        )
    conn.commit()


def _build_tweet(channel_name, video_title, video_id, twitter_handle=None):
    if len(video_title) > _MAX_TITLE_LEN:
        video_title = video_title[:_MAX_TITLE_LEN - 1] + '…'
    text = (
        f'🔴 {channel_name} está ao vivo agora!\n\n'
        f'{video_title}\n'
        f'https://youtube.com/watch?v={video_id}'
    )
    if twitter_handle:
        text += f'\n\n{twitter_handle}'
    return text


def _process_live_videos(conn, live_videos, channel_id, channel_name, twitter_handle, handle):
    for video in live_videos:
        video_id = video['video_id']
        video_title = video['title']

        if _already_posted(conn, video_id):
            logging.info('Already posted for video %s (@%s)', video_id, handle)
            continue

        text = _build_tweet(channel_name, video_title, video_id, twitter_handle)
        try:
            result = post_tweet(text)
            tweet_id = result.get('data', {}).get('id')
            _record_posted(conn, channel_id, video_id, tweet_id)
            logging.info('Posted tweet %s for video %s (@%s)', tweet_id, video_id, handle)
        except Exception as exc:
            logging.error('Failed to post tweet for video %s: %s', video_id, exc)


def run_once():
    conn = db.connect()
    try:
        _ensure_tables(conn)
        channels = _load_channels(conn)

        if not channels:
            logging.info('No channels configured in ylive_channels')
            return

        for row in channels:
            handle = row['handle']
            channel_id = row['channel_id']
            channel_name = row['channel_name'] or handle
            twitter_handle = row['twitter_handle']

            is_live, blocked = _check_live_url(channel_id)

            if not blocked and not is_live:
                logging.info('No live stream for @%s', handle)
                continue

            # Live confirmed (or pre-check blocked) — use API to get video details
            try:
                live_videos = _get_live_videos_api(channel_id)
            except Exception as exc:
                logging.error('API error for @%s: %s', handle, exc)
                continue

            if not live_videos:
                logging.info('No live stream for @%s', handle)
                continue

            _process_live_videos(conn, live_videos, channel_id, channel_name, twitter_handle, handle)

    finally:
        conn.close()
