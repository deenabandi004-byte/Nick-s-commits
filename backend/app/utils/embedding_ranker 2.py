"""Semantic job-resume matching via OpenAI text embeddings.

Replaces the prior keyword-substring deterministic_score with cosine similarity
between a resume embedding and per-job title+description embeddings.

Both resume and job embeddings are cached:
  - resume embedding lives on the user doc (users/{uid}.resumeEmbedding +
    resumeEmbeddingHash), invalidated when the resume text hash changes.
    Kept on the user doc because user docs are not bulk-queried, so the
    ~12KB embedding has negligible read cost.
  - per-job embedding lives in its OWN collection
    (job_embeddings/{job_id}.embedding), NOT on the jobs doc itself.
    Reasoning: the rerank path queries 500 job docs via db.get_all; if the
    12KB embedding lived on the job doc, every rerank would pay ~6MB of
    Firestore egress just to read embeddings the SPA never needs. Keeping
    embeddings in a separate collection lets the bulk jobs query stay lean.

Fail-soft everywhere: any missing/failed embedding causes the caller to fall
back to the deterministic ranker.
"""
from __future__ import annotations

import hashlib
import logging
import math

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536
EMBED_BATCH_SIZE = 100
MAX_INPUT_CHARS = 8000

# Job embeddings live in their own collection (NOT on jobs/{job_id}) so the
# main jobs collection stays small for bulk feed queries. Each embedding is
# ~12KB; with 13K+ jobs that would add ~166MB to every db.get_all(refs) call
# in the ranker. The separate collection keeps the bulk query lean.
JOB_EMBEDDINGS_COLLECTION = "job_embeddings"


# ---------------------------------------------------------------------------
# Text extraction
# ---------------------------------------------------------------------------

def _safe_str_list(val) -> list[str]:
    if isinstance(val, list):
        return [v for v in val if isinstance(v, str) and v.strip()]
    if isinstance(val, str) and val.strip():
        return [val]
    return []


def _flatten_skills(skills) -> list[str]:
    """Skills can be a flat list, list of dicts, or list of lists."""
    out = []
    if not skills:
        return out
    if isinstance(skills, str):
        return [skills]
    if isinstance(skills, list):
        for s in skills:
            if isinstance(s, str):
                out.append(s)
            elif isinstance(s, dict):
                v = s.get("name") or s.get("skill") or s.get("value")
                if isinstance(v, str):
                    out.append(v)
                items = s.get("items") or s.get("skills") or []
                if isinstance(items, list):
                    out.extend(i for i in items if isinstance(i, str))
            elif isinstance(s, list):
                out.extend(i for i in s if isinstance(i, str))
    return out


def _resume_text(profile: dict) -> str:
    """Distill the profile into a focused embedding input.

    Order matters — the first lines carry the most weight because the model
    will attend to them more strongly in short inputs.
    """
    parts = []
    rp = profile.get("resumeParsed") or {}

    # 1) Career track + interests (clearest intent signal)
    goals = profile.get("goals") or {}
    track = goals.get("careerTrack")
    if isinstance(track, str) and track.strip():
        parts.append(f"Target career track: {track.strip()}")
    interests = _safe_str_list(goals.get("careerInterests"))
    if interests:
        parts.append("Career interests: " + ", ".join(interests))

    # 2) Skills (strong keyword signal)
    skills = _flatten_skills(rp.get("skills") or [])
    if skills:
        parts.append("Skills: " + ", ".join(skills[:40]))

    # 3) Education
    edu = rp.get("education") or {}
    if isinstance(edu, dict):
        major = edu.get("major") or profile.get("major")
        school = edu.get("school") or edu.get("university") or profile.get("university")
        grad = edu.get("graduationYear") or profile.get("graduationYear")
        if major:
            parts.append(f"Major: {major}")
        if school:
            parts.append(f"School: {school}")
        if grad:
            parts.append(f"Graduation: {grad}")

    # 4) Recent experience titles (helps match by role family)
    work = rp.get("experience") or rp.get("workExperience") or []
    if isinstance(work, list):
        titles = []
        for w in work[:5]:
            if isinstance(w, dict):
                t = w.get("title") or w.get("position") or w.get("role")
                c = w.get("company") or w.get("employer")
                if isinstance(t, str):
                    titles.append(f"{t} at {c}" if isinstance(c, str) else t)
        if titles:
            parts.append("Recent experience: " + "; ".join(titles))

    # 5) Raw resume text for additional context
    raw = profile.get("resumeText")
    if isinstance(raw, str) and raw.strip():
        parts.append(raw[:2000])

    return "\n".join(parts).strip()


def _job_text(job: dict) -> str:
    parts = []
    title = job.get("title")
    if isinstance(title, str) and title.strip():
        parts.append(f"Job title: {title.strip()}")
    company = job.get("company")
    if isinstance(company, str) and company.strip():
        parts.append(f"Company: {company.strip()}")
    typ = job.get("type") or job.get("type_raw")
    if isinstance(typ, str) and typ.strip():
        parts.append(f"Employment type: {typ.strip()}")
    cat = job.get("category")
    if isinstance(cat, str) and cat.strip():
        parts.append(f"Category: {cat.strip()}")
    desc = job.get("description_raw")
    if isinstance(desc, str) and desc.strip():
        parts.append(desc[:1500])
    return "\n".join(parts).strip()


def _hash(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8", errors="ignore")).hexdigest()[:16]


# ---------------------------------------------------------------------------
# OpenAI calls
# ---------------------------------------------------------------------------

def _embed_batch(texts: list[str]) -> list[list[float] | None]:
    """Compute embeddings for a list of inputs in one API call. None on failure."""
    out: list[list[float] | None] = [None] * len(texts)
    indexed = [(i, t[:MAX_INPUT_CHARS]) for i, t in enumerate(texts) if t and t.strip()]
    if not indexed:
        return out
    try:
        from backend.app.services.openai_client import client
        if client is None:
            return out
        resp = client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=[t for _, t in indexed],
        )
        for (i, _), datum in zip(indexed, resp.data):
            out[i] = list(datum.embedding)
    except Exception as e:
        logger.warning("embedding batch failed (%d inputs): %s", len(indexed), e)
    return out


def _cosine(a, b) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    if na == 0 or nb == 0:
        return 0.0
    return dot / (math.sqrt(na) * math.sqrt(nb))


# ---------------------------------------------------------------------------
# Cache + score
# ---------------------------------------------------------------------------

def get_resume_embedding(uid: str, profile: dict, db=None) -> list[float] | None:
    """Return cached resume embedding, or compute + cache + return it."""
    if db is None:
        from backend.app.extensions import get_db
        db = get_db()
    if db is None:
        return None

    text = _resume_text(profile)
    if not text:
        return None
    text_hash = _hash(text)

    cached = profile.get("resumeEmbedding")
    cached_hash = profile.get("resumeEmbeddingHash")
    if (
        isinstance(cached, list)
        and len(cached) == EMBEDDING_DIM
        and cached_hash == text_hash
    ):
        return cached

    embs = _embed_batch([text])
    emb = embs[0] if embs else None
    if emb is None:
        return None

    try:
        db.collection("users").document(uid).update({
            "resumeEmbedding": emb,
            "resumeEmbeddingHash": text_hash,
        })
        logger.info("Cached resume embedding for uid=%s (hash=%s)", uid, text_hash)
    except Exception as e:
        logger.warning("failed to cache resume embedding uid=%s: %s", uid, e)

    return emb


def get_job_embeddings(jobs: list[dict], db=None) -> dict[str, list[float]]:
    """Return {job_id: embedding} for each job.

    Embeddings live in the `job_embeddings/{job_id}` collection so the bulk
    `jobs` query stays lean. Reads in batches via db.get_all (cheap); writes
    misses back to the same collection.

    Backwards-compat: also accepts an embedding pre-attached on `j['titleEmbedding']`
    (the legacy in-job-doc location), in case the migration hasn't completed for
    a given doc yet. New writes go to the new collection.
    """
    if db is None:
        from backend.app.extensions import get_db
        db = get_db()
    if db is None:
        return {}

    out: dict[str, list[float]] = {}
    needs_lookup: list[str] = []
    text_by_jid: dict[str, str] = {}

    # First pass: pick up legacy in-doc embeddings + queue lookups for the rest
    for j in jobs:
        jid = j.get("job_id")
        if not jid:
            continue
        legacy = j.get("titleEmbedding")
        if isinstance(legacy, list) and len(legacy) == EMBEDDING_DIM:
            out[jid] = legacy
            continue
        needs_lookup.append(jid)
        text = _job_text(j)
        if text:
            text_by_jid[jid] = text

    # Batch fetch from the separate collection
    BATCH = 100
    for i in range(0, len(needs_lookup), BATCH):
        chunk = needs_lookup[i:i + BATCH]
        refs = [db.collection(JOB_EMBEDDINGS_COLLECTION).document(jid) for jid in chunk]
        try:
            docs = db.get_all(refs)
        except Exception as e:
            logger.warning("job_embeddings get_all failed: %s", e)
            continue
        for d in docs:
            if not d.exists:
                continue
            data = d.to_dict() or {}
            emb = data.get("embedding")
            if isinstance(emb, list) and len(emb) == EMBEDDING_DIM:
                out[d.id] = emb

    # Compute + write any that are still missing
    missing = [(jid, text_by_jid[jid]) for jid in needs_lookup
               if jid not in out and jid in text_by_jid]
    if not missing:
        return out

    for i in range(0, len(missing), EMBED_BATCH_SIZE):
        chunk = missing[i:i + EMBED_BATCH_SIZE]
        embs = _embed_batch([t for _, t in chunk])
        for (jid, _), emb in zip(chunk, embs):
            if emb is None:
                continue
            out[jid] = emb
            try:
                db.collection(JOB_EMBEDDINGS_COLLECTION).document(jid).set({
                    "embedding": emb,
                    "model": EMBEDDING_MODEL,
                    "dim": EMBEDDING_DIM,
                })
            except Exception as e:
                logger.debug("failed to cache embedding for %s: %s", jid, e)

    logger.info("Embedded %d new jobs (cache had %d, in-collection)",
                len(missing), len(out) - len(missing))
    return out


def embedding_rank(jobs: list[dict], profile: dict, uid: str, top_n: int = 50) -> list[dict]:
    """Rank candidates by cosine similarity. Returns [] if embeddings unavailable.

    Each returned job has `_embedding_score` (0-100) and `match_score` set so
    downstream code (GPT reranker, sort, dedup) can use it interchangeably.
    """
    resume_emb = get_resume_embedding(uid, profile)
    if resume_emb is None:
        return []

    job_embs = get_job_embeddings(jobs)
    if not job_embs:
        return []

    scored = []
    for j in jobs:
        jid = j.get("job_id")
        if not jid:
            continue
        emb = job_embs.get(jid)
        if emb is None:
            continue
        sim = _cosine(resume_emb, emb)
        # text-embedding-3-small cosine usually 0.2-0.7 for related text.
        # Stretch to 0-100 with a floor of 0 (negative similarity → 0).
        score = max(0.0, sim) * 100.0
        j["_embedding_score"] = round(score, 2)
        j["match_score"] = round(score, 2)
        scored.append((j, score))

    scored.sort(key=lambda x: x[1], reverse=True)
    return [j for j, _ in scored[:top_n]]
