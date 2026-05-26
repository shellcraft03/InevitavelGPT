import pytest
from unittest.mock import patch, MagicMock, call
from InevitavelGPT2.youtube_live import (
    _check_live_url,
    _build_tweet,
    _get_live_videos_api,
    _process_live_videos,
    run_once,
    _MAX_TITLE_LEN,
)

_MOD = 'InevitavelGPT2.youtube_live'
_CHANNEL_ID = 'UCabcdef1234567890'


def _mock_response(text='', status_code=200, url='https://www.youtube.com/channel/UCabcdef1234567890/live'):
    r = MagicMock()
    r.status_code = status_code
    r.text = text
    r.url = url
    r.ok = status_code < 400
    return r


class TestCheckLiveUrl:

    def test_returns_true_when_islive_true_in_html(self):
        html = f'data-channel="{_CHANNEL_ID}" "isLive":true something else'
        with patch(f'{_MOD}.requests.get', return_value=_mock_response(html)):
            is_live, blocked = _check_live_url(_CHANNEL_ID)
        assert is_live is True
        assert blocked is False

    def test_returns_false_not_blocked_when_channel_id_present_but_not_live(self):
        html = f'data-channel="{_CHANNEL_ID}" "isLive":false'
        with patch(f'{_MOD}.requests.get', return_value=_mock_response(html)):
            is_live, blocked = _check_live_url(_CHANNEL_ID)
        assert is_live is False
        assert blocked is False

    def test_blocked_on_403(self):
        with patch(f'{_MOD}.requests.get', return_value=_mock_response(status_code=403)):
            is_live, blocked = _check_live_url(_CHANNEL_ID)
        assert blocked is True

    def test_blocked_on_429(self):
        with patch(f'{_MOD}.requests.get', return_value=_mock_response(status_code=429)):
            is_live, blocked = _check_live_url(_CHANNEL_ID)
        assert blocked is True

    def test_blocked_on_consent_redirect(self):
        r = _mock_response(url='https://consent.youtube.com/m?continue=...')
        with patch(f'{_MOD}.requests.get', return_value=r):
            is_live, blocked = _check_live_url(_CHANNEL_ID)
        assert blocked is True

    def test_blocked_on_google_accounts_redirect(self):
        r = _mock_response(url='https://accounts.google.com/signin?...')
        with patch(f'{_MOD}.requests.get', return_value=r):
            is_live, blocked = _check_live_url(_CHANNEL_ID)
        assert blocked is True

    def test_blocked_when_channel_id_missing_from_html(self):
        html = 'some html without the channel id "isLive":true'
        with patch(f'{_MOD}.requests.get', return_value=_mock_response(html)):
            is_live, blocked = _check_live_url(_CHANNEL_ID)
        assert blocked is True

    def test_blocked_on_request_exception(self):
        with patch(f'{_MOD}.requests.get', side_effect=Exception('timeout')):
            is_live, blocked = _check_live_url(_CHANNEL_ID)
        assert blocked is True


class TestBuildTweet:

    def test_basic_format(self):
        text = _build_tweet('Canal X', 'Título da live', 'vid123')
        assert 'Canal X' in text
        assert 'Título da live' in text
        assert 'https://youtube.com/watch?v=vid123' in text
        assert '🔴' in text

    def test_twitter_handle_appended(self):
        text = _build_tweet('Canal X', 'Live title', 'vid123', twitter_handle='@usuario')
        assert '@usuario' in text

    def test_no_twitter_handle_omitted(self):
        text = _build_tweet('Canal X', 'Live title', 'vid123')
        assert '@' not in text

    def test_long_title_truncated(self):
        long_title = 'A' * (_MAX_TITLE_LEN + 20)
        text = _build_tweet('Canal', long_title, 'v1')
        assert '…' in text
        title_line = [line for line in text.splitlines() if 'A' in line][0]
        assert len(title_line) <= _MAX_TITLE_LEN

    def test_title_at_exact_max_not_truncated(self):
        title = 'B' * _MAX_TITLE_LEN
        text = _build_tweet('Canal', title, 'v1')
        assert '…' not in text


class TestGetLiveVideosApi:

    def _playlist_resp(self, video_ids):
        items = [{'contentDetails': {'videoId': vid}} for vid in video_ids]
        r = MagicMock()
        r.json.return_value = {'items': items}
        r.raise_for_status = MagicMock()
        return r

    def _videos_resp(self, live_ids, all_ids):
        items = []
        for vid in all_ids:
            content = 'live' if vid in live_ids else 'none'
            items.append({'id': vid, 'snippet': {'liveBroadcastContent': content, 'title': f'Title {vid}'}})
        r = MagicMock()
        r.json.return_value = {'items': items}
        r.raise_for_status = MagicMock()
        return r

    def test_returns_live_videos(self):
        playlist_r = self._playlist_resp(['vid1', 'vid2'])
        videos_r = self._videos_resp(['vid1'], ['vid1', 'vid2'])
        with patch(f'{_MOD}.requests.get', side_effect=[playlist_r, videos_r]):
            result = _get_live_videos_api(_CHANNEL_ID)
        assert len(result) == 1
        assert result[0]['video_id'] == 'vid1'
        assert result[0]['title'] == 'Title vid1'

    def test_returns_empty_when_no_live(self):
        playlist_r = self._playlist_resp(['vid1'])
        videos_r = self._videos_resp([], ['vid1'])
        with patch(f'{_MOD}.requests.get', side_effect=[playlist_r, videos_r]):
            result = _get_live_videos_api(_CHANNEL_ID)
        assert result == []

    def test_returns_empty_when_playlist_empty(self):
        playlist_r = self._playlist_resp([])
        with patch(f'{_MOD}.requests.get', return_value=playlist_r):
            result = _get_live_videos_api(_CHANNEL_ID)
        assert result == []


class TestRunOnce:

    def _make_conn(self):
        return MagicMock()

    def test_logs_and_returns_when_no_channels(self):
        with patch(f'{_MOD}.db.connect', return_value=self._make_conn()), \
             patch(f'{_MOD}._ensure_tables'), \
             patch(f'{_MOD}._load_channels', return_value=[]), \
             patch(f'{_MOD}._check_live_url') as mock_check:
            run_once()
            mock_check.assert_not_called()

    def test_skips_channel_when_not_live_and_not_blocked(self):
        channels = [{'handle': 'ch1', 'channel_id': _CHANNEL_ID, 'channel_name': 'Canal 1', 'twitter_handle': None}]
        with patch(f'{_MOD}.db.connect', return_value=self._make_conn()), \
             patch(f'{_MOD}._ensure_tables'), \
             patch(f'{_MOD}._load_channels', return_value=channels), \
             patch(f'{_MOD}._check_live_url', return_value=(False, False)), \
             patch(f'{_MOD}._get_live_videos_api') as mock_api:
            run_once()
            mock_api.assert_not_called()

    def test_calls_api_when_live_detected(self):
        channels = [{'handle': 'ch1', 'channel_id': _CHANNEL_ID, 'channel_name': 'Canal 1', 'twitter_handle': None}]
        with patch(f'{_MOD}.db.connect', return_value=self._make_conn()), \
             patch(f'{_MOD}._ensure_tables'), \
             patch(f'{_MOD}._load_channels', return_value=channels), \
             patch(f'{_MOD}._check_live_url', return_value=(True, False)), \
             patch(f'{_MOD}._get_live_videos_api', return_value=[]) as mock_api, \
             patch(f'{_MOD}._process_live_videos') as mock_process:
            run_once()
            mock_api.assert_called_once_with(_CHANNEL_ID)
            mock_process.assert_not_called()

    def test_calls_process_when_live_videos_found(self):
        channels = [{'handle': 'ch1', 'channel_id': _CHANNEL_ID, 'channel_name': 'Canal 1', 'twitter_handle': '@tw'}]
        live = [{'video_id': 'vidX', 'title': 'Live agora'}]
        with patch(f'{_MOD}.db.connect', return_value=self._make_conn()), \
             patch(f'{_MOD}._ensure_tables'), \
             patch(f'{_MOD}._load_channels', return_value=channels), \
             patch(f'{_MOD}._check_live_url', return_value=(True, False)), \
             patch(f'{_MOD}._get_live_videos_api', return_value=live), \
             patch(f'{_MOD}._process_live_videos') as mock_process:
            run_once()
            mock_process.assert_called_once()
            args = mock_process.call_args[0]
            assert args[2] == _CHANNEL_ID
            assert args[3] == 'Canal 1'
            assert args[4] == '@tw'

    def test_calls_api_when_blocked(self):
        channels = [{'handle': 'ch1', 'channel_id': _CHANNEL_ID, 'channel_name': 'Canal 1', 'twitter_handle': None}]
        with patch(f'{_MOD}.db.connect', return_value=self._make_conn()), \
             patch(f'{_MOD}._ensure_tables'), \
             patch(f'{_MOD}._load_channels', return_value=channels), \
             patch(f'{_MOD}._check_live_url', return_value=(False, True)), \
             patch(f'{_MOD}._get_live_videos_api', return_value=[]) as mock_api:
            run_once()
            mock_api.assert_called_once_with(_CHANNEL_ID)

    def test_api_error_does_not_crash_run_once(self):
        channels = [{'handle': 'ch1', 'channel_id': _CHANNEL_ID, 'channel_name': 'Canal 1', 'twitter_handle': None}]
        with patch(f'{_MOD}.db.connect', return_value=self._make_conn()), \
             patch(f'{_MOD}._ensure_tables'), \
             patch(f'{_MOD}._load_channels', return_value=channels), \
             patch(f'{_MOD}._check_live_url', return_value=(True, False)), \
             patch(f'{_MOD}._get_live_videos_api', side_effect=Exception('API down')), \
             patch(f'{_MOD}._process_live_videos') as mock_process:
            run_once()
            mock_process.assert_not_called()
