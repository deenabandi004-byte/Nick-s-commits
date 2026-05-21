# Blog Post Generation Script

Generates SEO-optimized blog posts from the content calendar using OpenAI.

## Setup

```bash
npm install openai
```

## Usage

```bash
OPENAI_API_KEY=your_key node scripts/generate-blog-post.cjs
```

The script will:
1. Read the content calendar from `~/Downloads/AEO/output/06_content_calendar.json`
2. Find the next unwritten post (checks existing files in `connect-grow-hire/src/content/blog/`)
3. Generate content via OpenAI (gpt-4o)
4. Save the markdown file with frontmatter
5. Add the blog URL to the sitemap

## Automation

A GitHub Actions workflow runs this every Friday at 9am UTC and creates a PR for review. Requires `OPENAI_API_KEY` set as a repository secret.

---

# SEO Health Check

Monitors whether Googlebot sees real rendered content on all programmatic page types.

## What it does

Curls 30 URLs across 6 route types (`/compare/`, `/meeting/`, `/cold-email/`, `/networking/`, `/alumni/`, `/blog/`) with a Googlebot user-agent. For each URL it checks:

1. **HTTP 200** (not 503 from Prerender quota, not 301 redirect)
2. **Body size > 10KB** (confirms Prerender rendered real content, not the empty 4.3KB SPA shell)
3. **Canonical tag present** (confirms meta tags are being injected)

## Usage

```bash
bash scripts/seo-health-check.sh           # standard output
bash scripts/seo-health-check.sh --verbose  # includes per-URL status/size/canonical details
```

Exits with code 0 if all 30 URLs pass, code 1 if any fail. Can be used in CI.

## When to run

- After any deploy that touches `backend/wsgi.py` (Prerender middleware, Cache-Control)
- After any deploy that touches `connect-grow-hire/src/pages/templates/` (meta tags)
- After upgrading or changing the Prerender.io plan/token
- Weekly as a smoke test (Prerender quota can exhaust silently)

## Interpreting failures

| Failure | Likely cause |
|---------|-------------|
| HTTP 503, body 0B | Prerender quota exhausted or token invalid |
| HTTP 200, body ~4303B | Prerender returning empty, fallback serving raw SPA |
| HTTP 200, body > 10KB, no canonical | Meta tags missing from that route's template |
| HTTP 301 | URL in the check list doesn't match canonical form |

## Related files

- `backend/wsgi.py` - Prerender middleware, Cache-Control headers
- `connect-grow-hire/src/pages/templates/` - all 6 programmatic page templates
- `scripts/browse-auth.sh` - authenticate the gstack headless browser for QA
