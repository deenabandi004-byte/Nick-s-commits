# Cleanup / tech-debt backlog

Small, known issues to fix in a later pass. Not blocking, but tracked so they
don't rot silently.

| Item | Why it matters | Found |
|------|----------------|-------|
| `tests/test_scout_workflow_state.py::test_outbox_field_shape` is permanently red — asserts `row["status"] == "sent"` but `get_outbox_status` returns `"no_reply_24d"` for an `email_sent` contact 3 days out. | A test that's always red stops being a signal; a real regression in `get_outbox_status` would hide behind it. Either fix the assertion to the current status vocabulary or update the serializer if `"sent"` is the intended value. | 2026-06-12 (Loops↔Tracker unification, Chunk A) |
| `tests/test_embedding_narrative.py` fails at collection: `ImportError: cannot import name '_narrative_text' from app.utils.embedding_ranker`. | Breaks `pytest` collection for any run that includes it (must `--ignore` it). Stale import — either restore the symbols or delete the test. | 2026-06-12 (Loops↔Tracker unification, Chunk A) |
