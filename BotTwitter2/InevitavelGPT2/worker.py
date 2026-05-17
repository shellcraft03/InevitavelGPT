import logging
import os
import re
import uuid
import unicodedata

import requests

from . import api, x_api
from .db import connect, dict_cursor

WORKER_ID = os.environ.get('IGPT2_WORKER_ID') or f'igpt2-{os.getpid()}-{uuid.uuid4()}'
INTERVAL_SECONDS = int(os.environ.get('IGPT2_WORKER_INTERVAL_SECONDS', '60'))
TRIGGER_KEYWORD = os.environ.get('INEVITAVEL_GPT_KEYWORD') or os.environ.get('IGPT2_TRIGGER_KEYWORD')
if not TRIGGER_KEYWORD:
    raise RuntimeError('Missing env var: INEVITAVEL_GPT_KEYWORD or IGPT2_TRIGGER_KEYWORD')

LIVRO_RE = re.compile(r'livro\s+amarelo', re.IGNORECASE)
RENAN_RE = re.compile(r'renan\s+santos', re.IGNORECASE)


def _strip_accents(text):
    return unicodedata.normalize('NFD', str(text or '')).encode('ascii', 'ignore').decode('ascii')


TRIGGER_KEYWORD_RE = re.compile(re.escape(_strip_accents(TRIGGER_KEYWORD)), re.IGNORECASE)

logging.basicConfig()
logging.getLogger().info('TRIGGER_KEYWORD=%r', TRIGGER_KEYWORD)


def _parse_tweet(text):
    stripped = _strip_accents(text)
    match = TRIGGER_KEYWORD_RE.search(stripped)
    if not match:
        return None

    without_keyword = f'{stripped[:match.start()]} {stripped[match.end():]}'
    cleaned = re.sub(r'@\w+\s*', '', without_keyword).strip()
    if LIVRO_RE.search(cleaned):
        return {'question': cleaned, 'type': 'livro'}
    if RENAN_RE.search(cleaned):
        return {'question': cleaned, 'type': 'entrevistas'}
    return None


def _get_tweet_cost_cents(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT value FROM igpt2_global_settings WHERE key = 'tweet_cost_cents' LIMIT 1")
        row = cur.fetchone()
    if not row:
        raise RuntimeError('Missing igpt2_global_settings.tweet_cost_cents')
    try:
        value = int(row[0])
    except (TypeError, ValueError) as exc:
        raise RuntimeError('Invalid igpt2_global_settings.tweet_cost_cents') from exc
    if value <= 0:
        raise RuntimeError('Invalid igpt2_global_settings.tweet_cost_cents')
    return value


def _get_approved_users(conn, tweet_cost_cents):
    with dict_cursor(conn) as cur:
        cur.execute(
            """
            SELECT u.id AS user_id, u.x_user_id, u.x_username, ag.credit_balance_cents
            FROM igpt2_users u
            JOIN igpt2_access_grants ag ON ag.user_id = u.id
            WHERE ag.access_status = 'approved'
              AND ag.credit_balance_cents >= %s
            """,
            (tweet_cost_cents,),
        )
        return {row['x_user_id']: row for row in cur.fetchall()}


def _get_mentions_cursor(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT value FROM igpt2_global_settings WHERE key = 'bot_mentions_since_id' LIMIT 1")
        row = cur.fetchone()
    return row[0] if row else None


def _set_mentions_cursor(conn, since_id):
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE igpt2_global_settings SET value = %s WHERE key = 'bot_mentions_since_id'",
            (str(since_id),),
        )
        if cur.rowcount == 0:
            cur.execute(
                "INSERT INTO igpt2_global_settings (key, value) VALUES ('bot_mentions_since_id', %s)",
                (str(since_id),),
            )
    conn.commit()


def _has_run(conn, user_id, tweet_id):
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM igpt2_automation_runs WHERE user_id = %s AND input_tweet_id = %s LIMIT 1",
            (user_id, str(tweet_id)),
        )
        return cur.fetchone() is not None


def _record_run(conn, user_id, tweet, parsed, status, tweet_cost_cents, image_generated=False, published_tweet_id=None, api_result=None, error_message=None):
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO igpt2_automation_runs (
              user_id, input_tweet_id, captured_tweet_created_at, source_type,
              image_generated, published_tweet_id, api_result, status, error_message, balance_delta_cents
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (user_id, input_tweet_id) WHERE input_tweet_id IS NOT NULL DO NOTHING
            """,
            (
                user_id, str(tweet['id']), tweet.get('created_at'), parsed['type'],
                image_generated, published_tweet_id, api_result, status,
                (error_message or '')[:1000] if error_message else None,
                -tweet_cost_cents if status == 'published' else 0,
            ),
        )
    conn.commit()


def _record_balance_event(conn, user_id, delta_cents, source, note=None):
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO igpt2_balance_events (user_id, delta_cents, source, note, created_at) VALUES (%s, %s, %s, %s, now())",
            (user_id, int(delta_cents), source, note),
        )
    conn.commit()


def _debit_success(conn, user_id, tweet_cost_cents):
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE igpt2_access_grants
            SET credit_balance_cents = GREATEST(0, credit_balance_cents - %s), updated_at = now()
            WHERE user_id = %s AND credit_balance_cents >= %s
            """,
            (tweet_cost_cents, user_id, tweet_cost_cents),
        )
    conn.commit()
    _record_balance_event(conn, user_id, -tweet_cost_cents, 'bot', 'Publicacao do bot')


def _fresh_balance_ok(conn, user_id, tweet_cost_cents):
    with dict_cursor(conn) as cur:
        cur.execute(
            "SELECT credit_balance_cents, access_status FROM igpt2_access_grants WHERE user_id = %s",
            (user_id,),
        )
        row = cur.fetchone()
    return bool(row and row['access_status'] == 'approved' and row['credit_balance_cents'] >= tweet_cost_cents)


def _error_code(exc):
    status = getattr(getattr(exc, 'response', None), 'status_code', None)
    if status:
        return f'http_{status}'
    return exc.__class__.__name__


def _process_tweet(conn, account, tweet, tweet_cost_cents):
    user_id = account['user_id']

    if _has_run(conn, user_id, tweet['id']):
        return

    parsed = _parse_tweet(tweet.get('text'))
    if not parsed:
        logging.info('Non-matching mention from @%s tweet=%s', account['x_username'], tweet.get('id'))
        return

    logging.info('Processing @%s tweet=%s: %s', account['x_username'], tweet['id'], (tweet.get('text') or '')[:80])
    logging.info('Question (%s): %s', parsed['type'], parsed['question'][:80])

    image_generated = False

    try:
        answer = api.answer(parsed['question'], parsed['type'])
        if not answer:
            raise RuntimeError('Bot API returned empty answer')

        image = api.generate_image(parsed['question'], answer, parsed['type'])
        image_generated = True
        media_id = x_api.upload_media(image)
        if not media_id:
            raise RuntimeError('X media upload returned no media id')

        reply = x_api.create_reply(media_id, tweet['id'])
        _record_run(
            conn, user_id, tweet, parsed, 'published', tweet_cost_cents,
            image_generated=image_generated,
            published_tweet_id=(reply.get('data') or {}).get('id'),
            api_result=f"x_api_status={reply.get('_http_status', 200)}",
        )
        _debit_success(conn, user_id, tweet_cost_cents)
    except Exception as exc:
        logging.exception('Tweet processing failed @%s tweet=%s', account['x_username'], tweet.get('id'))
        _record_run(
            conn, user_id, tweet, parsed, 'failed', tweet_cost_cents,
            image_generated=image_generated,
            error_message=_error_code(exc),
        )
        raise


_BOT_USER_ID = None


def _resolve_bot_user_id():
    global _BOT_USER_ID
    if not _BOT_USER_ID:
        _BOT_USER_ID = x_api.get_bot_user_id()
        logging.info('Bot user id resolved: %s', _BOT_USER_ID)
    return _BOT_USER_ID


def run_once():
    with connect() as conn:
        tweet_cost_cents = _get_tweet_cost_cents(conn)
        approved = _get_approved_users(conn, tweet_cost_cents)
        if not approved:
            logging.info('No approved users with sufficient balance')
            return

        bot_user_id = _resolve_bot_user_id()
        since_id = _get_mentions_cursor(conn)
        mentions = x_api.get_bot_mentions(bot_user_id, since_id=since_id)

        if not mentions:
            logging.info('No new mentions')
            return

        logging.info('Got %s new mention(s)', len(mentions))

        latest_id = max(int(t['id']) for t in mentions)
        _set_mentions_cursor(conn, latest_id)

        for tweet in sorted(mentions, key=lambda t: t.get('created_at') or ''):
            author_id = tweet.get('author_id')
            account = approved.get(author_id)
            if not account:
                logging.info('Skipping mention from non-approved author_id=%s', author_id)
                continue
            if not _fresh_balance_ok(conn, account['user_id'], tweet_cost_cents):
                logging.info('Skipping @%s: insufficient balance', account['x_username'])
                continue
            try:
                _process_tweet(conn, account, tweet, tweet_cost_cents)
            except Exception as exc:
                logging.error('Tweet failed @%s tweet=%s: %s', account['x_username'], tweet.get('id'), exc)
