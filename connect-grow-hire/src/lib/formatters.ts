export function formatTimeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function daysBetween(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** Decode HTML entities (e.g. &#39; &amp; &quot;) to plain text */
let _textarea: HTMLTextAreaElement | null = null;
export function decodeHtmlEntities(text: string | null | undefined): string {
  if (!text) return "";
  // Fast path: skip if no entities present
  if (!text.includes("&")) return text;
  if (!_textarea) _textarea = document.createElement("textarea");
  _textarea.innerHTML = text;
  return _textarea.value;
}

/**
 * Convert an HTML email body to readable plain text. Mirrors the backend
 * html_to_plain_text in outbox_service.py: legacy hiring-manager / recruiter
 * drafts were stored as HTML (a font-family wrapper div with <br> breaks and
 * escaped entities), which renders raw when interpolated as text. Surfaces that
 * read emailBody / draft.body directly (not via the thread endpoint, which is
 * already normalized server-side) use this for defense in depth.
 *
 * Conversion order: block tags to newlines, strip remaining tags, decode
 * entities last, then collapse 3+ newlines to 2. No-op fast path when the
 * string has no < or &.
 */
export function htmlToPlainText(text: string | null | undefined): string {
  if (!text) return "";
  // Fast path: nothing to convert when there is no markup or entity.
  if (!text.includes("<") && !text.includes("&")) return text;
  let out = text.replace(/<br\s*\/?>/gi, "\n");
  out = out.replace(/<\/(p|div)>/gi, "\n");
  out = out.replace(/<[^>]+>/g, "");
  out = decodeHtmlEntities(out);
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}
