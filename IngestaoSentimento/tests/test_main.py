import sys
import os
from unittest.mock import patch, MagicMock

from main import _run_twitter_now


def _mock_utc_hour(hour):
    """Return a mock for `main.datetime` that makes `datetime.now(utc).hour == hour`."""
    now_result = MagicMock()
    now_result.hour = hour
    dt_mock = MagicMock()
    dt_mock.datetime.now.return_value = now_result
    return dt_mock


class TestRunTwitterNow:

    def test_skip_twitter_arg_returns_false(self):
        with patch.object(sys, 'argv', ['main.py', '--skip-twitter']):
            assert _run_twitter_now() is False

    def test_twitter_only_arg_returns_true(self):
        with patch.object(sys, 'argv', ['main.py', '--twitter-only']):
            assert _run_twitter_now() is True

    def test_hour_in_configured_hours_returns_true(self):
        with patch.object(sys, 'argv', ['main.py']), \
             patch('main.datetime', _mock_utc_hour(15)), \
             patch.dict(os.environ, {'TWITTER_UTC_HOURS': '15,18,21'}):
            assert _run_twitter_now() is True

    def test_hour_not_in_configured_hours_returns_false(self):
        with patch.object(sys, 'argv', ['main.py']), \
             patch('main.datetime', _mock_utc_hour(14)), \
             patch.dict(os.environ, {'TWITTER_UTC_HOURS': '15,18,21'}):
            assert _run_twitter_now() is False

    def test_custom_twitter_hours_env_var(self):
        with patch.object(sys, 'argv', ['main.py']), \
             patch('main.datetime', _mock_utc_hour(10)), \
             patch.dict(os.environ, {'TWITTER_UTC_HOURS': '10,22'}):
            assert _run_twitter_now() is True

    def test_skip_twitter_takes_precedence_over_twitter_only(self):
        with patch.object(sys, 'argv', ['main.py', '--skip-twitter', '--twitter-only']):
            assert _run_twitter_now() is False
