"""Page-range selection: JobConfig parsing, pdf2zh CLI args, Python API kwargs."""

from __future__ import annotations

import pytest

from app.jobs import JobConfig
from app.translate import _python_api_variants, build_pdf2zh_cmd


def make_config(pages: str | None = None) -> JobConfig:
    data = {
        "baseUrl": "https://api.example.com/v1",
        "model": "gpt-test",
        "lang_in": "en",
        "lang_out": "vi",
    }
    if pages is not None:
        data["pages"] = pages
    return JobConfig.from_dict(data)


class TestJobConfigPages:
    def test_absent_pages_defaults_to_none(self):
        assert make_config().pages is None

    def test_blank_pages_normalized_to_none(self):
        assert make_config("   ").pages is None

    def test_valid_pages_kept_trimmed(self):
        assert make_config(" 1-3, 5 ").pages == "1-3, 5"

    @pytest.mark.parametrize("bad", ["abc", "1;2", "1,,2", "1-", "-5", "0", "5-2", "1.5"])
    def test_invalid_pages_raises(self, bad: str):
        with pytest.raises(ValueError):
            make_config(bad)

    def test_redacted_summary_includes_pages(self):
        assert "pages='1-3, 5'" in make_config("1-3, 5").redacted_summary()

    def test_redacted_summary_omits_pages_when_unset(self):
        assert "pages=" not in make_config().redacted_summary()

    def test_page_indices_expands_to_zero_based(self):
        assert make_config("1-3, 5").page_indices() == [0, 1, 2, 4]

    def test_page_indices_none_when_unset(self):
        assert make_config().page_indices() is None


class TestPdf2zhInvocation:
    def _job(self, pages: str | None, tmp_path):
        from app.jobs import Job, JobState

        config = make_config(pages)
        return Job(
            id="job_test",
            state=JobState.queued,
            work_dir=tmp_path,
            source_path=tmp_path / "source.pdf",
            config=config,
        )

    def test_cli_cmd_without_pages_has_no_p_flag(self, tmp_path):
        job = self._job(None, tmp_path)
        cmd = build_pdf2zh_cmd(job, tmp_path / "out", 4)
        assert "-p" not in cmd

    def test_cli_cmd_with_pages_appends_p_flag(self, tmp_path):
        job = self._job("1-3, 5", tmp_path)
        cmd = build_pdf2zh_cmd(job, tmp_path / "out", 4)
        assert cmd[cmd.index("-p") + 1] == "1-3, 5"

    def test_python_api_variants_lead_with_pages_when_set(self, tmp_path):
        job = self._job("1-3, 5", tmp_path)
        variants = _python_api_variants(job, tmp_path / "out", 4)
        assert variants[0]["pages"] == [0, 1, 2, 4]
        # Fallback variant omits pages for signatures without the kwarg.
        assert "pages" not in variants[1]

    def test_python_api_variants_without_pages(self, tmp_path):
        job = self._job(None, tmp_path)
        variants = _python_api_variants(job, tmp_path / "out", 4)
        assert all("pages" not in v for v in variants)
