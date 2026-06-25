import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

// Tries to render a real company logo for jobs whose feed entry has no
// employer_logo. Strategy, in order:
//   1) explicit fallbackUrl from the backend (employer_logo), if it passes
//      isLikelyImageUrl. A bare company URL like "https://samsara.com" fails
//      this check and is skipped, which prevents the browser from emitting
//      a stray bare-domain request when the backend stores the wrong thing.
//   2) LOGO_SOURCE(domain), currently Google s2/favicons. Swap to
//      img.logo.dev in a single line by replacing this helper.
//   3) monogram (first letter) rendered as text, never an image.
//
// On <img> error we advance through the chain. No backend involved.
//
// Notes on the past:
//   logo.clearbit.com was the previous source #2 in this chain. The provider
//   was retired on 2025-12-08 and every request now fails with
//   ERR_NAME_NOT_RESOLVED, flooding the console. The reference was removed
//   and the chain reordered so a dead provider can never spam the console
//   from this component again.
//
// The img is wrapped in a div that takes `className`. The wrapper is what
// gets sized by the existing CSS rules (.jb-logo / .jb-detail-logo /
// .jb-banner-watermark). The img inside is constrained to 100% of the
// wrapper via inline style so callers do not need to ship an extra rule.

interface CompanyLogoProps {
  company: string;
  monogram: string;
  fallbackUrl?: string | null;
  className?: string;
  size?: number;
  style?: CSSProperties;
  fit?: "contain" | "cover";
  // Background applied to the wrapper while the img is showing. Tiles want
  // white so contained logos do not sit on the dark monogram background;
  // the banner watermark wants transparent.
  imageBg?: string;
}

function guessDomain(company: string): string | null {
  const cleaned = company
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "");
  if (!cleaned) return null;
  return `${cleaned}.com`;
}

// Hosts that we trust to serve actual logo images. If a backend-provided
// fallbackUrl points at one of these, we render it. Anything else falls
// through to the favicon helper, even if it parses as a URL.
const LOGO_HOSTS = new Set([
  "img.logo.dev",
  "logo.dev",
  "www.google.com",
  "logos.brandfetch.com",
  "asset.brandfetch.io",
  "cdn.brandfetch.io",
]);

const IMAGE_EXTS = /\.(png|jpe?g|gif|webp|svg|ico|avif)(\?.*)?$/i;

function isLikelyImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  if (LOGO_HOSTS.has(parsed.hostname)) return true;
  if (IMAGE_EXTS.test(parsed.pathname)) return true;
  return false;
}

// Single point of indirection for the primary logo provider. Swap to
// `https://img.logo.dev/${domain}?token=...&size=${size}` here and the
// whole app picks it up.
function LOGO_SOURCE(domain: string, size: number): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
}

function buildSources(company: string, fallbackUrl?: string | null, size = 128): string[] {
  const sources: string[] = [];
  if (fallbackUrl && isLikelyImageUrl(fallbackUrl)) {
    sources.push(fallbackUrl);
  }
  const domain = guessDomain(company);
  if (domain) {
    sources.push(LOGO_SOURCE(domain, size));
  }
  return sources;
}

export function CompanyLogo({
  company,
  monogram,
  fallbackUrl,
  className,
  size = 128,
  style,
  fit = "contain",
  imageBg = "white",
}: CompanyLogoProps) {
  const sources = buildSources(company, fallbackUrl, size);
  const [sourceIdx, setSourceIdx] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSourceIdx(0);
    setFailed(false);
  }, [company, fallbackUrl]);

  const showMonogram = failed || sources.length === 0;

  const wrapperStyle: CSSProperties = showMonogram
    ? { ...style }
    : { background: imageBg, ...style };

  return (
    <div className={className} style={wrapperStyle}>
      {showMonogram ? (
        monogram
      ) : (
        <img
          src={sources[sourceIdx]}
          alt={`${company} logo`}
          loading="lazy"
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: fit,
          }}
          onError={() => {
            if (sourceIdx + 1 < sources.length) {
              setSourceIdx(sourceIdx + 1);
            } else {
              setFailed(true);
            }
          }}
        />
      )}
    </div>
  );
}
