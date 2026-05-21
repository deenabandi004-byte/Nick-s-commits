#!/usr/bin/env bash
#
# seo-health-check.sh - verify Googlebot sees rendered content on programmatic pages
#
# Curls 30 URLs across all route types with a Googlebot user-agent.
# For each URL, checks: HTTP 200, body > 10KB (real render, not empty SPA shell),
# and a canonical tag is present. Exits 1 if any URL fails.
#
# Usage: bash scripts/seo-health-check.sh
#        bash scripts/seo-health-check.sh --verbose

set -euo pipefail

BASE="https://www.offerloop.ai"
UA="Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
VERBOSE="${1:-}"
MIN_SIZE=10000

URLS=(
  # /compare/ (5)
  "/compare/apollo-vs-citadel"
  "/compare/pwc-vs-kpmg"
  "/compare/vista-vs-thoma-bravo"
  "/compare/mckinsey-vs-deloitte"
  "/compare/goldman-sachs-vs-jpmorgan"

  # /meeting/ (5)
  "/meeting/mckinsey"
  "/meeting/bcg"
  "/meeting/goldman-sachs"
  "/meeting/citadel"
  "/meeting/google"

  # /cold-email/ (5)
  "/cold-email/investment-banking"
  "/cold-email/consulting"
  "/cold-email/hedge-funds"
  "/cold-email/tech"
  "/cold-email/private-equity"

  # /networking/ (5)
  "/networking/goldman-sachs"
  "/networking/mckinsey"
  "/networking/citadel"
  "/networking/google"
  "/networking/blackstone"

  # /alumni/ (5)
  "/alumni/usc"
  "/alumni/columbia"
  "/alumni/harvard"
  "/alumni/mit"
  "/alumni/wharton"

  # /blog/ (5)
  "/blog/cold-email-mckinsey-consultant"
  "/blog/alumni-networking-guide"
  "/blog/how-to-find-professional-email-address"
  "/blog/cold-email-investment-banking"
  "/blog/networking-guide-finance"
)

passed=0
failed=0
failed_urls=()

printf "\n  SEO Health Check - %d URLs\n" "${#URLS[@]}"
printf "  %-60s %s\n" "URL" "RESULT"
printf "  %s\n" "$(printf '%.0s-' {1..80})"

for path in "${URLS[@]}"; do
  url="${BASE}${path}"
  tmpfile=$(mktemp)

  http_code=$(curl -s -o "$tmpfile" -w "%{http_code}" -A "$UA" --max-time 30 "$url" 2>/dev/null || echo "000")
  body_size=$(wc -c < "$tmpfile" | tr -d ' ')
  has_canonical=$(grep -c "canonical" "$tmpfile" 2>/dev/null | head -1 || echo "0")

  rm -f "$tmpfile"

  status_ok=true
  reasons=()

  if [ "$http_code" != "200" ]; then
    status_ok=false
    reasons+=("HTTP ${http_code}")
  fi

  if [ "$body_size" -lt "$MIN_SIZE" ]; then
    status_ok=false
    reasons+=("${body_size}B < ${MIN_SIZE}B")
  fi

  if [ "$has_canonical" -eq 0 ]; then
    status_ok=false
    reasons+=("no canonical")
  fi

  if $status_ok; then
    passed=$((passed + 1))
    printf "  %-60s \033[32mPASS\033[0m  %s  %sB\n" "$path" "$http_code" "$body_size"
  else
    failed=$((failed + 1))
    failed_urls+=("$path")
    reason_str=$(IFS=", "; echo "${reasons[*]}")
    printf "  %-60s \033[31mFAIL\033[0m  %s\n" "$path" "$reason_str"
  fi

  if [ "$VERBOSE" = "--verbose" ]; then
    printf "       status=%s size=%s canonical=%s\n" "$http_code" "$body_size" "$has_canonical"
  fi
done

total=$((passed + failed))
printf "\n  %s\n" "$(printf '%.0s-' {1..80})"
printf "  Results: %d/%d passed" "$passed" "$total"

if [ "$failed" -gt 0 ]; then
  printf "  \033[31m(%d failed)\033[0m\n\n" "$failed"
  printf "  Failed URLs:\n"
  for u in "${failed_urls[@]}"; do
    printf "    - %s\n" "$u"
  done
  printf "\n"
  exit 1
else
  printf "  \033[32m(all clear)\033[0m\n\n"
  exit 0
fi
