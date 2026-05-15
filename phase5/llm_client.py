"""OpenRouter LLM client wrapper. Retries with backoff, concurrent dispatch.

Env vars:
    OPENROUTER_API_KEY  required (unless explicit api_key passed)
"""
from __future__ import annotations

import json
import os
import random
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Iterator, List, Tuple

from openai import APIError, OpenAI


OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


class LLMError(RuntimeError):
    """Raised when the LLM call exhausts all retries."""


def _strip_json_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()


class LLMClient:
    def __init__(
        self,
        *,
        model: str,
        api_key: str | None = None,
        concurrency: int = 8,
        temperature: float = 0.7,
        timeout: float = 90.0,
    ) -> None:
        key = api_key or os.getenv("OPENROUTER_API_KEY")
        if not key:
            raise RuntimeError("OPENROUTER_API_KEY not set")
        self.model = model
        self.concurrency = concurrency
        self.temperature = temperature
        self.timeout = timeout
        self._client = OpenAI(api_key=key, base_url=OPENROUTER_BASE_URL)

    def call(
        self,
        prompt: str,
        *,
        max_retries: int = 3,
        base_backoff: float = 1.0,
        temperature: float | None = None,
    ) -> Any:
        last_err: Exception | None = None
        current_temp = temperature if temperature is not None else self.temperature
        for attempt in range(max_retries):
            try:
                resp = self._client.chat.completions.create(
                    model=self.model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=current_temp,
                    timeout=self.timeout,
                )
                content = resp.choices[0].message.content or ""
                stripped = _strip_json_fence(content)
                if not stripped:
                    raise ValueError("empty response after stripping fence")
                return json.loads(stripped)
            except (json.JSONDecodeError, ValueError) as e:
                last_err = e
                # for JSON errors, slightly lower temperature on retry
                current_temp = max(0.1, current_temp - 0.2)
            except (APIError, OSError) as e:
                last_err = e
            if attempt < max_retries - 1:
                delay = base_backoff * (2 ** attempt) + random.uniform(0, 0.5)
                if delay > 0:
                    time.sleep(delay)
        raise LLMError(f"All {max_retries} attempts failed: {last_err}")

    def call_many(
        self,
        prompts: List[str],
        *,
        max_retries: int = 3,
        base_backoff: float = 1.0,
        temperature: float | None = None,
    ) -> Iterator[Tuple[int, Any, Exception | None]]:
        """Yields (index, result_or_None, error_or_None) in COMPLETION order
        (not input order). Callers should look up their input by index, not
        by position. This streaming yield enables per-item DB writes from
        the consumer so Ctrl-C loses at most one in-flight LLM call per
        worker thread, not the entire batch.
        """

        def _task(idx, prompt):
            try:
                return idx, self.call(
                    prompt,
                    max_retries=max_retries,
                    base_backoff=base_backoff,
                    temperature=temperature,
                ), None
            except LLMError as e:
                return idx, None, e
            except Exception as e:
                # Wrap unexpected errors so the consumer's error branch handles them
                return idx, None, LLMError(f"unexpected {type(e).__name__}: {e}")

        with ThreadPoolExecutor(max_workers=self.concurrency) as pool:
            futures = [pool.submit(_task, i, p) for i, p in enumerate(prompts)]
            for fut in as_completed(futures):
                yield fut.result()
