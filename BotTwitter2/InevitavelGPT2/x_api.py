import base64
import json
import logging
import os

import requests
from requests_oauthlib import OAuth1

_BOT_CONSUMER_KEY = os.environ['BOT_CONSUMER_KEY']
_BOT_CONSUMER_SECRET = os.environ['BOT_CONSUMER_SECRET']
_BOT_ACCESS_TOKEN = os.environ['BOT_ACCESS_TOKEN']
_BOT_ACCESS_TOKEN_SECRET = os.environ['BOT_ACCESS_TOKEN_SECRET']

TWEET_TEXT = 'Faca perguntas, verifique as fontes.\nVisite: https://www.inevitavelgpt.com/'


def _bot_oauth1():
    return OAuth1(_BOT_CONSUMER_KEY, _BOT_CONSUMER_SECRET, _BOT_ACCESS_TOKEN, _BOT_ACCESS_TOKEN_SECRET)


def get_bot_user_id():
    response = requests.get(
        'https://api.x.com/2/users/me',
        auth=_bot_oauth1(),
        timeout=30,
    )
    response.raise_for_status()
    return response.json()['data']['id']


def get_bot_mentions(bot_user_id, since_id=None, max_results=100):
    params = {
        'max_results': min(max_results, 100),
        'tweet.fields': 'author_id,created_at,text',
    }
    if since_id:
        params['since_id'] = str(since_id)
    response = requests.get(
        f'https://api.x.com/2/users/{bot_user_id}/mentions',
        auth=_bot_oauth1(),
        params=params,
        timeout=30,
    )
    if not response.ok:
        logging.error('get_bot_mentions %s: %s', response.status_code, response.text[:500])
    response.raise_for_status()
    return response.json().get('data') or []


def upload_media(image_bytes):
    response = requests.post(
        'https://upload.twitter.com/1.1/media/upload.json',
        auth=_bot_oauth1(),
        data={'media_data': base64.b64encode(image_bytes).decode()},
        timeout=90,
    )
    if not response.ok:
        logging.error('upload_media %s: %s', response.status_code, response.text[:500])
    response.raise_for_status()
    data = response.json()
    return data.get('media_id_string')


def post_tweet(text):
    response = requests.post(
        'https://api.x.com/2/tweets',
        auth=_bot_oauth1(),
        data=json.dumps({'text': text}),
        headers={'Content-Type': 'application/json'},
        timeout=30,
    )
    if not response.ok:
        logging.error('post_tweet %s: %s', response.status_code, response.text[:500])
    response.raise_for_status()
    return response.json()


def create_reply(media_id, reply_to_id):
    response = requests.post(
        'https://api.x.com/2/tweets',
        auth=_bot_oauth1(),
        data=json.dumps({
            'text': TWEET_TEXT,
            'media': {'media_ids': [str(media_id)]},
            'reply': {'in_reply_to_tweet_id': str(reply_to_id)},
        }),
        headers={'Content-Type': 'application/json'},
        timeout=30,
    )
    if not response.ok:
        logging.error('create_reply %s: %s', response.status_code, response.text[:500])
    response.raise_for_status()
    data = response.json()
    data['_http_status'] = response.status_code
    return data
