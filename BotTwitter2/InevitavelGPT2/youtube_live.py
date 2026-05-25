import logging
import os

import requests

from . import db
from .x_api import post_tweet

_PLAYLIST_ITEMS_URL = 'https://www.googleapis.com/youtube/v3/playlistItems'
_VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos'
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


def _get_recent_video_ids(channel_id):
    # uploads playlist ID = channel ID with UC → UU (1 quota unit)
    playlist_id = 'UU' + channel_id[2:]
    resp = requests.get(
        _PLAYLIST_ITEMS_URL,
        params={
            'part': 'contentDetails',
            'playlistId': playlist_id,
            'maxResults': 15,
            'key': os.environ['YOUTUBE_API_KEY'],
        },
        timeout=15,
    )
    resp.raise_for_status()
    return [item['contentDetails']['videoId'] for item in resp.json().get('items', [])]


def _check_live_videos(video_ids):
    # Single videos.list call (1 quota unit) covers all IDs
    resp = requests.get(
        _VIDEOS_URL,
        params={
            'part': 'snippet,liveStreamingDetails',
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

            try:
                video_ids = _get_recent_video_ids(channel_id)
            except Exception as exc:
                logging.error('playlistItems error for @%s: %s', handle, exc)
                continue

            if not video_ids:
                continue

            try:
                live_videos = _check_live_videos(video_ids)
            except Exception as exc:
                logging.error('videos.list error for @%s: %s', handle, exc)
                continue

            if not live_videos:
                logging.info('No live stream for @%s', handle)
                continue

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
    finally:
        conn.close()
