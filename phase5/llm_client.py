"""OpenRouter LLM client wrapper. Retries with backoff, concurrent dispatch.

Env vars:
    OPENROUTER_API_KEY  required (unless explicit api_key passed)
"""
from __future__ import annotations

import json
import os
import random
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError, as_completed
from typing import Any, Iterator, List, Tuple

import httpx
from openai import APIError, OpenAI


OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


def parse_provider_order(env_val: str | None) -> list[str] | None:
    """Parse a comma-separated provider list, ignoring blanks. Returns None if unset/empty."""
    if not env_val:
        return None
    items = [p.strip() for p in env_val.split(",") if p.strip()]
    return items or None


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
        provider_order: list[str] | None = None,
    ) -> None:
        key = api_key or os.getenv("OPENROUTER_API_KEY")
        if not key:
            raise RuntimeError("OPENROUTER_API_KEY not set")
        self.model = model
        self.concurrency = concurrency
        self.temperature = temperature
        self.timeout = timeout
        self.provider_order = provider_order
        http_client = httpx.Client(
            timeout=httpx.Timeout(connect=10.0, read=timeout, write=10.0, pool=10.0),
        )
        self._client = OpenAI(
            api_key=key,
            base_url=OPENROUTER_BASE_URL,
            http_client=http_client,
            max_retries=0,
        )

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
                kwargs = dict(
                    model=self.model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=current_temp if current_temp is not None else self.temperature,
                    timeout=self.timeout,
                )
                if self.provider_order:
                    kwargs["extra_body"] = {"provider": {"order": list(self.provider_order)}}
                resp = self._client.chat.completions.create(**kwargs)
                content = resp.choices[0].message.content or ""
                stripped = _strip_json_fence(content)
                if not stripped:
                    raise ValueError("empty response after stripping fence")
                return json.loads(stripped)
            except (json.JSONDecodeError, ValueError) as e:
                last_err = e
                # for JSON errors, slightly lower temperature on retry
                current_temp = max(0.1, current_temp - 0.2)
            except (APIError, OSError, httpx.HTTPError) as e:
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

        # Belt-and-suspenders: if a worker truly zombies past the SDK + httpx
        # timeouts, this stall budget prevents the whole chunk from hanging
        # forever. Budget = worst-case per-call (timeout * retries + backoff) + slack.
        stall_budget = self.timeout * max_retries + base_backoff * (2 ** max_retries) + 30.0

        with ThreadPoolExecutor(max_workers=self.concurrency) as pool:
            futures = [pool.submit(_task, i, p) for i, p in enumerate(prompts)]
            pending = set(futures)
            while pending:
                try:
                    for fut in as_completed(pending, timeout=stall_budget):
                        pending.discard(fut)
                        yield fut.result()
                except FutureTimeoutError:
                    # No future completed within the stall budget: treat the
                    # remaining as hung and synthesize errors so the caller
                    # can move on. Threads keep running but will exit on their
                    # own when httpx finally gives up (or process exit).
                    for fut in list(pending):
                        idx = futures.index(fut)
                        pending.discard(fut)
                        fut.cancel()
                        yield idx, None, LLMError(f"worker stalled > {stall_budget:.0f}s")
                    break
