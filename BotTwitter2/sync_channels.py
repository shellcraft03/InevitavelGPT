"""
Interface para gerenciar canais monitorados em ylive_channels.
"""
import os
import sys

import psycopg2
import psycopg2.extras
import requests
from dotenv import load_dotenv

load_dotenv()


def _connect():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def _ensure_table(conn):
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
    conn.commit()


def _list_channels(conn):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute('SELECT handle, channel_name, twitter_handle FROM ylive_channels ORDER BY id')
        return cur.fetchall()


def _resolve_handle(handle, api_key):
    resp = requests.get(
        'https://www.googleapis.com/youtube/v3/channels',
        params={'part': 'id,snippet', 'forHandle': handle, 'key': api_key},
        timeout=15,
    )
    resp.raise_for_status()
    items = resp.json().get('items', [])
    if not items:
        return None, None
    return items[0]['id'], items[0]['snippet']['title']


def _add_channel(conn):
    api_key = os.environ.get('YOUTUBE_API_KEY')
    if not api_key:
        print('Erro: YOUTUBE_API_KEY nao encontrada no .env')
        return

    yt = input('Handle do YouTube (ex: @renansantosmbl): ').strip().lstrip('@')
    if not yt:
        print('Cancelado.')
        return

    tw = input('Handle do Twitter (ex: @RenanSantosMBL) ou Enter para pular: ').strip() or None

    print(f'Buscando @{yt} no YouTube...')
    channel_id, channel_name = _resolve_handle(yt, api_key)
    if not channel_id:
        print(f'Canal @{yt} nao encontrado no YouTube.')
        return

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO ylive_channels (handle, channel_id, channel_name, twitter_handle)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (handle) DO UPDATE
                SET channel_name = EXCLUDED.channel_name,
                    twitter_handle = EXCLUDED.twitter_handle
            """,
            (yt, channel_id, channel_name, tw),
        )
    conn.commit()
    print(f'Salvo: {channel_name} (@{yt}) | twitter: {tw or "—"}')


def _remove_channel(conn):
    channels = _list_channels(conn)
    if not channels:
        print('Nenhum canal cadastrado.')
        return

    print()
    for i, row in enumerate(channels, 1):
        tw = row['twitter_handle'] or '—'
        print(f'  {i}. @{row["handle"]} ({row["channel_name"]}) | twitter: {tw}')
    print()

    escolha = input('Numero do canal para remover (Enter para cancelar): ').strip()
    if not escolha:
        print('Cancelado.')
        return

    try:
        idx = int(escolha) - 1
        canal = channels[idx]
    except (ValueError, IndexError):
        print('Opcao invalida.')
        return

    confirma = input(f'Remover @{canal["handle"]}? (s/N): ').strip().lower()
    if confirma != 's':
        print('Cancelado.')
        return

    with conn.cursor() as cur:
        cur.execute('DELETE FROM ylive_channels WHERE handle = %s', (canal['handle'],))
    conn.commit()
    print(f'Removido: @{canal["handle"]}')


def _print_channels(channels):
    if not channels:
        print('  (nenhum canal cadastrado)')
        return
    for row in channels:
        tw = row['twitter_handle'] or '—'
        print(f'  @{row["handle"]:30s} {row["channel_name"] or "":40s} twitter: {tw}')


def main():
    conn = _connect()
    _ensure_table(conn)

    while True:
        print()
        print('=== Canais Monitorados ===')
        _print_channels(_list_channels(conn))
        print()
        print('1. Adicionar canal')
        print('2. Remover canal')
        print('3. Sair')
        print()

        opcao = input('Opcao: ').strip()
        if opcao == '1':
            _add_channel(conn)
        elif opcao == '2':
            _remove_channel(conn)
        elif opcao == '3':
            break
        else:
            print('Opcao invalida.')

    conn.close()


if __name__ == '__main__':
    main()
