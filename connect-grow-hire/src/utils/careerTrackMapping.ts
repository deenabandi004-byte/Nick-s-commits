/**
 * Career-track options (Direction / Track step).
 *
 * Per the approved Phase 1 write-map (§3c): the UI shows the friendly `label`;
 * onboarding stores the canonical `value` underneath so the backend normalizer
 * `normalize_career_track` (industry_classifier.py, used by the email + warmth
 * engines) resolves it. `targetIndustries` are human-readable strings that
 * `_resolve_industry` (company_recommendations INDUSTRY_ALIASES, used by
 * Scout/company-rec/Dashboard) resolves to a sector.
 *
 * Stored `value` uses the verbatim keys recognized by CAREER_TRACK_TO_INDUSTRY
 * (investment banking, consulting, private equity, venture capital, tech,
 * product management, data science / analytics, finance, accounting) so
 * industry-tone fires. Tracks with no canonical bucket store the label itself
 * (accepted: no industry-tone, but the label still drives role keyword matching)
 * and set targetIndustries directly.
 *
 * Never render `value` in the UI — only `label`.
 */

export interface CareerTrackOption {
  label: string;
  value: string;
  targetIndustries: string[];
}

export const CAREER_TRACK_OPTIONS: CareerTrackOption[] = [
  // ── Investment Banking & Markets ──
  { label: "Investment Banking", value: "investment banking", targetIndustries: ["Investment Banking"] },
  { label: "Mergers & Acquisitions (M&A)", value: "investment banking", targetIndustries: ["Investment Banking"] },
  { label: "Capital Markets", value: "investment banking", targetIndustries: ["Investment Banking"] },
  { label: "Equity Capital Markets (ECM)", value: "investment banking", targetIndustries: ["Investment Banking"] },
  { label: "Debt Capital Markets (DCM)", value: "investment banking", targetIndustries: ["Investment Banking"] },
  { label: "Leveraged Finance", value: "investment banking", targetIndustries: ["Investment Banking"] },
  { label: "Restructuring", value: "investment banking", targetIndustries: ["Investment Banking"] },
  { label: "Sales & Trading", value: "Sales & Trading", targetIndustries: ["Finance"] },
  { label: "Equity Research", value: "finance", targetIndustries: ["Finance"] },
  { label: "Quantitative Finance / Quant", value: "finance", targetIndustries: ["Finance"] },

  // ── Buy-side & Asset Management ──
  { label: "Private Equity", value: "private equity", targetIndustries: ["Private Equity"] },
  { label: "Growth Equity", value: "private equity", targetIndustries: ["Private Equity"] },
  { label: "Venture Capital", value: "venture capital", targetIndustries: ["Venture Capital"] },
  { label: "Hedge Funds", value: "finance", targetIndustries: ["Hedge Funds"] },
  { label: "Asset Management", value: "finance", targetIndustries: ["Asset Management"] },
  { label: "Wealth Management", value: "finance", targetIndustries: ["Wealth Management"] },
  { label: "Real Estate Private Equity (REPE)", value: "finance", targetIndustries: ["Finance"] },

  // ── Corporate Finance & Accounting ──
  { label: "Corporate Finance / FP&A", value: "finance", targetIndustries: ["Finance"] },
  { label: "Commercial Banking", value: "finance", targetIndustries: ["Finance"] },
  { label: "Corporate Banking", value: "finance", targetIndustries: ["Finance"] },
  { label: "Retail Banking", value: "finance", targetIndustries: ["Finance"] },
  { label: "Accounting / Audit", value: "accounting", targetIndustries: ["Finance"] },
  { label: "Tax", value: "accounting", targetIndustries: ["Finance"] },
  { label: "Treasury", value: "finance", targetIndustries: ["Finance"] },
  { label: "Risk Management", value: "finance", targetIndustries: ["Finance"] },
  { label: "Compliance", value: "finance", targetIndustries: ["Finance"] },
  { label: "Insurance", value: "finance", targetIndustries: ["Finance"] },
  { label: "Actuarial", value: "finance", targetIndustries: ["Finance"] },
  { label: "Fintech", value: "tech", targetIndustries: ["Technology"] },

  // ── Consulting ──
  { label: "Management Consulting", value: "consulting", targetIndustries: ["Consulting"] },
  { label: "Strategy Consulting", value: "consulting", targetIndustries: ["Consulting"] },
  { label: "Operations Consulting", value: "consulting", targetIndustries: ["Consulting"] },
  { label: "Technology Consulting", value: "consulting", targetIndustries: ["Consulting"] },
  { label: "Financial Advisory", value: "consulting", targetIndustries: ["Consulting"] },
  { label: "Economic Consulting", value: "consulting", targetIndustries: ["Consulting"] },
  { label: "Human Capital Consulting", value: "consulting", targetIndustries: ["Consulting"] },
  { label: "Implementation Consulting", value: "consulting", targetIndustries: ["Consulting"] },

  // ── Software & Engineering ──
  { label: "Software Engineering", value: "tech", targetIndustries: ["Technology"] },
  { label: "Frontend Engineering", value: "tech", targetIndustries: ["Technology"] },
  { label: "Backend Engineering", value: "tech", targetIndustries: ["Technology"] },
  { label: "Full-Stack Engineering", value: "tech", targetIndustries: ["Technology"] },
  { label: "Mobile Engineering", value: "tech", targetIndustries: ["Technology"] },
  { label: "Data Engineering", value: "tech", targetIndustries: ["Technology"] },
  { label: "DevOps / Cloud", value: "tech", targetIndustries: ["Technology"] },
  { label: "Site Reliability (SRE)", value: "tech", targetIndustries: ["Technology"] },
  { label: "QA / Test Engineering", value: "tech", targetIndustries: ["Technology"] },
  { label: "Hardware / Embedded", value: "tech", targetIndustries: ["Technology"] },
  { label: "Game Development", value: "tech", targetIndustries: ["Technology"] },
  { label: "Blockchain / Web3", value: "tech", targetIndustries: ["Technology"] },
  { label: "Solutions / Sales Engineering", value: "tech", targetIndustries: ["Technology"] },
  { label: "Developer Relations", value: "tech", targetIndustries: ["Technology"] },
  { label: "IT / Systems", value: "tech", targetIndustries: ["Technology"] },

  // ── Data, AI & Product ──
  { label: "Data Science / Analytics", value: "data science / analytics", targetIndustries: ["Data Science"] },
  { label: "Machine Learning / AI", value: "tech", targetIndustries: ["Artificial Intelligence"] },
  { label: "Business Intelligence", value: "tech", targetIndustries: ["Data Science"] },
  { label: "Cybersecurity", value: "tech", targetIndustries: ["Cybersecurity"] },
  { label: "Product Management", value: "product management", targetIndustries: ["Product Management"] },
  { label: "Technical Product Management", value: "product management", targetIndustries: ["Product Management"] },
  { label: "Product Design / UX", value: "tech", targetIndustries: ["Product Design"] },
  { label: "UX Research", value: "tech", targetIndustries: ["Product Design"] },

  // ── Marketing, Sales & Growth ──
  { label: "Marketing", value: "Marketing", targetIndustries: ["Marketing"] },
  { label: "Brand Marketing", value: "Marketing", targetIndustries: ["Marketing"] },
  { label: "Product Marketing", value: "Marketing", targetIndustries: ["Marketing"] },
  { label: "Growth Marketing", value: "Marketing", targetIndustries: ["Marketing"] },
  { label: "Digital Marketing", value: "Marketing", targetIndustries: ["Marketing"] },
  { label: "Content / Social Media", value: "Marketing", targetIndustries: ["Marketing"] },
  { label: "Public Relations / Comms", value: "Marketing", targetIndustries: ["Marketing"] },
  { label: "Advertising", value: "Marketing", targetIndustries: ["Marketing"] },
  { label: "Sales / Business Development", value: "Sales / Business Development", targetIndustries: ["Marketing"] },
  { label: "Account Management", value: "Sales / Business Development", targetIndustries: ["Marketing"] },
  { label: "Customer Success", value: "Customer Success", targetIndustries: [] },

  // ── Operations & General Business ──
  { label: "Operations / Supply Chain", value: "Operations / Supply Chain", targetIndustries: [] },
  { label: "Business Operations", value: "Business Operations", targetIndustries: [] },
  { label: "Strategy & Operations", value: "Strategy & Operations", targetIndustries: [] },
  { label: "Program / Project Management", value: "Program Management", targetIndustries: [] },
  { label: "Procurement", value: "Procurement", targetIndustries: [] },
  { label: "Logistics", value: "Logistics", targetIndustries: [] },
  { label: "Human Resources", value: "Human Resources", targetIndustries: [] },
  { label: "Recruiting / Talent", value: "Recruiting", targetIndustries: [] },

  // ── Healthcare & Sciences ──
  { label: "Healthcare / Biotech", value: "Healthcare", targetIndustries: ["Healthcare"] },
  { label: "Pharmaceuticals", value: "Healthcare", targetIndustries: ["Healthcare"] },
  { label: "Medical Devices", value: "Healthcare", targetIndustries: ["Healthcare"] },
  { label: "Clinical Research", value: "Healthcare", targetIndustries: ["Healthcare"] },
  { label: "Public Health", value: "Healthcare", targetIndustries: ["Healthcare"] },
  { label: "Research & Development (R&D)", value: "Research & Development", targetIndustries: [] },

  // ── Law, Policy & Public ──
  { label: "Law / Legal", value: "Law", targetIndustries: [] },
  { label: "Corporate Law", value: "Law", targetIndustries: [] },
  { label: "Government / Public Policy", value: "Public Policy", targetIndustries: [] },
  { label: "Politics / Campaigns", value: "Public Policy", targetIndustries: [] },
  { label: "Nonprofit / Social Impact", value: "Nonprofit", targetIndustries: [] },
  { label: "Education", value: "Education", targetIndustries: [] },

  // ── Media & Creative ──
  { label: "Media / Entertainment", value: "Marketing", targetIndustries: ["Media"] },
  { label: "Journalism", value: "Media", targetIndustries: ["Media"] },
  { label: "Film / Television", value: "Entertainment", targetIndustries: ["Entertainment"] },
  { label: "Graphic Design", value: "tech", targetIndustries: ["Product Design"] },
  { label: "Architecture", value: "Architecture", targetIndustries: [] },

  // ── Industry & Physical ──
  { label: "Real Estate", value: "Real Estate", targetIndustries: ["Real Estate"] },
  { label: "Real Estate Development", value: "Real Estate", targetIndustries: ["Real Estate"] },
  { label: "Construction", value: "Construction", targetIndustries: [] },
  { label: "Manufacturing", value: "Manufacturing", targetIndustries: [] },
  { label: "Energy / Oil & Gas", value: "Energy", targetIndustries: [] },
  { label: "Renewable Energy / Cleantech", value: "Energy", targetIndustries: [] },
  { label: "Aerospace / Defense", value: "Aerospace & Defense", targetIndustries: [] },
  { label: "Automotive", value: "Automotive", targetIndustries: [] },
  { label: "Retail / E-commerce", value: "Retail", targetIndustries: [] },
  { label: "Hospitality / Travel", value: "Hospitality", targetIndustries: [] },
  { label: "Agriculture", value: "Agriculture", targetIndustries: [] },
  { label: "Telecommunications", value: "tech", targetIndustries: ["Technology"] },

  // ── Entrepreneurship ──
  { label: "Entrepreneurship / Startups", value: "Entrepreneurship", targetIndustries: [] },
  { label: "Startup Operations", value: "Entrepreneurship", targetIndustries: [] },

  { label: "Other", value: "Other", targetIndustries: [] },
];

/** Look up a track option by its UI label. */
export function careerTrackByLabel(label: string): CareerTrackOption | undefined {
  return CAREER_TRACK_OPTIONS.find((o) => o.label === label);
}
