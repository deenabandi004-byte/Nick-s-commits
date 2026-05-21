"""
Reddit opportunity scanner - finds high-intent threads relevant to Offerloop
and sends ranked results to Telegram.

No Reddit API key or OAuth required - uses public JSON endpoints only.

Usage:
    python scripts/reddit_scanner.py              # one-shot scan
    python scripts/reddit_scanner.py --loop 30    # scan every 30 minutes

Env vars required:
    TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

Optional:
    REDDIT_USER_AGENT  (default: offerloop-scanner/1.0)
"""
import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SUBREDDITS = [
    "cscareerquestions",
    "internships",
    "FinancialCareers",
    "resumes",
    "college",
    "careerguidance",
    "jobs",
    "consulting",
    "MBA",
    "wallstreetjobs",
]

KEYWORD_GROUPS = {
    "networking": {
        "keywords": [
            "cold email", "cold emailing", "networking", "reach out",
            "reaching out", "connect with", "don't know anyone",
            "no connections", "linkedin message", "informational interview",
        ],
        "feature": "Contact Search + Email Drafting",
        "emoji": "📧",
    },
    "meeting": {
        "keywords": [
            "meeting", "informational interview", "what to ask",
            "meeting with professional", "talk to alumni", "alumni outreach",
            "networking call", "phone screen prep",
        ],
        "feature": "Meeting Prep",
        "emoji": "☕",
    },
    "resume": {
        "keywords": [
            "resume review", "resume help", "ats", "applicant tracking",
            "not getting callbacks", "no interviews", "resume format",
            "resume tips", "resume feedback", "tailor resume", "optimize resume",
        ],
        "feature": "Resume Workshop",
        "emoji": "📄",
    },
    "job_search": {
        "keywords": [
            "job search", "applying to jobs", "job board", "finding jobs",
            "how to find", "entry level", "new grad", "first job",
            "job hunting", "application tracker",
        ],
        "feature": "Job Board + Tracker",
        "emoji": "🔍",
    },
    "internship": {
        "keywords": [
            "internship", "summer intern", "intern search", "intern application",
            "internship tips", "how to get internship", "internship cold email",
        ],
        "feature": "Internship Search",
        "emoji": "🎓",
    },
    "finance_recruiting": {
        "keywords": [
            "investment banking", "breaking into", "ib recruiting",
            "consulting recruiting", "mbb", "big 4", "pe recruiting",
            "hedge fund", "private equity", "bulge bracket",
            "boutique bank", "analyst program",
        ],
        "feature": "Finance/Consulting Pipeline",
        "emoji": "💰",
    },
    "cover_letter": {
        "keywords": [
            "cover letter", "writing cover letter", "cover letter help",
            "cover letter tips", "do i need a cover letter",
        ],
        "feature": "Cover Letter Generator",
        "emoji": "✉️",
    },
    "hiring_manager": {
        "keywords": [
            "hiring manager", "who to contact", "find recruiter",
            "recruiter email", "reach out to recruiter", "hr contact",
        ],
        "feature": "Hiring Manager Finder",
        "emoji": "👤",
    },
}

MIN_SCORE     = 1
MIN_COMMENTS  = 0
MAX_AGE_HOURS = 24
MAX_RESULTS   = 10
REQUEST_DELAY = 2   # seconds between requests - be polite

SEEN_FILE = Path(__file__).parent / ".reddit_seen.json"

HEADERS = {
    "User-Agent": os.getenv("REDDIT_USER_AGENT", "offerloop-scanner/1.0 (contact@offerloop.ai)"),
    "Accept": "application/json",
}

# ---------------------------------------------------------------------------
# Reddit fetch (no auth - public JSON endpoints)
# ---------------------------------------------------------------------------

def _fetch_listing(url: str) -> list[dict]:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        return [child["data"] for child in data["data"]["children"]
                if child["kind"] == "t3"]
    except Exception as e:
        print(f"[WARN] Failed to fetch {url}: {e}")
        return []


def fetch_subreddit_posts(subreddit: str) -> list[dict]:
    new_posts = _fetch_listing(f"https://www.reddit.com/r/{subreddit}/new.json?limit=50")
    time.sleep(REQUEST_DELAY)
    hot_posts = _fetch_listing(f"https://www.reddit.com/r/{subreddit}/hot.json?limit=25")

    seen_ids: set[str] = set()
    combined = []
    for post in new_posts + hot_posts:
        pid = post.get("id", "")
        if pid and pid not in seen_ids:
            seen_ids.add(pid)
            combined.append(post)
    return combined

# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def match_keywords(text: str) -> list[dict]:
    text_lower = text.lower()
    matches = []
    for group_id, group in KEYWORD_GROUPS.items():
        matched_kws = [kw for kw in group["keywords"] if kw in text_lower]
        if matched_kws:
            matches.append({
                "group": group_id,
                "feature": group["feature"],
                "emoji": group["emoji"],
                "matched_keywords": matched_kws,
            })
    return matches


def score_post(post: dict, keyword_matches: list[dict]) -> float:
    now       = datetime.now(timezone.utc).timestamp()
    age_hours = (now - post.get("created_utc", now)) / 3600
    engagement      = post.get("score", 0) + (post.get("num_comments", 0) * 2)
    recency         = max(0, 1.0 - (age_hours / MAX_AGE_HOURS))
    total_kw_matches = sum(len(m["matched_keywords"]) for m in keyword_matches)
    keyword_boost   = min(total_kw_matches * 0.3, 2.0)
    feature_boost   = len(keyword_matches) * 0.5
    return (engagement * 0.4) + (recency * 30) + (keyword_boost * 10) + (feature_boost * 5)


def priority_label(score: float) -> str:
    if score >= 40: return "🔥 HIGH"
    if score >= 20: return "⚡ MEDIUM"
    return "📌 LOW"

# ---------------------------------------------------------------------------
# Seen posts
# ---------------------------------------------------------------------------

def load_seen() -> set:
    if SEEN_FILE.exists():
        try:
            return set(json.loads(SEEN_FILE.read_text()).get("seen", []))
        except Exception:
            pass
    return set()


def save_seen(seen: set):
    SEEN_FILE.write_text(json.dumps({"seen": list(seen)[-2000:]}))

# ---------------------------------------------------------------------------
# Scanner
# ---------------------------------------------------------------------------

def scan_subreddits() -> list[dict]:
    seen    = load_seen()
    results = []

    for sub_name in SUBREDDITS:
        print(f"  Scanning r/{sub_name}...")
        posts = fetch_subreddit_posts(sub_name)
        print(f"    {len(posts)} posts fetched")
        time.sleep(REQUEST_DELAY)

        seen_in_sub: set[str] = set()
        for post in posts:
            pid = post.get("id", "")
            if not pid or pid in seen or pid in seen_in_sub:
                continue
            seen_in_sub.add(pid)

            age_hours = (datetime.now(timezone.utc).timestamp() - post.get("created_utc", 0)) / 3600
            if age_hours > MAX_AGE_HOURS:
                continue
            if post.get("score", 0) < MIN_SCORE or post.get("num_comments", 0) < MIN_COMMENTS:
                continue
            if post.get("over_18"):
                continue

            text            = f"{post.get('title', '')} {post.get('selftext', '')}"
            keyword_matches = match_keywords(text)
            if not keyword_matches:
                continue

            score = score_post(post, keyword_matches)
            results.append({
                "id":              pid,
                "subreddit":       sub_name,
                "title":           post.get("title", ""),
                "url":             f"https://reddit.com{post.get('permalink', '')}",
                "score":           post.get("score", 0),
                "num_comments":    post.get("num_comments", 0),
                "age_hours":       round(age_hours, 1),
                "keyword_matches": keyword_matches,
                "priority_score":  round(score, 1),
                "priority":        priority_label(score),
            })

    results.sort(key=lambda x: x["priority_score"], reverse=True)
    save_seen(seen | {r["id"] for r in results})
    return results[:MAX_RESULTS]

# ---------------------------------------------------------------------------
# Telegram
# ---------------------------------------------------------------------------

def send_telegram(message: str) -> bool:
    token   = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")

    if not token or not chat_id:
        print("[WARN] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set - printing to console:\n")
        print(message)
        return False

    url    = f"https://api.telegram.org/bot{token}/sendMessage"
    chunks = []
    if len(message) <= 4096:
        chunks = [message]
    else:
        lines, chunk = message.split("\n"), ""
        for line in lines:
            if len(chunk) + len(line) + 1 > 4000:
                chunks.append(chunk)
                chunk = line + "\n"
            else:
                chunk += line + "\n"
        if chunk:
            chunks.append(chunk)

    for chunk in chunks:
        try:
            resp = requests.post(url, json={
                "chat_id": chat_id, "text": chunk,
                "parse_mode": "HTML", "disable_web_page_preview": True,
            }, timeout=10)
            if resp.status_code != 200:
                print(f"[ERROR] Telegram: {resp.status_code} {resp.text[:200]}")
                return False
        except Exception as e:
            print(f"[ERROR] Telegram send failed: {e}")
            return False
    return True


def _escape_html(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def format_telegram_message(results: list[dict]) -> str:
    if not results:
        return "🔍 <b>Reddit Scan Complete</b>\n\nNo new high-intent threads found this cycle."

    now   = datetime.now(timezone.utc).strftime("%H:%M UTC")
    lines = [f"🔍 <b>Reddit Scan - {now}</b>\n", f"Found <b>{len(results)}</b> relevant threads:\n"]

    for i, r in enumerate(results, 1):
        features      = " ".join(m["emoji"] for m in r["keyword_matches"])
        feature_names = ", ".join(m["feature"] for m in r["keyword_matches"])
        lines.append(
            f"{'━' * 30}\n"
            f"{r['priority']} #{i}\n"
            f"<b>r/{r['subreddit']}</b> - {r['score']}↑ | {r['num_comments']} comments | {r['age_hours']}h ago\n\n"
            f"<b>{_escape_html(r['title'])}</b>\n"
            f"{r['url']}\n\n"
            f"{features} Relevant to: <i>{feature_names}</i>\n"
        )

    lines.append(f"{'━' * 30}\n\n💡 Reply with thread # for draft reply suggestions.")
    return "\n".join(lines)

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run_scan():
    print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S UTC')}] Scanning {len(SUBREDDITS)} subreddits...")
    results = scan_subreddits()
    print(f"  Found {len(results)} relevant threads")
    if results:
        sent = send_telegram(format_telegram_message(results))
        if sent:
            print(f"  ✓ Sent to Telegram ({len(results)} threads)")
    else:
        print("  No new threads matching criteria")


def main():
    parser = argparse.ArgumentParser(description="Reddit opportunity scanner for Offerloop")
    parser.add_argument("--loop", type=int, metavar="MINUTES",
                        help="Run continuously, scanning every N minutes")
    args = parser.parse_args()

    if args.loop:
        print(f"[INFO] Running every {args.loop} minutes. Ctrl+C to stop.")
        while True:
            try:
                run_scan()
                print(f"  Next scan in {args.loop} minutes...\n")
                time.sleep(args.loop * 60)
            except KeyboardInterrupt:
                print("\n[INFO] Stopped.")
                break
    else:
        run_scan()


if __name__ == "__main__":
    main()
