export function normalizeLinkedInUrl(url?: string): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("linkedin.com") || trimmed.startsWith("www.linkedin.com")) return `https://${trimmed}`;
  if (trimmed.startsWith("/in/")) return `https://www.linkedin.com${trimmed}`;
  if (trimmed.includes("linkedin") && trimmed.includes("/in/")) {
    const match = trimmed.match(/\/in\/[^\/\s]+/);
    if (match) return `https://www.linkedin.com${match[0]}`;
  }
  return `https://www.linkedin.com/in/${trimmed}`;
}
