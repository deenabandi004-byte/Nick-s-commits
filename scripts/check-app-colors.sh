#!/usr/bin/env bash
# check-app-colors.sh
#
# Flags color-system regressions in the Offerloop authenticated-app interior.
# Run from the repo root. Exits 1 if banned warm-grey or navy-grey hex values
# appear in app component / page code. These were swept to cool-slate values in
# the color cleanup; new code should use the canonical --c-* tokens defined in
# connect-grow-hire/src/index.css, or cool-slate hex.
#
# EXEMPT (intentionally keep their own palette):
#  - Token definition files (index.css, src/styles/) - hex lives here by design.
#  - Marketing / landing / SEO pages and components.
#
# Wire this into CI or a pre-commit hook to enforce the gate.

set -uo pipefail

SRC="connect-grow-hire/src"

# Warm-grey and navy-grey hex eliminated from the app interior. Must stay at zero.
BANNED='#(e8e4de|e5e5e3|e5e5e0|f0f0ed|9c9590|6b6560|1a1714|111318|4a4f5b|8a8f9a|8a8f97|0f2545|1b2a44|243656|4a5e80|5b7799|8089a0)'

# Files that legitimately keep these values: token definitions + marketing surface.
EXEMPT='(/index\.css:|/styles/|/Index\.tsx:|/AboutUs\.tsx:|/ForStudents\.tsx:|/seo-preview/|/pages/templates/|/Hero\.tsx:|/HeroSearchCTA\.tsx:|/CTA\.tsx:|/Header\.tsx:|/Footer\.tsx:|/FeatureShowcase|/FeatureCards|/TimeComparison|/BulletinBoard|/ExtensionShowcase|/ScreenshotGallery|/InteractiveTimeline|/BetaBadges| 2\.)'

hits=$(grep -rinE "$BANNED" "$SRC" 2>/dev/null | grep -vE "$EXEMPT" || true)

if [ -n "$hits" ]; then
  echo "FAIL: banned warm/navy hex found in app component or page code."
  echo "      Use the canonical --c-* tokens (cool slate) instead of raw hex."
  echo
  echo "$hits"
  exit 1
fi

echo "OK: no banned warm/navy hex in app component or page code."
