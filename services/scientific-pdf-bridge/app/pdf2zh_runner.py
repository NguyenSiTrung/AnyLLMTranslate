"""CLI entry that installs pool throttle then runs pdf2zh.

Used instead of bare ``pdf2zh`` so maxRpm / concurrency / interval apply to
LLM calls inside the subprocess (monkeypatch does not cross process boundaries).

Env (set by translate.py):
  ANYLLM_MAX_RPM
  ANYLLM_CONCURRENCY_LIMIT
  ANYLLM_INTERVAL_MS
"""

from __future__ import annotations

import os
import sys


def main() -> None:
    max_rpm = int(os.environ.get("ANYLLM_MAX_RPM", "0") or "0")
    concurrency = int(os.environ.get("ANYLLM_CONCURRENCY_LIMIT", "0") or "0")
    interval_ms = int(os.environ.get("ANYLLM_INTERVAL_MS", "0") or "0")

    from .throttle import install_openai_throttle

    install_openai_throttle(
        max_rpm=max_rpm,
        interval_ms=interval_ms,
        concurrency_limit=concurrency,
    )

    # Delegate to pdf2zh CLI (argv already has runner module stripped by -m)
    # Reconstruct argv for pdf2zh: drop our module name, keep remaining flags/files.
    # When invoked as: python -m app.pdf2zh_runner <pdf> -li ...
    # sys.argv[0] is the module path; rest are pdf2zh args.
    try:
        from pdf2zh.pdf2zh import main as pdf2zh_main  # type: ignore
    except ImportError:
        # Older / alternate entry
        from pdf2zh import main as pdf2zh_main  # type: ignore

    # pdf2zh main() typically reads sys.argv
    # Ensure argv[0] looks like a program name
    if len(sys.argv) > 0:
        sys.argv[0] = "pdf2zh"
    pdf2zh_main()


if __name__ == "__main__":
    main()
