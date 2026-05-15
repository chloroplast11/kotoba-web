"""OpenRouter LLM client wrapper. Retries with backoff, concurrent dispatch.

Env vars:
    OPENROUTER_API_KEY  required (unless explicit api_key passed)
"""
from __future__ import annotations

import json
import os
import random
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Iterator, List, Tuple

from openai import OpenAI


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
        self._sem = threading.Semaphore(concurrency)

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
            except Exception as e:  # APIError, RateLimit, timeout, network
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
        """Yields (index, result_or_None, error_or_None) in INPUT order.

        Dispatches all prompts concurrently via ThreadPoolExecutor, but
        collects results into an index-aligned buffer and yields them in
        input order so callers can iterate alongside their input list.
        """

        def _task(idx: int, prompt: str):
            with self._sem:
                try:
                    result = self.call(
                        prompt,
                        max_retries=max_retries,
                        base_backoff=base_backoff,
                        temperature=temperature,
                    )
                    return idx, result, None
                except LLMError as e:
                    return idx, None, e

        with ThreadPoolExecutor(max_workers=self.concurrency) as pool:
            futures = [pool.submit(_task, i, p) for i, p in enumerate(prompts)]
            completed: List[Tuple[int, Any, Exception | None] | None] = [None] * len(prompts)
            for fut in as_completed(futures):
                idx, result, err = fut.result()
                completed[idx] = (idx, result, err)

        for tup in completed:
            assert tup is not None
            yield tup
