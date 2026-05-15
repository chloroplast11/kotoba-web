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


def test_parse_provider_order_empty():
    from phase5.llm_client import parse_provider_order
    assert parse_provider_order(None) is None
    assert parse_provider_order("") is None
    assert parse_provider_order("  ") is None
    assert parse_provider_order(",,,") is None


def test_parse_provider_order_strips_and_splits():
    from phase5.llm_client import parse_provider_order
    assert parse_provider_order("a,b,c") == ["a", "b", "c"]
    assert parse_provider_order(" a , b , c ") == ["a", "b", "c"]
    assert parse_provider_order("a,,b") == ["a", "b"]


def test_call_passes_provider_order_in_extra_body():
    client = LLMClient(model="x", api_key="k", concurrency=1, provider_order=["atlas-cloud/fp8", "novita"])
    client._client = MagicMock()
    client._client.chat.completions.create.return_value = _mock_completion('{"ok": true}')
    client.call("hi")
    call_kwargs = client._client.chat.completions.create.call_args.kwargs
    assert call_kwargs["extra_body"] == {"provider": {"order": ["atlas-cloud/fp8", "novita"]}}


def test_call_omits_extra_body_when_no_provider_order():
    client = LLMClient(model="x", api_key="k", concurrency=1)
    client._client = MagicMock()
    client._client.chat.completions.create.return_value = _mock_completion('{"ok": true}')
    client.call("hi")
    call_kwargs = client._client.chat.completions.create.call_args.kwargs
    assert "extra_body" not in call_kwargs


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
