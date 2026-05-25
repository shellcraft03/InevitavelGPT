"""
Resolve um handle do YouTube para channel ID.

Uso:
    python scripts/yt_channel_id.py @RenanSantos
    python scripts/yt_channel_id.py RenanSantos

Requer YOUTUBE_API_KEY no ambiente ou em .env na raiz do projeto.
"""
import os
import sys

import requests
from dotenv import load_dotenv

load_dotenv()


def resolve(handle):
    handle = handle.lstrip('@')
    api_key = os.environ.get('YOUTUBE_API_KEY')
    if not api_key:
        print('Erro: YOUTUBE_API_KEY não encontrada no ambiente.', file=sys.stderr)
        sys.exit(1)

    resp = requests.get(
        'https://www.googleapis.com/youtube/v3/channels',
        params={'part': 'id,snippet', 'forHandle': handle, 'key': api_key},
        timeout=15,
    )
    resp.raise_for_status()
    items = resp.json().get('items', [])
    if not items:
        print(f'Nenhum canal encontrado para @{handle}', file=sys.stderr)
        sys.exit(1)

    item = items[0]
    channel_id = item['id']
    channel_name = item['snippet']['title']
    print(f'Canal : {channel_name}')
    print(f'Handle: @{handle}')
    print(f'ID    : {channel_id}')
    return channel_id


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Uso: python scripts/yt_channel_id.py @handle', file=sys.stderr)
        sys.exit(1)
    resolve(sys.argv[1])
