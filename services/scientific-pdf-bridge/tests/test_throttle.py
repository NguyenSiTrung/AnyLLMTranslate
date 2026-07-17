"""Unit tests for pool-compatible throttle helpers."""

from __future__ import annotations

import time

from app.throttle import RequestThrottle, resolve_pdf2zh_threads


def test_resolve_threads_respects_concurrency():
    assert resolve_pdf2zh_threads(1, 0) == 1
    assert resolve_pdf2zh_threads(3, 0) == 3
    assert resolve_pdf2zh_threads(20, 0) == 8  # cap


def test_resolve_threads_unlimited_concurrency_defaults():
    assert resolve_pdf2zh_threads(0, 0) == 4


def test_resolve_threads_low_rpm_caps_parallelism():
    assert resolve_pdf2zh_threads(4, 20) == 1
    assert resolve_pdf2zh_threads(4, 30) == 2
    assert resolve_pdf2zh_threads(4, 100) >= 1


def test_interval_enforced():
    t = RequestThrottle(max_rpm=0, interval_ms=80, concurrency_limit=1)
    t.acquire()
    t.release()
    start = time.monotonic()
    t.acquire()
    elapsed = time.monotonic() - start
    t.release()
    assert elapsed >= 0.05  # at least ~50ms (allow scheduler slack)


def test_concurrency_semaphore():
    t = RequestThrottle(max_rpm=0, interval_ms=0, concurrency_limit=1)
    t.acquire()
    held = {"ok": False}

    def other() -> None:
        t.acquire()
        held["ok"] = True
        t.release()

    import threading

    thr = threading.Thread(target=other)
    thr.start()
    time.sleep(0.05)
    assert held["ok"] is False
    t.release()
    thr.join(timeout=1)
    assert held["ok"] is True
