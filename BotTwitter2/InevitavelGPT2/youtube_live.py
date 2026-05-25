import logging
import os

import requests

from . import db
from .x_api import post_tweet

_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search'
_CHANNELS_URL = 'https://www.googleapis.com/youtube/v3/channels'
_MAX_TITLE_LEN = 100


def _get_handles():
    raw = os.environ.get('YLIVE_CHANNEL_HANDLES', '').strip().strip('"\'')
    return [h.lstrip('@').strip() for h in raw.split(';') if h.strip()]


def _ensure_tables(conn):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS ylive_channels (
                id SERIAL PRIMARY KEY,
                handle TEXT NOT NULL UNIQUE,
                channel_id TEXT NOT NULL,
                channel_name TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
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


def _load_known_channels(conn):
    with db.dict_cursor(conn) as cur:
        cur.execute('SELECT handle, channel_id, channel_name FROM ylive_channels')
        return {row['handle']: row for row in cur.fetchall()}


def _resolve_handle(handle):
    resp = requests.get(
        _CHANNELS_URL,
        params={'part': 'id,snippet', 'forHandle': handle, 'key': os.environ['YOUTUBE_API_KEY']},
        timeout=15,
    )
    resp.raise_for_status()
    items = resp.json().get('items', [])
    if not items:
        return None, None
    item = items[0]
    return item['id'], item['snippet']['title']


def _save_channel(conn, handle, channel_id, channel_name):
    with conn.cursor() as cur:
        cur.execute(
            'INSERT INTO ylive_channels (handle, channel_id, channel_name) VALUES (%s, %s, %s)'
            ' ON CONFLICT (handle) DO NOTHING',
            (handle, channel_id, channel_name),
        )
    conn.commit()


def _resolve_new_handles(conn, handles, known):
    result = dict(known)
    for handle in handles:
        if handle in known:
            continue
        try:
            channel_id, channel_name = _resolve_handle(handle)
        except Exception as exc:
            logging.error('Failed to resolve handle @%s: %s', handle, exc)
            continue
        if not channel_id:
            logging.warning('No channel found for handle @%s', handle)
            continue
        _save_channel(conn, handle, channel_id, channel_name)
        result[handle] = {'handle': handle, 'channel_id': channel_id, 'channel_name': channel_name}
        logging.info('Resolved @%s → %s (%s)', handle, channel_id, channel_name)
    return result


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


def _get_live_streams(channel_id):
    params = {
        'part': 'snippet',
        'channelId': channel_id,
        'eventType': 'live',
        'type': 'video',
        'key': os.environ['YOUTUBE_API_KEY'],
    }
    resp = requests.get(_SEARCH_URL, params=params, timeout=15)
    resp.raise_for_status()
    return resp.json().get('items', [])


def _build_tweet(channel_name, video_title, video_id):
    if len(video_title) > _MAX_TITLE_LEN:
        video_title = video_title[:_MAX_TITLE_LEN - 1] + '…'
    return (
        f'🔴 {channel_name} está ao vivo agora!\n\n'
        f'{video_title}\n'
        f'https://youtube.com/watch?v={video_id}'
    )


def run_once():
    handles = _get_handles()
    if not handles:
        return

    conn = db.connect()
    try:
        _ensure_tables(conn)
        known = _load_known_channels(conn)
        channels = _resolve_new_handles(conn, handles, known)

        for handle in handles:
            row = channels.get(handle)
            if not row:
                continue
            channel_id = row['channel_id']
            channel_name = row['channel_name'] or handle

            try:
                streams = _get_live_streams(channel_id)
            except Exception as exc:
                logging.error('YouTube API error for @%s: %s', handle, exc)
                continue

            for stream in streams:
                video_id = stream['id']['videoId']
                video_title = stream['snippet'].get('title', '')

                if _already_posted(conn, video_id):
                    logging.info('Already posted for video %s (@%s)', video_id, handle)
                    continue

                text = _build_tweet(channel_name, video_title, video_id)
                try:
                    result = post_tweet(text)
                    tweet_id = result.get('data', {}).get('id')
                    _record_posted(conn, channel_id, video_id, tweet_id)
                    logging.info('Posted tweet %s for video %s (@%s)', tweet_id, video_id, handle)
                except Exception as exc:
                    logging.error('Failed to post tweet for video %s: %s', video_id, exc)
    finally:
        conn.close()
