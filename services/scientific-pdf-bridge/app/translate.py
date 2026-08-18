"""Translation backends: mock PDFs or real pdf2zh subprocess/API."""

from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Literal

from .config import MOCK_TRANSLATE, TRANSLATE_TIMEOUT_SECONDS
from .jobs import Job, JobConfig

logger = logging.getLogger("scientific_pdf_bridge.translate")

Pdf2zhStatus = Literal["available", "unavailable", "unknown"]


# Minimal valid single-page PDF (no external fonts required).
def _minimal_pdf_bytes(label: str) -> bytes:
    # Keep content stream length exact; label must be ASCII-safe for this mock.
    safe = re.sub(r"[^\x20-\x7e]", "?", label)[:40]
    stream = f"BT /F1 12 Tf 72 72 Td ({safe}) Tj ET"
    stream_bytes = stream.encode("ascii")
    objects = []
    objects.append(b"1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n")
    objects.append(b"2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n")
    objects.append(
        b"3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Contents 4 0 R /Resources << /Font << /F1 << /Type /Font "
        b"/Subtype /Type1 /BaseFont /Helvetica >> >> >> >>endobj\n"
    )
    objects.append(
        f"4 0 obj<< /Length {len(stream_bytes)} >>stream\n".encode("ascii")
        + stream_bytes
        + b"\nendstream\nendobj\n"
    )

    body = b"".join(objects)
    # Build xref with absolute offsets from start of file after header.
    header = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
    offsets = [0]
    cursor = len(header)
    pieces = [header]
    for obj in objects:
        offsets.append(cursor)
        pieces.append(obj)
        cursor += len(obj)

    xref_pos = cursor
    xref_lines = [f"xref\n0 {len(offsets)}\n".encode("ascii")]
    xref_lines.append(b"0000000000 65535 f \n")
    for off in offsets[1:]:
        xref_lines.append(f"{off:010d} 00000 n \n".encode("ascii"))
    trailer = (
        f"trailer<< /Size {len(offsets)} /Root 1 0 R >>\n"
        f"startxref\n{xref_pos}\n%%EOF\n"
    ).encode("ascii")
    return b"".join(pieces) + b"".join(xref_lines) + trailer


def pdf2zh_status() -> Pdf2zhStatus:
    if MOCK_TRANSLATE:
        return "available"
    # Prefer import, then CLI on PATH / python -m
    try:
        import pdf2zh  # type: ignore  # noqa: F401

        return "available"
    except ImportError:
        pass
    if shutil.which("pdf2zh"):
        return "available"
    # Some installs only expose module entry
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pdf2zh", "--help"],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        if result.returncode == 0 or "usage" in (result.stdout + result.stderr).lower():
            return "available"
    except (OSError, subprocess.TimeoutExpired):
        pass
    return "unavailable"


def _classify_error(text: str) -> tuple[str, str]:
    """Map process/API failure text to (code, message). Never include secrets."""
    lower = text.lower()
    auth_markers = (
        "401",
        "403",
        "unauthorized",
        "invalid api key",
        "invalid_api_key",
        "authentication",
        "incorrect api key",
        "permission denied",
        "access denied",
        "bearer token",
    )
    if any(m in lower for m in auth_markers):
        return "llm_auth", "LLM authentication failed (check API key / provider credentials)"

    timeout_markers = ("timeout", "timed out", "deadline exceeded")
    if any(m in lower for m in timeout_markers):
        return "timeout", "Translation timed out"

    # Truncate noisy stacks for client message
    clean = re.sub(r"sk-[A-Za-z0-9_\-]{8,}", "sk-***", text)
    clean = re.sub(r"Bearer\s+\S+", "Bearer ***", clean, flags=re.I)
    one_line = " ".join(clean.strip().split())
    if len(one_line) > 400:
        one_line = one_line[:397] + "..."
    if not one_line:
        one_line = "Translation failed"
    return "llm_error", one_line


def _find_artifacts(work_dir: Path, stem: str = "source") -> tuple[Path | None, Path | None]:
    """Locate mono/dual PDFs produced by pdf2zh (naming varies by version)."""
    candidates_mono: list[Path] = []
    candidates_dual: list[Path] = []

    patterns_mono = [
        f"{stem}-mono.pdf",
        f"{stem}.mono.pdf",
        f"{stem}_mono.pdf",
        "mono.pdf",
    ]
    patterns_dual = [
        f"{stem}-dual.pdf",
        f"{stem}.dual.pdf",
        f"{stem}_dual.pdf",
        "dual.pdf",
    ]

    for root, _dirs, files in os.walk(work_dir):
        for name in files:
            if not name.lower().endswith(".pdf"):
                continue
            path = Path(root) / name
            if path.name == "source.pdf":
                continue
            lower = name.lower()
            if "mono" in lower:
                candidates_mono.append(path)
            elif "dual" in lower:
                candidates_dual.append(path)

    mono = None
    dual = None
    for p in patterns_mono:
        hit = work_dir / p
        if hit.is_file():
            mono = hit
            break
    for p in patterns_dual:
        hit = work_dir / p
        if hit.is_file():
            dual = hit
            break

    if mono is None and candidates_mono:
        mono = max(candidates_mono, key=lambda p: p.stat().st_mtime)
    if dual is None and candidates_dual:
        dual = max(candidates_dual, key=lambda p: p.stat().st_mtime)

    # Some versions write only translated + dual; accept any other pdf as mono fallback.
    if mono is None or dual is None:
        others = [
            Path(root) / name
            for root, _d, files in os.walk(work_dir)
            for name in files
            if name.lower().endswith(".pdf") and name != "source.pdf"
        ]
        others = sorted(others, key=lambda p: p.stat().st_mtime)
        if mono is None and others:
            mono = others[0]
        if dual is None and len(others) >= 2:
            dual = others[-1]
        elif dual is None and mono is not None:
            # Dual missing: duplicate mono so client still has dual=true path
            dual = work_dir / f"{stem}-dual.pdf"
            if not dual.exists():
                shutil.copyfile(mono, dual)

    return mono, dual


def run_mock_translate(job: Job) -> tuple[Path, Path]:
    mono = job.work_dir / "source-mono.pdf"
    dual = job.work_dir / "source-dual.pdf"
    mono.write_bytes(_minimal_pdf_bytes(f"mono {job.id}"))
    dual.write_bytes(_minimal_pdf_bytes(f"dual {job.id}"))
    logger.info("Mock translate wrote mono+dual for %s", job.id)
    return mono, dual


def _bridge_package_root() -> Path:
    """Directory that contains the ``app`` package (Docker WORKDIR=/app)."""
    # …/app/translate.py → parent=app package dir → parent=package root
    return Path(__file__).resolve().parent.parent


def _build_env(config: JobConfig) -> dict[str, str]:
    env = os.environ.copy()
    env["OPENAI_BASE_URL"] = config.base_url
    env["OPENAI_MODEL"] = config.model
    if config.api_key is not None:
        env["OPENAI_API_KEY"] = config.api_key
    elif "OPENAI_API_KEY" not in env:
        # Some OpenAI-compatible servers ignore the key; set empty rather than crash.
        env["OPENAI_API_KEY"] = "no-key"
    # Throttle for pdf2zh_runner subprocess (same pool key as extension)
    env["ANYLLM_MAX_RPM"] = str(max(0, config.max_rpm))
    env["ANYLLM_CONCURRENCY_LIMIT"] = str(max(0, config.concurrency_limit))
    env["ANYLLM_INTERVAL_MS"] = str(max(0, config.interval_ms))
    # Subprocess uses cwd=job work dir; ensure `python -m app.pdf2zh_runner` resolves.
    root = str(_bridge_package_root())
    existing = env.get("PYTHONPATH", "").strip()
    env["PYTHONPATH"] = root if not existing else f"{root}{os.pathsep}{existing}"
    return env


def _parse_progress_fraction(line: str) -> float | None:
    """Extract 0–1 progress from tqdm-like lines, e.g. '14%|█…' or '3/10'."""
    m = re.search(r"(\d{1,3})\s*%", line)
    if m:
        pct = int(m.group(1))
        if 0 <= pct <= 100:
            return pct / 100.0
    m2 = re.search(r"(\d+)\s*/\s*(\d+)", line)
    if m2:
        a, b = int(m2.group(1)), int(m2.group(2))
        if b > 0:
            return min(1.0, a / b)
    return None


def build_pdf2zh_cmd(job: Job, out_dir: Path, threads: int) -> list[str]:
    """Full pdf2zh CLI argv, including the throttle runner prefix.

    Common pdf2zh CLI: file.pdf -li en -lo vi -s openai -o outdir -t N [-p pages]
    """
    # Runner installs OpenAI throttle inside the child process (pool RPM/interval).
    # Prefer app package on PYTHONPATH (WORKDIR=/app in Docker).
    base_cmd = [sys.executable, "-m", "app.pdf2zh_runner"]

    service = "openai"
    if job.config.model:
        service = f"openai:{job.config.model}"

    cmd = [
        *base_cmd,
        str(job.source_path),
        "-li",
        job.config.lang_in,
        "-lo",
        job.config.lang_out,
        "-s",
        service,
        "-o",
        str(out_dir),
        "-t",
        str(threads),
    ]
    if job.config.pages:
        cmd += ["-p", job.config.pages]
    return cmd


def _python_api_variants(job: Job, out_dir: Path, threads: int) -> list[dict[str, Any]]:
    """Ordered pdf2zh.translate() kwarg sets; later variants are TypeError fallbacks."""
    variants: list[dict[str, Any]] = [
        {
            "lang_in": job.config.lang_in,
            "lang_out": job.config.lang_out,
            "service": f"openai:{job.config.model}" if job.config.model else "openai",
            "output": str(out_dir),
            "thread": threads,
        },
        {
            "lang_in": job.config.lang_in,
            "lang_out": job.config.lang_out,
            "service": "openai",
            "output": str(out_dir),
            "thread": threads,
        },
    ]
    pages = job.config.page_indices()
    if pages is not None:
        # Lead with pages; fall back to the no-pages variant when the installed
        # pdf2zh signature does not accept the kwarg.
        variants[0] = {**variants[0], "pages": pages}
    return variants


def _run_pdf2zh_cli(job: Job, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    """Run pdf2zh CLI with **live** stdout/stderr → docker logs + job.message."""
    from .throttle import resolve_pdf2zh_threads

    out_dir = job.work_dir / "out"
    out_dir.mkdir(exist_ok=True)

    threads = resolve_pdf2zh_threads(
        job.config.concurrency_limit,
        job.config.max_rpm,
    )
    cmd = build_pdf2zh_cmd(job, out_dir, threads)
    timeout = TRANSLATE_TIMEOUT_SECONDS or None
    logger.info(
        "Running pdf2zh for %s: threads=%s maxRpm=%s intervalMs=%s concurrency=%s (timeout=%s)",
        job.id,
        threads,
        job.config.max_rpm,
        job.config.interval_ms,
        job.config.concurrency_limit,
        timeout if timeout else "none",
    )
    logger.info(
        "pdf2zh cmd for %s: %s",
        job.id,
        " ".join([cmd[0], cmd[1], "…", *cmd[3:]]),
    )

    # Force line-buffered-ish child output when possible.
    env = {**env, "PYTHONUNBUFFERED": "1"}
    # cwd = package root so relative imports stay stable; paths above are absolute.
    run_cwd = str(_bridge_package_root())

    def _start(argv: list[str]) -> subprocess.Popen[str]:
        return subprocess.Popen(
            argv,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,  # merge: pdf2zh progress often on stderr
            text=True,
            env=env,
            cwd=run_cwd,
            bufsize=1,  # line buffered when possible
        )

    try:
        proc = _start(cmd)
    except FileNotFoundError:
        # Last resort: bare pdf2zh without in-process throttle
        fallback = ["pdf2zh"] if shutil.which("pdf2zh") else [sys.executable, "-m", "pdf2zh"]
        runner_prefix = [sys.executable, "-m", "app.pdf2zh_runner"]
        cmd = [*fallback, *cmd[len(runner_prefix) :]]
        logger.warning("[%s] pdf2zh_runner missing; falling back to %s", job.id, fallback)
        proc = _start(cmd)

    job.process = proc
    collected: list[str] = []
    start = time.time()
    last_heartbeat = 0.0

    try:
        assert proc.stdout is not None
        while True:
            if job.cancel_requested:
                proc.terminate()
                break
            line = proc.stdout.readline()
            if line == "" and proc.poll() is not None:
                break
            if not line:
                # No output this tick — still alive; heartbeat every 15s
                now = time.time()
                if now - last_heartbeat >= 15:
                    last_heartbeat = now
                    elapsed = int(now - start)
                    msg = f"pdf2zh running… {elapsed}s (waiting for output)"
                    logger.info("[%s] %s", job.id, msg)
                    job.message = msg
                    job.touch()
                time.sleep(0.2)
                continue

            text = line.rstrip("\n")
            if not text.strip():
                continue
            collected.append(text)
            # Live docker logs — this is what users watch with `docker logs -f`
            logger.info("[%s] pdf2zh | %s", job.id, text[:500])

            frac = _parse_progress_fraction(text)
            if frac is not None:
                # Map 0–100% of pdf2zh into 0.15–0.9 of overall job
                job.progress = max(job.progress, min(0.95, 0.15 + frac * 0.75))
            job.message = text[:200]
            job.touch()

            if timeout and (time.time() - start) > timeout:
                proc.kill()
                raise subprocess.TimeoutExpired(cmd, timeout)

        returncode = proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        raise
    finally:
        job.process = None

    combined = "\n".join(collected)
    return subprocess.CompletedProcess(
        args=cmd,
        returncode=returncode if returncode is not None else -1,
        stdout=combined,
        stderr="",
    )


def run_pdf2zh_translate(job: Job) -> tuple[Path, Path]:
    """Execute real pdf2zh translation; raise RuntimeError with code prefix on failure.

    Exception message format: ``CODE: human message`` where CODE is llm_auth|llm_error|timeout|internal.
    """
    status = pdf2zh_status()
    if status != "available":
        raise RuntimeError(
            "internal: pdf2zh is not installed. "
            "Install with `pip install pdf2zh` or set MOCK_TRANSLATE=1 for development."
        )

    env = _build_env(job.config)

    # Install throttle in this process for Python API path
    try:
        from .throttle import install_openai_throttle, resolve_pdf2zh_threads

        install_openai_throttle(
            max_rpm=job.config.max_rpm,
            interval_ms=job.config.interval_ms,
            concurrency_limit=job.config.concurrency_limit,
        )
        _ = resolve_pdf2zh_threads  # used in CLI path
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not install throttle in parent: %s", exc)

    # Try Python API first when importable (avoids CLI flag drift).
    try:
        mono, dual = _try_python_api(job, env)
        if mono and dual:
            return mono, dual
    except Exception as exc:  # noqa: BLE001
        # Log the real reason so operators can see it in `docker logs`
        logger.info(
            "pdf2zh Python API path failed for %s, trying CLI: %s: %s",
            job.id,
            type(exc).__name__,
            str(exc)[:300],
        )

    try:
        result = _run_pdf2zh_cli(job, env)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("timeout: Translation timed out") from exc

    combined = (result.stdout or "") + "\n" + (result.stderr or "")
    if result.returncode != 0:
        code, msg = _classify_error(combined or f"pdf2zh exited {result.returncode}")
        raise RuntimeError(f"{code}: {msg}")

    mono, dual = _find_artifacts(job.work_dir)
    # Also search out/
    if mono is None or dual is None:
        out_mono, out_dual = _find_artifacts(job.work_dir / "out")
        mono = mono or out_mono
        dual = dual or out_dual

    if mono is None or not mono.is_file():
        code, msg = _classify_error(combined or "pdf2zh produced no mono PDF")
        raise RuntimeError(f"{code}: {msg}")
    if dual is None or not dual.is_file():
        dual = job.work_dir / "source-dual.pdf"
        shutil.copyfile(mono, dual)

    # Normalize names into work_dir root for stable downloads
    final_mono = job.work_dir / "source-mono.pdf"
    final_dual = job.work_dir / "source-dual.pdf"
    if mono.resolve() != final_mono.resolve():
        shutil.copyfile(mono, final_mono)
    if dual.resolve() != final_dual.resolve():
        shutil.copyfile(dual, final_dual)
    return final_mono, final_dual


def _try_python_api(job: Job, env: dict[str, str]) -> tuple[Path | None, Path | None]:
    """Best-effort use of pdf2zh.translate if available."""
    # Apply env for this process so library clients pick up keys.
    old = {k: os.environ.get(k) for k in ("OPENAI_BASE_URL", "OPENAI_API_KEY", "OPENAI_MODEL")}
    try:
        for k, v in env.items():
            if k.startswith("OPENAI_"):
                os.environ[k] = v

        # Historical API: pdf2zh.translate(files, ...)
        try:
            from pdf2zh import translate as pdf2zh_translate  # type: ignore
        except ImportError:
            return None, None

        files = [str(job.source_path)]
        from .throttle import resolve_pdf2zh_threads

        threads = resolve_pdf2zh_threads(
            job.config.concurrency_limit,
            job.config.max_rpm,
        )
        kwargs_variants = _python_api_variants(job, job.work_dir / "out", threads)
        last_err: Exception | None = None
        for kwargs in kwargs_variants:
            try:
                (job.work_dir / "out").mkdir(exist_ok=True)
                pdf2zh_translate(files, **kwargs)
                mono, dual = _find_artifacts(job.work_dir / "out")
                if mono is None:
                    mono, dual = _find_artifacts(job.work_dir)
                if mono:
                    return mono, dual
            except TypeError as exc:
                last_err = exc
                continue
            except Exception as exc:  # noqa: BLE001
                last_err = exc
                text = str(exc)
                code, msg = _classify_error(text)
                raise RuntimeError(f"{code}: {msg}") from exc
        if last_err:
            logger.debug("Python API variants failed: %s", last_err)
        return None, None
    finally:
        for k, v in old.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v


def translate_job(job: Job) -> tuple[Path, Path]:
    """Run mock or real translation for a job."""
    if MOCK_TRANSLATE:
        return run_mock_translate(job)
    return run_pdf2zh_translate(job)


def parse_runtime_error(exc: BaseException) -> tuple[str, str]:
    text = str(exc)
    if ": " in text:
        code, _, rest = text.partition(": ")
        if code in {"llm_auth", "llm_error", "timeout", "internal"}:
            return code, rest or text
    return "internal", text or "internal error"
