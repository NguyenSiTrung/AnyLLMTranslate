"""Unit tests for error classification and mock PDF generation."""

from __future__ import annotations

from app.translate import _classify_error, _minimal_pdf_bytes, parse_runtime_error


def test_classify_llm_auth():
    code, msg = _classify_error("Error 401 Unauthorized: invalid api key")
    assert code == "llm_auth"
    assert "authentication" in msg.lower() or "API key" in msg


def test_classify_timeout():
    code, _msg = _classify_error("Request timed out after 30s")
    assert code == "timeout"


def test_classify_redacts_sk_keys():
    code, msg = _classify_error("provider said sk-abcDEF1234567890 is bad")
    assert code == "llm_error"
    assert "sk-abcDEF1234567890" not in msg
    assert "sk-***" in msg


def test_parse_runtime_error_prefix():
    code, msg = parse_runtime_error(RuntimeError("llm_auth: no"))
    assert code == "llm_auth"
    assert msg == "no"


def test_minimal_pdf_magic():
    data = _minimal_pdf_bytes("hello")
    assert data.startswith(b"%PDF")
    assert b"%%EOF" in data
