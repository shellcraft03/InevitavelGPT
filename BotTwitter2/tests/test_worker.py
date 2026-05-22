import pytest
from unittest.mock import patch, MagicMock
from InevitavelGPT2.worker import _parse_tweet, _strip_accents, _error_code, _process_tweet

_W = 'InevitavelGPT2.worker'


def _account(username='TestUser', user_id='user-uuid-1'):
    return {'user_id': user_id, 'x_user_id': '12345', 'x_username': username, 'credit_balance_cents': 1000}


def _tweet(text='@Inevitavel_Bot InevitavelGPT livro amarelo', tweet_id='tweet-123'):
    return {'id': tweet_id, 'text': text, 'author_id': '12345', 'created_at': '2026-01-01T00:00:00Z'}


class TestStripAccents:

    def test_removes_acute_accent(self):
        assert _strip_accents("café") == "cafe"

    def test_removes_tilde(self):
        assert _strip_accents("São Paulo") == "Sao Paulo"

    def test_removes_cedilla(self):
        assert _strip_accents("educação") == "educacao"

    def test_empty_string(self):
        assert _strip_accents("") == ""

    def test_none_returns_empty(self):
        assert _strip_accents(None) == ""

    def test_plain_ascii_unchanged(self):
        assert _strip_accents("hello world") == "hello world"


class TestParseTweet:
    """Tests depend on INEVITAVEL_GPT_KEYWORD=InevitavelGPT set in conftest.py."""

    def test_keyword_with_livro_amarelo_returns_livro_type(self):
        result = _parse_tweet("InevitavelGPT livro amarelo saude")
        assert result is not None
        assert result["type"] == "livro"
        assert "livro amarelo" in result["question"].lower()

    def test_keyword_with_renan_santos_returns_entrevistas_type(self):
        result = _parse_tweet("InevitavelGPT renan santos debate")
        assert result is not None
        assert result["type"] == "entrevistas"

    def test_keyword_without_type_indicator_returns_none(self):
        result = _parse_tweet("InevitavelGPT economia e impostos")
        assert result is None

    def test_no_keyword_returns_none(self):
        result = _parse_tweet("livro amarelo sobre saude")
        assert result is None

    def test_at_mentions_stripped_from_question(self):
        result = _parse_tweet("@Inevitavel_Bot InevitavelGPT livro amarelo")
        assert result is not None
        assert "@Inevitavel_Bot" not in result["question"]

    def test_keyword_with_accented_chars_still_matches(self):
        # _strip_accents is applied before regex search
        result = _parse_tweet("InevitávelGPT livro amarelo")
        assert result is not None
        assert result["type"] == "livro"

    def test_empty_text_returns_none(self):
        assert _parse_tweet("") is None

    def test_none_text_returns_none(self):
        assert _parse_tweet(None) is None


class TestErrorCode:

    def test_exception_with_http_status(self):
        exc = Exception("rate limited")
        exc.response = type("R", (), {"status_code": 429})()
        assert _error_code(exc) == "http_429"

    def test_exception_without_response(self):
        assert _error_code(ValueError("bad value")) == "ValueError"

    def test_exception_with_response_but_no_status_code(self):
        exc = Exception("error")
        exc.response = type("R", (), {})()
        assert _error_code(exc) == "Exception"

    def test_runtime_error_class_name(self):
        assert _error_code(RuntimeError("boom")) == "RuntimeError"


class TestProcessTweet:

    def setup_method(self):
        self.conn = MagicMock()
        self.account = _account()
        self.tweet = _tweet()

    def test_skips_already_processed_tweet(self):
        with patch(f'{_W}._has_run', return_value=True), \
             patch(f'{_W}.api.answer') as mock_answer:
            _process_tweet(self.conn, self.account, self.tweet, 50)
            mock_answer.assert_not_called()

    def test_non_matching_tweet_skips_processing(self):
        tweet = _tweet(text='@Inevitavel_Bot InevitavelGPT economia impostos')
        with patch(f'{_W}._has_run', return_value=False), \
             patch(f'{_W}.api.answer') as mock_answer:
            _process_tweet(self.conn, self.account, tweet, 50)
            mock_answer.assert_not_called()

    def test_successful_livro_flow(self):
        with patch(f'{_W}._has_run', return_value=False), \
             patch(f'{_W}._record_run') as mock_record, \
             patch(f'{_W}._debit_success') as mock_debit, \
             patch(f'{_W}.api.answer', return_value='Resposta sobre saude'), \
             patch(f'{_W}.api.generate_image', return_value=b'imgdata'), \
             patch(f'{_W}.x_api.upload_media', return_value='media-id-1'), \
             patch(f'{_W}.x_api.create_reply', return_value={'data': {'id': 'reply-1'}, '_http_status': 201}):
            _process_tweet(self.conn, self.account, self.tweet, 50)
            args, _ = mock_record.call_args
            assert args[3]['type'] == 'livro'
            assert args[4] == 'published'
            assert args[5] == 50
            mock_debit.assert_called_once_with(self.conn, 'user-uuid-1', 50)

    def test_successful_entrevistas_flow(self):
        tweet = _tweet(text='@Inevitavel_Bot InevitavelGPT renan santos educacao')
        with patch(f'{_W}._has_run', return_value=False), \
             patch(f'{_W}._record_run') as mock_record, \
             patch(f'{_W}._debit_success'), \
             patch(f'{_W}.api.answer', return_value='Resposta'), \
             patch(f'{_W}.api.generate_image', return_value=b'img'), \
             patch(f'{_W}.x_api.upload_media', return_value='media-id'), \
             patch(f'{_W}.x_api.create_reply', return_value={'data': {'id': 'r1'}}):
            _process_tweet(self.conn, self.account, tweet, 50)
            args, _ = mock_record.call_args
            assert args[3]['type'] == 'entrevistas'
            assert args[4] == 'published'

    def test_empty_answer_raises_and_records_failed(self):
        with patch(f'{_W}._has_run', return_value=False), \
             patch(f'{_W}._record_run') as mock_record, \
             patch(f'{_W}.api.answer', return_value=''), \
             patch(f'{_W}.api.generate_image') as mock_image:
            with pytest.raises(RuntimeError, match='empty answer'):
                _process_tweet(self.conn, self.account, self.tweet, 50)
            mock_image.assert_not_called()
            args, _ = mock_record.call_args
            assert args[4] == 'failed'

    def test_media_upload_none_records_failed_without_debit(self):
        with patch(f'{_W}._has_run', return_value=False), \
             patch(f'{_W}._record_run') as mock_record, \
             patch(f'{_W}._debit_success') as mock_debit, \
             patch(f'{_W}.api.answer', return_value='Resposta'), \
             patch(f'{_W}.api.generate_image', return_value=b'img'), \
             patch(f'{_W}.x_api.upload_media', return_value=None):
            with pytest.raises(RuntimeError, match='no media id'):
                _process_tweet(self.conn, self.account, self.tweet, 50)
            mock_debit.assert_not_called()
            args, _ = mock_record.call_args
            assert args[4] == 'failed'

    def test_debit_failure_records_published_then_failed(self):
        with patch(f'{_W}._has_run', return_value=False), \
             patch(f'{_W}._record_run') as mock_record, \
             patch(f'{_W}._debit_success', side_effect=RuntimeError('insufficient funds')), \
             patch(f'{_W}.api.answer', return_value='Resposta'), \
             patch(f'{_W}.api.generate_image', return_value=b'img'), \
             patch(f'{_W}.x_api.upload_media', return_value='media-id'), \
             patch(f'{_W}.x_api.create_reply', return_value={'data': {'id': 'r1'}}):
            with pytest.raises(RuntimeError, match='insufficient funds'):
                _process_tweet(self.conn, self.account, self.tweet, 50)
            assert mock_record.call_count == 2
            assert mock_record.call_args_list[0][0][4] == 'published'
            assert mock_record.call_args_list[1][0][4] == 'failed'

    def test_api_exception_records_failed_and_re_raises(self):
        with patch(f'{_W}._has_run', return_value=False), \
             patch(f'{_W}._record_run') as mock_record, \
             patch(f'{_W}._debit_success') as mock_debit, \
             patch(f'{_W}.api.answer', side_effect=RuntimeError('API down')):
            with pytest.raises(RuntimeError, match='API down'):
                _process_tweet(self.conn, self.account, self.tweet, 50)
            mock_debit.assert_not_called()
            args, _ = mock_record.call_args
            assert args[4] == 'failed'
