from InevitavelGPT2.worker import _parse_tweet, _strip_accents, _error_code


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
