import json
from unittest.mock import MagicMock, patch

import pytest

from phase5.llm_client import LLMClient, LLMError, _strip_json_fence


def test_strip_json_fence_with_fences():
    s = "```json\n{\"a\": 1}\n```"
    assert _strip_json_fence(s) == '{"a": 1}'


def test_strip_json_fence_no_fences():
    assert _strip_json_fence('{"a": 1}') == '{"a": 1}'


def test_strip_json_fence_lone_triple():
    assert _strip_json_fence("```\n[1,2]\n```") == "[1,2]"


def _mock_completion(content: str):
    msg = MagicMock()
    msg.content = content
    choice = MagicMock(); choice.message = msg
    resp = MagicMock(); resp.choices = [choice]
    return resp


def test_call_parses_json():
    client = LLMClient(model="x", api_key="k", concurrency=1)
    client._client = MagicMock()
    client._client.chat.completions.create.return_value = _mock_completion('{"ok": true}')
    result = client.call("hi")
    assert result == {"ok": True}


def test_call_retries_on_bad_json_then_succeeds():
    client = LLMClient(model="x", api_key="k", concurrency=1)
    client._client = MagicMock()
    client._client.chat.completions.create.side_effect = [
        _mock_completion("not json"),
        _mock_completion('{"ok": true}'),
    ]
    result = client.call("hi", max_retries=2, base_backoff=0.0)
    assert result == {"ok": True}
    assert client._client.chat.completions.create.call_count == 2


def test_call_raises_after_max_retries():
    client = LLMClient(model="x", api_key="k", concurrency=1)
    client._client = MagicMock()
    client._client.chat.completions.create.return_value = _mock_completion("garbage")
    with pytest.raises(LLMError):
        client.call("hi", max_retries=2, base_backoff=0.0)


def test_call_many_returns_all_results_keyed_by_index():
    client = LLMClient(model="x", api_key="k", concurrency=2)
    client._client = MagicMock()
    responses = ['{"i": 0}', "bad", '{"i": 2}']

    def side(model, messages, **kw):
        idx = int(messages[0]["content"])
        return _mock_completion(responses[idx])

    client._client.chat.completions.create.side_effect = side

    # Results may arrive in any order due to concurrency; collect and key by idx
    results = list(client.call_many(["0", "1", "2"], max_retries=1, base_backoff=0.0))
    assert len(results) == 3
    by_idx = {idx: (result, err) for idx, result, err in results}
    assert by_idx[0] == ({"i": 0}, None)
    assert by_idx[1][0] is None and isinstance(by_idx[1][1], LLMError)
    assert by_idx[2] == ({"i": 2}, None)
