"""Translation backends: mock PDFs or real pdf2zh subprocess/API."""

from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Literal

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


def _build_env(config: JobConfig) -> dict[str, str]:
    env = os.environ.copy()
    env["OPENAI_BASE_URL"] = config.base_url
    env["OPENAI_MODEL"] = config.model
    if config.api_key is not None:
        env["OPENAI_API_KEY"] = config.api_key
    elif "OPENAI_API_KEY" not in env:
        # Some OpenAI-compatible servers ignore the key; set empty rather than crash.
        env["OPENAI_API_KEY"] = "no-key"
    return env


def _run_pdf2zh_cli(job: Job, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    out_dir = job.work_dir / "out"
    out_dir.mkdir(exist_ok=True)

    # Prefer module invocation so venv installs work without PATH.
    base_cmd = [sys.executable, "-m", "pdf2zh"]
    if shutil.which("pdf2zh"):
        base_cmd = ["pdf2zh"]

    # Common pdf2zh CLI: pdf2zh file.pdf -li en -lo vi -s openai -o outdir
    cmd = [
        *base_cmd,
        str(job.source_path),
        "-li",
        job.config.lang_in,
        "-lo",
        job.config.lang_out,
        "-s",
        "openai",
        "-o",
        str(out_dir),
    ]
    # Also try service:model form used by some versions (second attempt on failure).
    timeout = TRANSLATE_TIMEOUT_SECONDS or None
    logger.info(
        "Running pdf2zh for %s: %s",
        job.id,
        " ".join(cmd[:1] + ["…"] + cmd[2:]),  # skip full path noise
    )
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            env=env,
            timeout=timeout,
            check=False,
            cwd=str(job.work_dir),
        )
    except FileNotFoundError:
        # Fall back to python -m if bare pdf2zh missing
        cmd[0:1] = [sys.executable, "-m", "pdf2zh"]
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            env=env,
            timeout=timeout,
            check=False,
            cwd=str(job.work_dir),
        )
    return result


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

    # Try Python API first when importable (avoids CLI flag drift).
    try:
        mono, dual = _try_python_api(job, env)
        if mono and dual:
            return mono, dual
    except Exception as exc:  # noqa: BLE001
        logger.info("pdf2zh Python API path failed, trying CLI: %s", type(exc).__name__)

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
        kwargs_variants = [
            {
                "lang_in": job.config.lang_in,
                "lang_out": job.config.lang_out,
                "service": "openai",
                "output": str(job.work_dir / "out"),
                "thread": 1,
            },
            {
                "lang_in": job.config.lang_in,
                "lang_out": job.config.lang_out,
                "service": f"openai:{job.config.model}",
                "output": str(job.work_dir / "out"),
            },
        ]
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
