import json
from unittest.mock import patch, MagicMock


def _mock_response(labels):
    """Build an OpenAI-shaped mock response for classify_texts_individual."""
    choice = MagicMock()
    choice.message.content = json.dumps({"c": labels})
    resp = MagicMock()
    resp.choices = [choice]
    return resp


class TestClassifyTextsIndividual:

    def test_empty_list_returns_empty(self):
        from coleta.classifier import classify_texts_individual
        assert classify_texts_individual([], "Candidato") == []

    @patch("coleta.classifier.client")
    def test_positivo_label(self, mock_client):
        from coleta.classifier import classify_texts_individual
        mock_client.chat.completions.create.return_value = _mock_response(["positivo"])
        assert classify_texts_individual(["texto"], "Candidato") == ["positivo"]

    @patch("coleta.classifier.client")
    def test_negativo_label(self, mock_client):
        from coleta.classifier import classify_texts_individual
        mock_client.chat.completions.create.return_value = _mock_response(["negativo"])
        assert classify_texts_individual(["texto"], "Candidato") == ["negativo"]

    @patch("coleta.classifier.client")
    def test_neutro_label(self, mock_client):
        from coleta.classifier import classify_texts_individual
        mock_client.chat.completions.create.return_value = _mock_response(["neutro"])
        assert classify_texts_individual(["texto"], "Candidato") == ["neutro"]

    @patch("coleta.classifier.client")
    def test_uppercase_label_normalized(self, mock_client):
        from coleta.classifier import classify_texts_individual
        mock_client.chat.completions.create.return_value = _mock_response(["POSITIVO"])
        assert classify_texts_individual(["texto"], "Candidato") == ["positivo"]

    @patch("coleta.classifier.client")
    def test_unknown_label_defaults_to_neutro(self, mock_client):
        from coleta.classifier import classify_texts_individual
        mock_client.chat.completions.create.return_value = _mock_response(["desconhecido"])
        assert classify_texts_individual(["texto"], "Candidato") == ["neutro"]

    @patch("coleta.classifier.client")
    def test_large_input_split_into_batches(self, mock_client):
        from coleta.classifier import classify_texts_individual
        # 25 texts → 2 API calls: first batch of 20, second batch of 5
        mock_client.chat.completions.create.side_effect = [
            _mock_response(["positivo"] * 20),
            _mock_response(["negativo"] * 5),
        ]
        result = classify_texts_individual(["texto"] * 25, "Candidato")
        assert result == ["positivo"] * 20 + ["negativo"] * 5
        assert mock_client.chat.completions.create.call_count == 2

    @patch("coleta.classifier.client")
    def test_partial_llm_response_pads_with_neutro(self, mock_client):
        """When LLM returns fewer labels than texts, missing items are padded as neutro."""
        from coleta.classifier import classify_texts_individual
        mock_client.chat.completions.create.return_value = _mock_response(["positivo", "negativo"])
        result = classify_texts_individual(["a", "b", "c", "d", "e"], "Candidato")
        assert result == ["positivo", "negativo", "neutro", "neutro", "neutro"]

    @patch("coleta.classifier.client")
    def test_api_exception_pads_with_neutro(self, mock_client):
        """When the API call fails, all texts in the batch are padded as neutro."""
        from coleta.classifier import classify_texts_individual
        mock_client.chat.completions.create.side_effect = RuntimeError("API down")
        assert classify_texts_individual(["a", "b", "c"], "Candidato") == ["neutro", "neutro", "neutro"]


class TestClassifyTexts:

    @patch("coleta.classifier.client")
    def test_returns_pos_neu_neg_counts(self, mock_client):
        from coleta.classifier import classify_texts
        mock_client.chat.completions.create.return_value = _mock_response(
            ["positivo", "neutro", "negativo", "positivo"]
        )
        pos, neu, neg = classify_texts(["a", "b", "c", "d"], "Candidato")
        assert pos == 2
        assert neu == 1
        assert neg == 1

    def test_empty_list_returns_zero_counts(self):
        from coleta.classifier import classify_texts
        assert classify_texts([], "Candidato") == (0, 0, 0)
