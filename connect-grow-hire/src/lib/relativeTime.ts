// Short-form relative time for Loop status lines.
// "in 4h", "in 2d", "tomorrow 9am", "3h ago", "yesterday", "—" for null.

import { formatDistanceToNowStrict, isToday, isTomorrow, isYesterday, format, parseISO } from "date-fns";

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? parseISO(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";

  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const future = diffMs > 0;
  const absMs = Math.abs(diffMs);

  // Under 60s either side reads as "just now" / "any moment"
  if (absMs < 60_000) return future ? "any moment" : "just now";

  // Tomorrow / yesterday get a clock so "tomorrow 9am" beats "in 19h"
  if (future && isTomorrow(d)) return `tomorrow ${format(d, "h:mma").toLowerCase()}`;
  if (!future && isYesterday(d)) return `yesterday ${format(d, "h:mma").toLowerCase()}`;
  if (isToday(d)) {
    const strict = formatDistanceToNowStrict(d).replace(/ (seconds?|minutes?|hours?|days?)/, (_, u: string) => u[0]);
    return future ? `in ${strict}` : `${strict} ago`;
  }

  // > 6 days out, show the date instead of "in 12 days"
  if (absMs > 6 * 24 * 60 * 60 * 1000) return format(d, "MMM d");

  const strict = formatDistanceToNowStrict(d).replace(/ (seconds?|minutes?|hours?|days?)/, (_, u: string) => u[0]);
  return future ? `in ${strict}` : `${strict} ago`;
}
