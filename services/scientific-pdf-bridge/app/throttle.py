"""Pool-compatible request throttle for pdf2zh LLM calls.

Mirrors extension PoolKey semantics:
- max_rpm: 0 = unlimited; else sliding 60s window
- concurrency_limit: 0 = unlimited (cap applied by caller for pdf2zh threads)
- interval_ms: min gap between request *starts* (0 = off)
"""

from __future__ import annotations

import logging
import threading
import time
from collections import deque
from typing import Any, Callable

logger = logging.getLogger("scientific_pdf_bridge.throttle")


def resolve_pdf2zh_threads(concurrency_limit: int, max_rpm: int = 0) -> int:
    """Map pool concurrency/RPM to pdf2zh ``-t`` worker count.

    - concurrency_limit > 0 → that many threads (capped 1–8)
    - concurrency_limit == 0 (unlimited in extension) → 4 (pdf2zh-ish default, capped)
    - low max_rpm further caps threads so we don't burst the provider
    """
    if concurrency_limit > 0:
        threads = max(1, min(8, concurrency_limit))
    else:
        threads = 4

    if max_rpm > 0:
        if max_rpm <= 20:
            threads = min(threads, 1)
        elif max_rpm <= 40:
            threads = min(threads, 2)
        else:
            # Rough: keep parallel workers well under RPM budget
            threads = min(threads, max(1, max_rpm // 15))

    return max(1, threads)


class RequestThrottle:
    """Thread-safe acquire/release matching extension rate-limit + interval + concurrency."""

    def __init__(
        self,
        *,
        max_rpm: int = 0,
        interval_ms: int = 0,
        concurrency_limit: int = 0,
    ) -> None:
        self.max_rpm = max(0, int(max_rpm))
        self.interval_ms = max(0, int(interval_ms))
        # 0 concurrency = no semaphore limit (threads already limited)
        conc = int(concurrency_limit)
        self._sem: threading.Semaphore | None
        if conc > 0:
            self._sem = threading.Semaphore(conc)
        else:
            self._sem = None
        self._lock = threading.Lock()
        self._starts: deque[float] = deque()
        self._last_start = 0.0

    def acquire(self) -> None:
        if self._sem is not None:
            self._sem.acquire()
        try:
            while True:
                wait = 0.0
                with self._lock:
                    now = time.monotonic()
                    # Min interval between request starts
                    if self.interval_ms > 0 and self._last_start > 0:
                        elapsed_ms = (now - self._last_start) * 1000.0
                        if elapsed_ms < self.interval_ms:
                            wait = max(wait, (self.interval_ms - elapsed_ms) / 1000.0)
                    # Sliding 60s RPM window
                    if self.max_rpm > 0:
                        window_start = now - 60.0
                        while self._starts and self._starts[0] < window_start:
                            self._starts.popleft()
                        if len(self._starts) >= self.max_rpm:
                            oldest = self._starts[0]
                            wait = max(wait, oldest + 60.0 - now + 0.01)
                    if wait <= 0:
                        now = time.monotonic()
                        self._last_start = now
                        if self.max_rpm > 0:
                            self._starts.append(now)
                        return
                time.sleep(min(wait, 1.0))
        except BaseException:
            if self._sem is not None:
                self._sem.release()
            raise

    def release(self) -> None:
        if self._sem is not None:
            self._sem.release()


_installed = False
_install_lock = threading.Lock()


def install_openai_throttle(
    *,
    max_rpm: int,
    interval_ms: int,
    concurrency_limit: int,
) -> RequestThrottle | None:
    """Monkey-patch openai chat completions to honor throttle (idempotent per process).

    Returns the throttle instance, or None if openai is unavailable / nothing to enforce.
    """
    global _installed
    if max_rpm <= 0 and interval_ms <= 0 and concurrency_limit <= 0:
        logger.info("Throttle off (maxRpm=0, interval=0, concurrency unlimited)")
        return None

    throttle = RequestThrottle(
        max_rpm=max_rpm,
        interval_ms=interval_ms,
        concurrency_limit=concurrency_limit if concurrency_limit > 0 else 0,
    )
    logger.info(
        "Installing OpenAI throttle: maxRpm=%s intervalMs=%s concurrency=%s",
        max_rpm,
        interval_ms,
        concurrency_limit if concurrency_limit > 0 else "unlimited",
    )

    try:
        import openai  # type: ignore
    except ImportError:
        logger.warning("openai package not importable; throttle not installed")
        return throttle

    with _install_lock:
        # Always re-bind to current throttle for this job process (pdf2zh is a subprocess,
        # so parent process patch only helps Python API path; CLI needs env-side approach).
        _patch_openai_module(openai, throttle)
        _installed = True
    return throttle


def _patch_openai_module(openai: Any, throttle: RequestThrottle) -> None:
    """Wrap chat.completions.create / parse on OpenAI client classes."""

    def wrap_method(orig: Callable[..., Any]) -> Callable[..., Any]:
        def wrapped(*args: Any, **kwargs: Any) -> Any:
            throttle.acquire()
            try:
                return orig(*args, **kwargs)
            finally:
                throttle.release()

        return wrapped

    # openai>=1.x: resources.chat.completions.Completions.create
    try:
        from openai.resources.chat.completions import Completions  # type: ignore

        if hasattr(Completions, "create") and not getattr(
            Completions.create, "_anyllm_throttled", False
        ):
            Completions.create = wrap_method(Completions.create)  # type: ignore[method-assign]
            Completions.create._anyllm_throttled = True  # type: ignore[attr-defined]
        if hasattr(Completions, "parse") and not getattr(
            Completions.parse, "_anyllm_throttled", False
        ):
            Completions.parse = wrap_method(Completions.parse)  # type: ignore[method-assign]
            Completions.parse._anyllm_throttled = True  # type: ignore[attr-defined]
    except Exception as exc:  # noqa: BLE001
        logger.debug("Could not patch Completions: %s", exc)

    try:
        from openai.resources.chat.completions import AsyncCompletions  # type: ignore

        # Async path: acquire in thread-ish way is wrong; skip or use sync sleep in async
        # pdf2zh uses sync client primarily.
        _ = AsyncCompletions
    except Exception:  # noqa: BLE001
        pass

    _ = openai
