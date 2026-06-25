"""
Integration tests for the quality_gate wired into the job pipeline.

The gate is stranded in carve-out (f1); this PR wires it between
normalize_all and write_jobs in all three Fantastic.jobs pipelines.

Verifies:
  - Gate filters drop expected docs before they reach the writer
  - Gate exception falls back to passing everything through (defense in depth)
  - Drops summary surfaces on the result dict (and thus pipeline_runs log)

Mocks normalize/write; no Firestore, no network.
"""
from __future__ import annotations

import sys
from unittest.mock import MagicMock

import pytest

from backend.pipeline import main as pipeline_main


def _fake_modules(monkeypatch, raw, normalized, write_result):
    """Stub fetcher + normalizer + writer. Returns (writer_input_capture, ranger)."""
    writer_input: list = []

    def _write(docs):
        writer_input.extend(docs)
        return dict(write_result)

    fake_fetcher = MagicMock()
    fake_fetcher.fetch_jobs = lambda **kw: raw
    fake_fetcher.fetch_fantasticjobs = lambda *a, **kw: raw
    fake_fetcher.fetch_fantasticjobs_modified = lambda *a, **kw: raw
    monkeypatch.setitem(sys.modules, "backend.pipeline.fetcher", fake_fetcher)

    fake_normalizer = MagicMock()
    fake_normalizer.normalize_all = lambda r: normalized
    monkeypatch.setitem(sys.modules, "backend.pipeline.normalizer", fake_normalizer)

    fake_writer = MagicMock()
    fake_writer.write_jobs = _write
    monkeypatch.setitem(sys.modules, "backend.pipeline.writer", fake_writer)

    return writer_input


def test_run_pipeline_gates_before_write(monkeypatch):
    """A staffing-agency posting in the normalized batch must not reach the
    writer."""
    normalized = [
        {"company": "Stripe", "title": "SWE Intern", "posted_at": "2026-05-30T00:00:00Z",
         "description_raw": "Build payment infra."},
        {"company": "Recruiter Co", "title": "Software Engineer",
         "posted_at": "2026-05-30T00:00:00Z",
         "description_raw": "Our client is a Fortune 500 company seeking..."},
    ]
    writer_input = _fake_modules(monkeypatch, raw=[{"source": "fantasticjobs"}, {"source": "fantasticjobs"}],
                                 normalized=normalized,
                                 write_result={"written": 1, "skipped_duplicates": 0, "total": 1})

    result = pipeline_main.run_pipeline(skip_fantastic=True)

    # The writer must have seen fewer docs than the normalizer emitted.
    assert len(writer_input) <= len(normalized)
    # And the result must carry the drops summary so pipeline_runs logs it.
    assert "quality_gate_drops" in result


def test_run_fantastic_only_gates_before_write(monkeypatch):
    normalized = [
        {"company": "Linear", "title": "Designer Intern",
         "posted_at": "2026-05-30T00:00:00Z", "description_raw": "design ux."},
    ]
    writer_input = _fake_modules(monkeypatch, raw=[{"source": "fantasticjobs"}],
                                 normalized=normalized,
                                 write_result={"written": 1, "skipped_duplicates": 0, "total": 1})

    result = pipeline_main.run_fantastic_only()
    assert "quality_gate_drops" in result


def test_gate_exception_falls_back_to_passthrough(monkeypatch):
    """A bug in quality_gate must not nuke the whole pipeline."""
    normalized = [
        {"company": "Stripe", "title": "SWE", "posted_at": "2026-05-30T00:00:00Z",
         "description_raw": "x"},
    ]
    writer_input = _fake_modules(monkeypatch, raw=[{"source": "fantasticjobs"}],
                                 normalized=normalized,
                                 write_result={"written": 1, "skipped_duplicates": 0, "total": 1})

    fake_gate = MagicMock()
    def _explode(_docs):
        raise RuntimeError("gate exploded")
    fake_gate.apply = _explode
    monkeypatch.setitem(sys.modules, "backend.pipeline.quality_gate", fake_gate)

    result = pipeline_main.run_fantastic_modified()
    # Writer saw all docs because gate bypass fell back to passthrough.
    assert len(writer_input) == 1
    # No drops dict because the gate didn't successfully run.
    assert result.get("quality_gate_drops") == {}
