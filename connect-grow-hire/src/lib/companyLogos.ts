// Company logo lookup. Pass a name string (case + punctuation flexible) and
// get either an imported PNG path or null. Surfaces that render a company
// chip should fall back to their existing tinted-initial badge when this
// returns null, so we never end up with a blank square.
//
// Add new logos:
//   1. Drop the PNG into src/assets/.
//   2. Import below and add one entry to LOGO_INDEX (the key is what we
//      match against — lowercase, alphanumerics only).
//   3. Optional: add aliases under ALIASES if the company is commonly
//      written multiple ways (e.g. "JP Morgan" / "JPMorgan" / "JPM").

import Bain from "@/assets/Bain.png";
import Barclays from "@/assets/Barclays.png";
import Blackstone from "@/assets/Blackstone.png";
import Evercore from "@/assets/Evercore.png";
import GoldmanSachs from "@/assets/GoldmanSachs.png";
import Google from "@/assets/Googlelogo.png";
import JPMorgan from "@/assets/JPMorgan.png";
import McKinsey from "@/assets/McKinsey.png";
import MorganStanley from "@/assets/MorganStanley.png";
import PwC from "@/assets/PwC.png";

const LOGO_INDEX: Record<string, string> = {
  bain: Bain,
  barclays: Barclays,
  blackstone: Blackstone,
  evercore: Evercore,
  goldmansachs: GoldmanSachs,
  google: Google,
  jpmorgan: JPMorgan,
  mckinsey: McKinsey,
  morganstanley: MorganStanley,
  pwc: PwC,
};

// Common alternate spellings → canonical key in LOGO_INDEX.
const ALIASES: Record<string, string> = {
  goldman: "goldmansachs",
  goldmans: "goldmansachs",
  gs: "goldmansachs",
  jpm: "jpmorgan",
  jpmorganchase: "jpmorgan",
  ms: "morganstanley",
  bcg: "bain", // not BCG strictly — left intentionally unmapped; add a BCG asset to use
  pricewaterhousecoopers: "pwc",
  alphabet: "google",
  googleinc: "google",
};

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Resolve a company name to a real logo. Returns null if we don't have one
 * locally so the caller can render its existing initial-tile fallback.
 */
export function getCompanyLogo(name: string | null | undefined): string | null {
  if (!name) return null;
  const key = normalize(name);
  if (LOGO_INDEX[key]) return LOGO_INDEX[key];
  const alias = ALIASES[key];
  if (alias && LOGO_INDEX[alias]) return LOGO_INDEX[alias];
  return null;
}
