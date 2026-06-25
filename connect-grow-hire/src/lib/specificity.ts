/**
 * Heuristic query analysis for the Find page People tab.
 *
 * Pure module, no React, no side effects. Inputs: a search prompt and (optionally)
 * the signed-in user's school short-name. Outputs: which of {role, location, company,
 * school} were detected, and a single qualitative nudge string when one of those
 * dimensions is conspicuously missing.
 *
 * Detection strategy:
 *   - Word-boundary regex (never substring) — `\bgoldman sachs\b`, not `goldman` inside `goldmanson`.
 *   - Curated alias maps for the four dimensions (the load-bearing data).
 *   - Fallback scans against the project's existing data files (companies.ts, universities.ts,
 *     roles.ts) only when the curated maps don't match, and only with conservative guards
 *     to avoid false positives on short ambiguous names.
 *   - Order: company → school → location → role. Each match masks its substring out of the
 *     working text before the next pass, so "Boston Consulting Group" doesn't double-match
 *     as Company:BCG and Location:Boston.
 *   - Longest-match-wins inside each dimension so "investment banking analyst" beats
 *     "analyst".
 *
 * The heuristic is biased toward false negatives. When a dimension is unclear, the chip
 * stays out — silence is better than a wrong attribution.
 */

import { companies as COMPANIES } from '@/data/companies';
import { UNIVERSITIES } from '@/data/universities';
import { roles as ROLES } from '@/data/roles';
import { industries as INDUSTRIES_DATA } from '@/data/industries';

export interface DimensionMatch {
  /** What to display in the chip (canonical form). */
  value: string;
  /** The substring of the prompt that matched (preserves user casing). */
  matched: string;
  /** Optional list of refinements / alternatives surfaced as a flip-up card.
   *  - For role: industry-aware variations the user may not have considered
   *    (e.g. "Banker" + Barclays → ["Investment Banking Analyst", "Sales and
   *    Trading Analyst", "Equity Research Analyst"]). Lets them discover paths
   *    beyond what they typed.
   *  - For company: peer firms in the same tier/industry (e.g. "Barclays" →
   *    ["Deutsche Bank", "Credit Suisse", "JPMorgan Chase"]). Future hooks for
   *    user-context personalization (resume, year, target industries) can
   *    re-rank or filter this list at render time without changing the schema.
   *  Never applied automatically. The chip continues to display `value`. */
  suggestions?: string[];
  /** Full official form to send to the backend for unambiguous matching.
   *  E.g. for school: "USC" → "University of Southern California". Sending the
   *  expansion to PDL prevents ambiguity with same-acronym institutions
   *  (USC ≠ University of South Carolina, UT ≠ University of Tennessee, etc.). */
  canonical?: string;
}

export interface QueryAnalysis {
  role: DimensionMatch | null;
  location: DimensionMatch | null;
  company: DimensionMatch | null;
  school: DimensionMatch | null;
  /** Industry / sector intent — separate from a specific role title.
   *  E.g. "USC grads in Tech — Startup" → industry: "Tech — Startup".
   *  Detected from the curated INDUSTRY_TOKENS lexicon (matches the strings
   *  produced by the Direction extractor on the Profile page). */
  industry: DimensionMatch | null;
  /** Additional schools beyond the primary one. Picks up cases like
   *  "UCI alum, transferred to USC" or "Bocconi exchange from USC".
   *  The primary school chip stays in `school`; the extras live here so the
   *  search payload can include both as alumni filters without muddying the UI. */
  additionalSchools?: DimensionMatch[];
  /** Top firms for the detected role/industry, populated when a role is detected
   *  but no specific company is. */
  industryFirms?: { industry: string; firms: string[] };
  /** Common hiring locations for the detected role, populated when a role is
   *  detected but no specific location is. Powers the "Common locations" rail
   *  on the right so users typing "USC grads in finance" get NYC / London /
   *  Hong Kong as click-to-append suggestions. */
  industryLocations?: { roleLabel: string; locations: string[] };
  /** When the user has both role AND location but no company, surface the
   *  curated list of companies that hire that role in that city. Replaces the
   *  industry-wide list with location-specific picks (Growth Analysts in LA →
   *  Snap/Roblox/GOAT, not the generic tech top-companies). */
  roleLocationCompanies?: { roleLabel: string; location: string; firms: string[] };
  /** Top employers for the detected school. Populated when school is detected
   *  with little other signal — gives users typing "USC alumni" something
   *  concrete to look at. */
  schoolEmployers?: { schoolLabel: string; firms: string[] };
}

export interface Nudge {
  text: string;
  /** Set when the nudge is clickable; the value gets appended to the prompt. */
  appendOnClick: string | null;
}

// ── Token tables ──────────────────────────────────────────────────────────────

interface TokenEntry {
  /** Lowercased terms to match (any of). */
  match: string[];
  /** Canonical display label for the chip. */
  label: string;
}

// Roles — curated lexicon ordered by specificity.
// Multi-word + abbrev forms come first so "investment banking analyst" beats "analyst".
const ROLE_TOKENS: TokenEntry[] = [
  { match: ['investment banking analyst', 'ib analyst', 'investment banking analysts'], label: 'Investment Banking Analyst' },
  { match: ['investment banking associate', 'ib associate', 'investment banking associates'], label: 'Investment Banking Associate' },
  { match: ['investment banking', 'investment banker', 'investment bankers'], label: 'Investment Banking' },
  { match: ['software engineer', 'software engineers', 'software development engineer', 'swe'], label: 'Software Engineer' },
  { match: ['product manager', 'product managers', 'pm'], label: 'Product Manager' },
  { match: ['data scientist', 'data scientists'], label: 'Data Scientist' },
  { match: ['ml engineer', 'ml engineers', 'machine learning engineer'], label: 'ML Engineer' },
  { match: ['financial analyst', 'financial analysts'], label: 'Financial Analyst' },
  { match: ['equity research analyst', 'equity research'], label: 'Equity Research' },
  { match: ['quantitative analyst', 'quant analyst', 'quant'], label: 'Quantitative Analyst' },
  { match: ['quantitative researcher', 'quant researcher', 'quantitative research'], label: 'Quantitative Researcher' },
  { match: ['private equity analyst', 'private equity associate', 'pe analyst', 'pe associate', 'private equity'], label: 'Private Equity' },
  { match: ['venture capitalist', 'venture capital'], label: 'Venture Capital' },
  { match: ['hedge fund analyst', 'hedge fund'], label: 'Hedge Fund' },
  { match: ['management consultant', 'management consulting', 'management consultants'], label: 'Management Consulting' },
  { match: ['marketing manager', 'marketing managers', 'marketing analyst'], label: 'Marketing' },
  { match: ['ux designer', 'ux design', 'ux designers'], label: 'UX Designer' },
  { match: ['business analyst', 'business analysts'], label: 'Business Analyst' },
  { match: ['research analyst', 'research analysts'], label: 'Research Analyst' },
  { match: ['attorney', 'attorneys', 'lawyer', 'lawyers'], label: 'Attorney' },
  { match: ['accountant', 'accountants', 'accounting'], label: 'Accountant' },
  // Modern startup / tech / RevOps / Sales lexicon — added so the chip lights up
  // for queries our user base actually types. Each maps to its real industry below.
  { match: ['growth analyst', 'growth analysts'], label: 'Growth Analyst' },
  { match: ['growth manager', 'growth managers'], label: 'Growth Manager' },
  { match: ['business development analyst', 'bd analyst', 'bd analysts', 'business development analysts'], label: 'Business Development Analyst' },
  { match: ['business development', 'biz dev'], label: 'Business Development' },
  { match: ['account executive', 'account executives', 'ae'], label: 'Account Executive' },
  { match: ['account manager', 'account managers', 'am'], label: 'Account Manager' },
  { match: ['sales development representative', 'sdr', 'sdrs'], label: 'Sales Development Representative' },
  { match: ['customer success associate', 'customer success', 'cs associate', 'csm', 'cs manager'], label: 'Customer Success Associate' },
  { match: ['solutions engineer', 'solutions engineers', 'se'], label: 'Solutions Engineer' },
  { match: ['forward-deployed engineer', 'forward deployed engineer', 'fde', 'forward deployed engineers'], label: 'Forward-Deployed Engineer' },
  { match: ['product engineer', 'product engineers'], label: 'Product Engineer' },
  { match: ['strategic finance analyst', 'strategic finance', 'strat fin'], label: 'Strategic Finance Analyst' },
  { match: ['fp&a analyst', 'fp&a', 'fpa analyst', 'financial planning and analysis'], label: 'FP&A Analyst' },
  { match: ['operations analyst', 'ops analyst', 'operations analysts'], label: 'Operations Analyst' },
  { match: ['operations associate', 'ops associate'], label: 'Operations Associate' },
  { match: ['revenue operations', 'revops', 'rev ops'], label: 'Revenue Operations' },
  { match: ['program manager', 'program managers'], label: 'Program Manager' },
  { match: ['investment analyst', 'investment analysts'], label: 'Investment Analyst' },
  { match: ['venture capital analyst', 'vc analyst', 'vc analysts'], label: 'Venture Capital Analyst' },
  { match: ['private equity analyst', 'pe analyst', 'pe analysts'], label: 'Private Equity Analyst' },
  { match: ['strategy analyst', 'strategy associate'], label: 'Strategy Analyst' },
  // "Finance" alone is a vague-but-common role keyword — treat it as a role family
  // so the chip lights up. The role-variation map maps (Finance, <company>) into
  // concrete titles depending on whether the company is finance / tech / fintech / consulting.
  { match: ['finance', 'corporate finance', 'in finance', 'work in finance', 'working in finance'], label: 'Finance' },
  { match: ['recruiter', 'recruiters', 'recruiting'], label: 'Recruiter' },
  { match: ['scientist', 'scientists'], label: 'Scientist' },
  { match: ['researcher', 'researchers'], label: 'Researcher' },
  { match: ['strategist', 'strategy'], label: 'Strategist' },
  { match: ['trader', 'traders', 'trading'], label: 'Trader' },
  { match: ['founder', 'founders', 'co-founder'], label: 'Founder' },
  { match: ['ceo', 'chief executive officer'], label: 'CEO' },
  { match: ['cto', 'chief technology officer'], label: 'CTO' },
  { match: ['cfo', 'chief financial officer'], label: 'CFO' },
  { match: ['consultant', 'consultants', 'consulting'], label: 'Consultant' },
  { match: ['engineer', 'engineers', 'engineering'], label: 'Engineer' },
  { match: ['manager', 'managers'], label: 'Manager' },
  { match: ['designer', 'designers'], label: 'Designer' },
  { match: ['analyst', 'analysts'], label: 'Analyst' },
  { match: ['banker', 'bankers'], label: 'Banker' },
  { match: ['associate', 'associates'], label: 'Associate' },
  { match: ['partner', 'partners'], label: 'Partner' },
];

// Locations — curated cities with shorthand expansions.
// Includes the four shorthand forms the user explicitly named (NYC, SF, LA, plus DC).
const LOCATION_TOKENS: TokenEntry[] = [
  { match: ['new york city', 'new york', 'nyc', 'manhattan', 'brooklyn'], label: 'New York' },
  { match: ['san francisco', 'sf bay area', 'bay area', 'sf'], label: 'San Francisco' },
  { match: ['los angeles', 'la'], label: 'Los Angeles' },
  { match: ['washington dc', 'washington d.c.', 'd.c.'], label: 'Washington' }, // bare "dc" too risky vs other contexts
  { match: ['chicago'], label: 'Chicago' },
  { match: ['boston'], label: 'Boston' },
  { match: ['seattle'], label: 'Seattle' },
  { match: ['austin'], label: 'Austin' },
  { match: ['atlanta'], label: 'Atlanta' },
  { match: ['houston'], label: 'Houston' },
  { match: ['dallas'], label: 'Dallas' },
  { match: ['denver'], label: 'Denver' },
  { match: ['miami'], label: 'Miami' },
  { match: ['philadelphia', 'philly'], label: 'Philadelphia' },
  { match: ['minneapolis'], label: 'Minneapolis' },
  { match: ['portland'], label: 'Portland' },
  { match: ['san diego'], label: 'San Diego' },
  { match: ['phoenix'], label: 'Phoenix' },
  { match: ['nashville'], label: 'Nashville' },
  { match: ['charlotte'], label: 'Charlotte' },
  { match: ['detroit'], label: 'Detroit' },
  { match: ['pittsburgh'], label: 'Pittsburgh' },
  { match: ['st. louis', 'saint louis'], label: 'St. Louis' },
  { match: ['salt lake city'], label: 'Salt Lake City' },
  { match: ['las vegas'], label: 'Las Vegas' },
  { match: ['london'], label: 'London' },
  { match: ['toronto'], label: 'Toronto' },
  { match: ['singapore'], label: 'Singapore' },
  { match: ['hong kong'], label: 'Hong Kong' },
  { match: ['tokyo'], label: 'Tokyo' },
  { match: ['paris'], label: 'Paris' },
];

// Companies — curated alias map + shorthand expansions.
// Single-word common-name terms (e.g. "ms", "gs") are excluded to avoid false positives.
const COMPANY_ALIASES: TokenEntry[] = [
  // Shorthand expansions
  { match: ['faang'], label: 'FAANG' },
  { match: ['maang'], label: 'MAANG' },
  { match: ['mbb'], label: 'MBB' },
  { match: ['big four', 'big 4'], label: 'Big 4' },
  { match: ['mango'], label: 'MANGO' },
  // Investment banking
  { match: ['goldman sachs', 'goldman'], label: 'Goldman Sachs' },
  { match: ['morgan stanley'], label: 'Morgan Stanley' },
  { match: ['jpmorgan', 'jp morgan', 'jpmorgan chase'], label: 'JPMorgan Chase' },
  { match: ['bank of america', 'bofa'], label: 'Bank of America' },
  { match: ['citigroup', 'citibank'], label: 'Citigroup' },
  { match: ['evercore'], label: 'Evercore' },
  { match: ['lazard'], label: 'Lazard' },
  { match: ['centerview'], label: 'Centerview Partners' },
  { match: ['houlihan lokey'], label: 'Houlihan Lokey' },
  { match: ['pjt partners'], label: 'PJT Partners' },
  { match: ['barclays'], label: 'Barclays' },
  { match: ['deutsche bank'], label: 'Deutsche Bank' },
  // Consulting
  { match: ['mckinsey', 'mckinsey & company'], label: 'McKinsey & Company' },
  { match: ['boston consulting group', 'bcg'], label: 'Boston Consulting Group' },
  { match: ['bain & company', 'bain and company', 'bain'], label: 'Bain & Company' },
  { match: ['deloitte'], label: 'Deloitte' },
  { match: ['accenture'], label: 'Accenture' },
  { match: ['oliver wyman'], label: 'Oliver Wyman' },
  { match: ['kearney', 'a.t. kearney'], label: 'Kearney' },
  { match: ['booz allen hamilton', 'booz allen'], label: 'Booz Allen' },
  // Private equity / asset management
  { match: ['blackstone'], label: 'Blackstone' },
  { match: ['kkr'], label: 'KKR' },
  { match: ['apollo global', 'apollo'], label: 'Apollo Global Management' },
  { match: ['carlyle group', 'carlyle'], label: 'Carlyle Group' },
  { match: ['warburg pincus'], label: 'Warburg Pincus' },
  { match: ['tpg capital', 'tpg'], label: 'TPG Capital' },
  { match: ['blackrock'], label: 'BlackRock' },
  { match: ['vanguard'], label: 'Vanguard' },
  { match: ['fidelity'], label: 'Fidelity' },
  // Hedge funds / quant
  { match: ['citadel'], label: 'Citadel' },
  { match: ['two sigma'], label: 'Two Sigma' },
  { match: ['jane street'], label: 'Jane Street' },
  { match: ['point72'], label: 'Point72' },
  { match: ['bridgewater'], label: 'Bridgewater' },
  { match: ['de shaw', 'd.e. shaw'], label: 'DE Shaw' },
  // Tech
  { match: ['google', 'alphabet'], label: 'Google' },
  { match: ['meta', 'facebook'], label: 'Meta' },
  { match: ['amazon'], label: 'Amazon' },
  { match: ['apple'], label: 'Apple' },
  { match: ['microsoft', 'msft'], label: 'Microsoft' },
  { match: ['netflix'], label: 'Netflix' },
  { match: ['uber'], label: 'Uber' },
  { match: ['airbnb'], label: 'Airbnb' },
  { match: ['stripe'], label: 'Stripe' },
  { match: ['palantir'], label: 'Palantir' },
  { match: ['salesforce'], label: 'Salesforce' },
  { match: ['snowflake'], label: 'Snowflake' },
  { match: ['databricks'], label: 'Databricks' },
  { match: ['openai'], label: 'OpenAI' },
  { match: ['anthropic'], label: 'Anthropic' },
  { match: ['nvidia'], label: 'NVIDIA' },
  { match: ['tesla'], label: 'Tesla' },
  { match: ['spacex'], label: 'SpaceX' },
  { match: ['linkedin'], label: 'LinkedIn' },
  { match: ['shopify'], label: 'Shopify' },
  { match: ['robinhood'], label: 'Robinhood' },
  { match: ['coinbase'], label: 'Coinbase' },
  { match: ['plaid'], label: 'Plaid' },
  // VC
  { match: ['andreessen horowitz', 'a16z'], label: 'Andreessen Horowitz' },
  { match: ['sequoia capital', 'sequoia'], label: 'Sequoia Capital' },
  { match: ['benchmark'], label: 'Benchmark' },
  { match: ['accel'], label: 'Accel' },
  // Modern startups & growth-stage companies — added so the COMPANY chip lights
  // up when users type names from our right-rail suggestions or natural queries.
  { match: ['snap inc', 'snap inc.', 'snapchat', 'snap'], label: 'Snap' },
  { match: ['roblox'], label: 'Roblox' },
  { match: ['whoop'], label: 'Whoop' },
  { match: ['servicetitan', 'service titan'], label: 'ServiceTitan' },
  { match: ['goat group', 'goat'], label: 'GOAT' },
  { match: ['notion'], label: 'Notion' },
  { match: ['figma'], label: 'Figma' },
  { match: ['doordash'], label: 'DoorDash' },
  { match: ['instacart'], label: 'Instacart' },
  { match: ['lyft'], label: 'Lyft' },
  { match: ['pinterest'], label: 'Pinterest' },
  { match: ['twitch'], label: 'Twitch' },
  { match: ['datadog'], label: 'Datadog' },
  { match: ['etsy'], label: 'Etsy' },
  { match: ['peloton'], label: 'Peloton' },
  { match: ['wework'], label: 'WeWork' },
  { match: ['tinder'], label: 'Tinder' },
  { match: ['hinge'], label: 'Hinge' },
  { match: ['bumble'], label: 'Bumble' },
  { match: ['slack'], label: 'Slack' },
  { match: ['zoom'], label: 'Zoom' },
  { match: ['atlassian'], label: 'Atlassian' },
  { match: ['mongodb'], label: 'MongoDB' },
  { match: ['cloudflare'], label: 'Cloudflare' },
  { match: ['twilio'], label: 'Twilio' },
  { match: ['hubspot'], label: 'HubSpot' },
  { match: ['scale ai', 'scale.ai'], label: 'Scale AI' },
  { match: ['ramp'], label: 'Ramp' },
  { match: ['brex'], label: 'Brex' },
  { match: ['mercury'], label: 'Mercury' },
  { match: ['vercel'], label: 'Vercel' },
  { match: ['linear'], label: 'Linear' },
  { match: ['retool'], label: 'Retool' },
  { match: ['airtable'], label: 'Airtable' },
  { match: ['canva'], label: 'Canva' },
  { match: ['gusto'], label: 'Gusto' },
  { match: ['rippling'], label: 'Rippling' },
  { match: ['carta'], label: 'Carta' },
  { match: ['affirm'], label: 'Affirm' },
  { match: ['chime'], label: 'Chime' },
  // Media & entertainment (LA-heavy)
  { match: ['disney', 'walt disney', 'walt disney company'], label: 'Disney' },
  { match: ['hulu'], label: 'Hulu' },
  { match: ['warner bros', 'warner bros.', 'warnerbros'], label: 'Warner Bros' },
  { match: ['nbcuniversal', 'nbc universal'], label: 'NBCUniversal' },
  { match: ['paramount'], label: 'Paramount' },
  { match: ['spotify'], label: 'Spotify' },
  { match: ['riot games', 'riot'], label: 'Riot Games' },
  { match: ['blizzard entertainment', 'blizzard'], label: 'Blizzard Entertainment' },
  { match: ['activision'], label: 'Activision' },
  { match: ['ea sports', 'electronic arts'], label: 'Electronic Arts' },
  // LA-specific finance / boutique IB
  { match: ['moelis', 'moelis & company', 'moelis and company'], label: 'Moelis & Company' },
  { match: ['b. riley', 'b riley'], label: 'B. Riley' },
  { match: ['william blair'], label: 'William Blair' },
  { match: ['lincoln international'], label: 'Lincoln International' },
  { match: ['qatalyst partners', 'qatalyst'], label: 'Qatalyst Partners' },
  { match: ['capital group'], label: 'Capital Group' },
  { match: ['oaktree capital', 'oaktree'], label: 'Oaktree Capital' },
  { match: ['ares management', 'ares'], label: 'Ares Management' },
  { match: ['guggenheim partners', 'guggenheim'], label: 'Guggenheim Partners' },
  { match: ['ubs'], label: 'UBS' },
  { match: ['hsbc'], label: 'HSBC' },
  { match: ['rbc capital markets', 'rbc'], label: 'RBC Capital Markets' },
  { match: ['bmo capital markets', 'bmo'], label: 'BMO Capital Markets' },
  { match: ['hudson river trading', 'hrt'], label: 'Hudson River Trading' },
  // Big 4 / consulting tail
  { match: ['ey', 'ernst and young', 'ernst & young'], label: 'EY' },
  { match: ['kpmg'], label: 'KPMG' },
  { match: ['pwc', 'pricewaterhousecoopers'], label: 'PwC' },
  // Workday & B2B SaaS
  { match: ['workday'], label: 'Workday' },
  { match: ['servicenow'], label: 'ServiceNow' },
  { match: ['adobe'], label: 'Adobe' },
  { match: ['intuit'], label: 'Intuit' },
  { match: ['oracle'], label: 'Oracle' },
  { match: ['ibm'], label: 'IBM' },
  { match: ['cisco'], label: 'Cisco' },
  { match: ['vmware'], label: 'VMware' },
  // Industrials / aerospace / auto (LA-relevant)
  { match: ['boeing'], label: 'Boeing' },
  { match: ['lockheed martin', 'lockheed'], label: 'Lockheed Martin' },
  { match: ['northrop grumman', 'northrop'], label: 'Northrop Grumman' },
  { match: ['raytheon'], label: 'Raytheon' },
  { match: ['rivian'], label: 'Rivian' },
  // Media / news
  { match: ['bloomberg'], label: 'Bloomberg' },
  { match: ['nyt', 'new york times'], label: 'New York Times' },
  { match: ['vox media', 'vox'], label: 'Vox Media' },
  { match: ['conde nast', 'condé nast'], label: 'Condé Nast' },
  // Adtech / marketing
  { match: ['wpp'], label: 'WPP' },
  { match: ['publicis'], label: 'Publicis' },
  { match: ['omnicom'], label: 'Omnicom' },
  // ── International / European firms ─────────────────────────────────────────
  // European IB / boutiques
  { match: ['mediobanca'], label: 'Mediobanca' },
  { match: ['rothschild & co', 'rothschild'], label: 'Rothschild & Co' },
  { match: ['bnp paribas', 'bnp'], label: 'BNP Paribas' },
  { match: ['société générale', 'societe generale', 'socgen'], label: 'Société Générale' },
  { match: ['credit suisse'], label: 'Credit Suisse' },
  { match: ['nomura'], label: 'Nomura' },
  { match: ['unicredit'], label: 'UniCredit' },
  { match: ['santander'], label: 'Santander' },
  { match: ['intesa sanpaolo', 'intesa'], label: 'Intesa Sanpaolo' },
  { match: ['ing group', 'ing'], label: 'ING' },
  { match: ['standard chartered'], label: 'Standard Chartered' },
  { match: ['macquarie'], label: 'Macquarie' },
  { match: ['robert walters'], label: 'Robert Walters' },
  // European tech / unicorns
  { match: ['klarna'], label: 'Klarna' },
  { match: ['wise', 'transferwise'], label: 'Wise' },
  { match: ['revolut'], label: 'Revolut' },
  { match: ['n26'], label: 'N26' },
  { match: ['monzo'], label: 'Monzo' },
  { match: ['deliveroo'], label: 'Deliveroo' },
  { match: ['just eat takeaway', 'just eat'], label: 'Just Eat Takeaway' },
  { match: ['booking.com', 'booking holdings'], label: 'Booking.com' },
  { match: ['adyen'], label: 'Adyen' },
  { match: ['mistral ai', 'mistral'], label: 'Mistral AI' },
  { match: ['hugging face'], label: 'Hugging Face' },
  { match: ['darktrace'], label: 'Darktrace' },
  { match: ['arm', 'arm holdings'], label: 'Arm' },
  { match: ['asml'], label: 'ASML' },
  { match: ['sap'], label: 'SAP' },
  { match: ['siemens'], label: 'Siemens' },
  { match: ['rolls-royce', 'rolls royce'], label: 'Rolls-Royce' },
  // European consulting (US firms have local offices but these are European-native)
  { match: ['roland berger'], label: 'Roland Berger' },
  { match: ['simon-kucher', 'simon kucher'], label: 'Simon-Kucher' },
  { match: ['ol wyman'], label: 'Oliver Wyman' }, // already in elsewhere — alt spelling
  // Asian firms
  { match: ['grab'], label: 'Grab' },
  { match: ['gojek'], label: 'Gojek' },
  { match: ['shopee'], label: 'Shopee' },
  { match: ['lazada'], label: 'Lazada' },
  { match: ['bytedance', 'tiktok'], label: 'ByteDance' },
  { match: ['tencent'], label: 'Tencent' },
  { match: ['alibaba'], label: 'Alibaba' },
  { match: ['rakuten'], label: 'Rakuten' },
  { match: ['samsung'], label: 'Samsung' },
];

// Schools — curated alias map for short forms.
// Bare common words (Brown, Cal, Davis) are excluded; we require either a known short
// form (USC, MIT, NYU, ...) or the full canonical name.
const SCHOOL_ALIASES: TokenEntry[] = [
  { match: ['usc', 'university of southern california', 'southern cal'], label: 'USC' },
  { match: ['ucla'], label: 'UCLA' },
  { match: ['nyu', 'new york university'], label: 'NYU' },
  { match: ['mit', 'massachusetts institute of technology'], label: 'MIT' },
  { match: ['upenn', 'university of pennsylvania', 'penn', 'wharton'], label: 'UPenn' },
  { match: ['uc berkeley', 'university of california berkeley', 'berkeley'], label: 'UC Berkeley' },
  { match: ['stanford', 'stanford university', 'stanford gsb', 'gsb'], label: 'Stanford' },
  { match: ['harvard', 'harvard university', 'harvard business school', 'hbs'], label: 'Harvard' },
  { match: ['yale', 'yale university'], label: 'Yale' },
  { match: ['princeton', 'princeton university'], label: 'Princeton' },
  { match: ['columbia university', 'columbia business school'], label: 'Columbia' },
  { match: ['cornell', 'cornell university'], label: 'Cornell' },
  { match: ['dartmouth', 'dartmouth college'], label: 'Dartmouth' },
  { match: ['brown university'], label: 'Brown' },
  { match: ['university of michigan', 'umich', 'michigan ross'], label: 'Michigan' },
  { match: ['northwestern', 'northwestern university', 'kellogg'], label: 'Northwestern' },
  { match: ['duke', 'duke university'], label: 'Duke' },
  { match: ['georgetown', 'georgetown university'], label: 'Georgetown' },
  { match: ['cmu', 'carnegie mellon'], label: 'CMU' },
  { match: ['gwu', 'george washington university'], label: 'GW' },
  { match: ['notre dame', 'university of notre dame'], label: 'Notre Dame' },
  { match: ['emory', 'emory university'], label: 'Emory' },
  { match: ['vanderbilt', 'vanderbilt university'], label: 'Vanderbilt' },
  { match: ['rice university'], label: 'Rice' },
  { match: ['johns hopkins', 'jhu'], label: 'Johns Hopkins' },
  { match: ['ucsd', 'uc san diego'], label: 'UC San Diego' },
  { match: ['ucsb', 'uc santa barbara'], label: 'UC Santa Barbara' },
  { match: ['university of texas', 'ut austin'], label: 'UT Austin' },
  { match: ['boston university'], label: 'Boston University' },
  { match: ['boston college'], label: 'Boston College' },
  { match: ['university of chicago', 'uchicago', 'booth'], label: 'University of Chicago' },
  { match: ['university of virginia', 'uva'], label: 'University of Virginia' },
  { match: ['mcgill', 'mcgill university'], label: 'McGill' },
  // ── Other notable US schools students transfer between or attend regionally ──
  { match: ['uci', 'uc irvine', 'university of california irvine'], label: 'UC Irvine' },
  { match: ['ucsc', 'uc santa cruz', 'university of california santa cruz'], label: 'UC Santa Cruz' },
  { match: ['ucr', 'uc riverside', 'university of california riverside'], label: 'UC Riverside' },
  { match: ['ucd', 'uc davis', 'university of california davis'], label: 'UC Davis' },
  { match: ['university of louisville', 'u of l'], label: 'University of Louisville' },
  { match: ['ucf', 'university of central florida'], label: 'University of Central Florida' },
  { match: ['fsu', 'florida state university'], label: 'Florida State' },
  { match: ['arizona state university', 'asu'], label: 'Arizona State' },
  { match: ['indiana university', 'kelley'], label: 'Indiana University' },
  { match: ['texas a&m', 'texas a and m'], label: 'Texas A&M' },
  { match: ['ohio state university', 'ohio state'], label: 'Ohio State' },
  { match: ['penn state university', 'penn state', 'psu'], label: 'Penn State' },
  { match: ['villanova university', 'villanova'], label: 'Villanova' },
  // ── International — Europe ──────────────────────────────────────────────────
  // UK
  { match: ['lse', 'london school of economics'], label: 'LSE' },
  { match: ['oxford university', 'university of oxford', 'oxbridge'], label: 'Oxford' },
  { match: ['cambridge university', 'university of cambridge'], label: 'Cambridge' },
  { match: ['imperial college london', 'imperial college'], label: 'Imperial College London' },
  { match: ['ucl', 'university college london'], label: 'UCL' },
  { match: ["king's college london", 'kcl'], label: "King's College London" },
  { match: ['warwick business school', 'university of warwick', 'warwick'], label: 'Warwick' },
  { match: ['london business school', 'lbs'], label: 'London Business School' },
  // Italy
  { match: ['bocconi university', 'bocconi'], label: 'Bocconi' },
  { match: ['polimi', 'politecnico di milano'], label: 'Politecnico di Milano' },
  { match: ['luiss'], label: 'LUISS' },
  // France
  { match: ['hec paris', 'hec'], label: 'HEC Paris' },
  { match: ['insead'], label: 'INSEAD' },
  { match: ['escp business school', 'escp'], label: 'ESCP' },
  { match: ['essec business school', 'essec'], label: 'ESSEC' },
  { match: ['sciences po', 'sciencespo'], label: 'Sciences Po' },
  // Spain
  { match: ['ie business school', 'ie'], label: 'IE Business School' },
  { match: ['esade business school', 'esade'], label: 'ESADE' },
  { match: ['iese business school', 'iese'], label: 'IESE' },
  // Germany
  { match: ['whu - otto beisheim school', 'whu'], label: 'WHU' },
  { match: ['esmt berlin', 'esmt'], label: 'ESMT Berlin' },
  { match: ['mannheim business school', 'mannheim'], label: 'Mannheim' },
  { match: ['rwth aachen', 'rwth'], label: 'RWTH Aachen' },
  { match: ['tum', 'technical university of munich'], label: 'TU Munich' },
  // Switzerland
  { match: ['eth zurich', 'eth'], label: 'ETH Zurich' },
  { match: ['epfl'], label: 'EPFL' },
  { match: ['imd business school', 'imd'], label: 'IMD' },
  { match: ['university of st. gallen', 'st. gallen', 'hsg'], label: 'University of St. Gallen' },
  // Netherlands
  { match: ['rotterdam school of management', 'rsm'], label: 'RSM Erasmus' },
  { match: ['erasmus university', 'erasmus'], label: 'Erasmus University' },
  // Sweden / Nordics
  { match: ['stockholm school of economics', 'sse'], label: 'Stockholm School of Economics' },
  { match: ['kth royal institute of technology', 'kth'], label: 'KTH Stockholm' },
  { match: ['copenhagen business school', 'cbs'], label: 'Copenhagen Business School' },
  // Ireland
  { match: ['trinity college dublin', 'trinity dublin'], label: 'Trinity College Dublin' },
  // ── International — Asia ────────────────────────────────────────────────────
  { match: ['nus', 'national university of singapore'], label: 'NUS' },
  { match: ['ntu', 'nanyang technological university'], label: 'NTU' },
  { match: ['hkust', 'hong kong university of science and technology'], label: 'HKUST' },
  { match: ['hku', 'university of hong kong'], label: 'HKU' },
  { match: ['cuhk', 'chinese university of hong kong'], label: 'CUHK' },
  { match: ['iit bombay', 'iit-bombay'], label: 'IIT Bombay' },
  { match: ['iit delhi', 'iit-delhi'], label: 'IIT Delhi' },
  { match: ['iit madras'], label: 'IIT Madras' },
  { match: ['iim ahmedabad', 'iima'], label: 'IIM Ahmedabad' },
  { match: ['iim bangalore', 'iimb'], label: 'IIM Bangalore' },
  { match: ['tsinghua university', 'tsinghua'], label: 'Tsinghua' },
  { match: ['peking university', 'peking'], label: 'Peking University' },
  { match: ['the university of tokyo', 'university of tokyo', 'todai'], label: 'University of Tokyo' },
  { match: ['snu', 'seoul national university'], label: 'Seoul National University' },
  // ── International — Canada / Australia ─────────────────────────────────────
  { match: ['university of toronto', 'u of t', 'rotman'], label: 'University of Toronto' },
  { match: ['ubc', 'university of british columbia', 'sauder'], label: 'UBC' },
  { match: ['queens university', "queen's university"], label: "Queen's University" },
  { match: ['western university', 'ivey business school', 'ivey'], label: 'Western (Ivey)' },
  { match: ['university of melbourne'], label: 'University of Melbourne' },
  { match: ['university of sydney'], label: 'University of Sydney' },
  { match: ['unsw', 'university of new south wales'], label: 'UNSW' },
  { match: ['ut'], label: 'UT' }, // very short — last resort
];

// ── Industry-aware role refinement ────────────────────────────────────────────
//
// When a generic role keyword is detected alongside a known company, the role chip
// gets upgraded to the industry's canonical title. Defaults assume the junior/analyst
// seniority that matches Offerloop's target audience (college students recruiting for
// entry-level roles). Mirrors the same "real titles people use at this company"
// reasoning the backend's LLM parser does at search time.
//
// Examples:
//   "banker"     + Barclays/Goldman/JPMorgan       → "Investment Banking Analyst"
//   "consultant" + McKinsey/Bain/BCG               → "Management Consultant"
//   "analyst"    + Goldman/Morgan Stanley          → "Investment Banking Analyst"
//   "analyst"    + McKinsey/Bain                   → "Business Analyst"
//   "engineer"   + Google/Meta/Amazon              → "Software Engineer"
//   "analyst"    + Citadel/Two Sigma               → "Financial Analyst"

const INDUSTRY_ROLE_VARIATIONS: Record<string, Record<string, string[]>> = {
  'investment-banking': {
    banker: ['Investment Banking Analyst', 'Sales and Trading Analyst', 'Equity Research Analyst'],
    bankers: ['Investment Banking Analyst', 'Sales and Trading Analyst', 'Equity Research Analyst'],
    'investment banker': ['Investment Banking Analyst', 'Investment Banking Associate'],
    'investment banking': ['Investment Banking Analyst', 'Investment Banking Associate', 'Sales and Trading Analyst'],
    analyst: ['Investment Banking Analyst', 'Equity Research Analyst', 'Sales and Trading Analyst'],
    associate: ['Investment Banking Associate', 'Sales and Trading Associate'],
    trader: ['Sales and Trading Analyst', 'Equity Trader'],
    trading: ['Sales and Trading Analyst', 'Equity Trader'],
    researcher: ['Equity Research Analyst', 'Macro Research Analyst'],
    // Cross-industry: at Goldman/JPM/etc, "consultant" usually means strategy/advisory
    // adjacent roles. "Engineer" maps to tech-in-finance roles.
    consultant: ['Investment Banking Analyst', 'Strategy Associate', 'Equity Research Analyst'],
    consultants: ['Investment Banking Analyst', 'Strategy Associate'],
    consulting: ['Investment Banking Analyst', 'Strategy Associate'],
    engineer: ['Software Engineer', 'Quantitative Analyst', 'Quantitative Researcher'],
    // "finance at <bank>" → entry-level finance roles inside the bank
    finance: ['Investment Banking Analyst', 'Equity Research Analyst', 'Sales and Trading Analyst', 'Financial Analyst'],
  },
  consulting: {
    consultant: ['Management Consultant', 'Strategy Consultant', 'Operations Consultant', 'Technology Consultant'],
    consultants: ['Management Consultant', 'Strategy Consultant', 'Operations Consultant'],
    consulting: ['Management Consultant', 'Strategy Consultant', 'Healthcare Consultant'],
    'management consulting': ['Management Consultant', 'Associate Consultant'],
    'management consultant': ['Management Consultant', 'Senior Consultant'],
    analyst: ['Business Analyst', 'Strategy Analyst', 'Operations Analyst'],
    associate: ['Associate Consultant', 'Senior Associate Consultant'],
    // Cross-industry: consulting firms don't actually have bankers — when the user
    // says "bankers at Bain/McKinsey/BCG", the intent is consulting-firm roles.
    banker: ['Management Consultant', 'Associate Consultant', 'Senior Consultant'],
    bankers: ['Management Consultant', 'Associate Consultant'],
    'investment banker': ['Management Consultant', 'Associate Consultant'],
    'investment bankers': ['Management Consultant', 'Associate Consultant'],
    'investment banking': ['Management Consultant', 'Associate Consultant'],
    engineer: ['Technology Consultant', 'Solutions Architect', 'Software Engineer'],
    finance: ['Financial Services Consultant', 'Strategy Analyst', 'Operations Consultant', 'Corporate Strategy Analyst'],
  },
  'private-equity': {
    analyst: ['Private Equity Analyst', 'Investment Analyst'],
    associate: ['Private Equity Associate', 'Investment Associate'],
    banker: ['Private Equity Analyst', 'Investment Banking Analyst'],
    'investment banking': ['Private Equity Analyst', 'Investment Banking Analyst'],
  },
  'venture-capital': {
    analyst: ['Venture Capital Analyst', 'Investment Analyst', 'Research Analyst'],
    associate: ['Venture Capital Associate', 'Investment Associate'],
    investor: ['Venture Capital Analyst', 'Venture Capital Associate'],
  },
  finance: {
    analyst: ['Financial Analyst', 'Quantitative Analyst', 'Equity Research Analyst'],
    banker: ['Financial Analyst', 'Investment Banking Analyst'],
    trader: ['Trader', 'Quantitative Researcher', 'Sales and Trading Analyst'],
    trading: ['Trader', 'Sales and Trading Analyst'],
    researcher: ['Equity Research Analyst', 'Macro Research Analyst', 'Quantitative Researcher'],
    finance: ['Financial Analyst', 'Investment Banking Analyst', 'Equity Research Analyst', 'Sales and Trading Analyst'],
  },
  tech: {
    engineer: ['Software Engineer', 'Data Scientist', 'Machine Learning Engineer', 'Site Reliability Engineer'],
    engineers: ['Software Engineer', 'Data Scientist', 'Machine Learning Engineer'],
    engineering: ['Software Engineer', 'Data Engineer'],
    'software engineer': ['Software Engineer', 'Senior Software Engineer'],
    'software engineers': ['Software Engineer'],
    swe: ['Software Engineer'],
    'product manager': ['Product Manager', 'Technical Product Manager', 'Associate Product Manager'],
    pm: ['Product Manager', 'Technical Product Manager'],
    'data scientist': ['Data Scientist', 'Machine Learning Engineer', 'Quantitative Researcher'],
    'data scientists': ['Data Scientist'],
    designer: ['Product Designer', 'UX Designer', 'UI Designer'],
    'ml engineer': ['Machine Learning Engineer', 'Data Scientist'],
    analyst: ['Data Analyst', 'Business Analyst', 'Product Analyst'],
    // "finance at Google" → finance roles inside a tech company (FP&A, treasury, strategic finance)
    finance: ['Financial Analyst', 'FP&A Analyst', 'Treasury Analyst', 'Strategic Finance Analyst', 'Corporate Finance Analyst'],
  },
  fintech: {
    engineer: ['Software Engineer', 'Backend Engineer', 'Site Reliability Engineer'],
    'product manager': ['Product Manager', 'Fintech Product Manager'],
    pm: ['Product Manager'],
    analyst: ['Fintech Analyst', 'Business Analyst', 'Data Analyst'],
    finance: ['Strategic Finance Analyst', 'FP&A Analyst', 'Financial Analyst', 'Business Analyst'],
  },
};

// Shorthand company labels (FAANG, MBB, Big 4) aren't in companies.ts. Tag them here.
const SHORTHAND_INDUSTRY: Record<string, string> = {
  FAANG: 'tech',
  MAANG: 'tech',
  MANGO: 'tech',
  MBB: 'consulting',
  'Big 4': 'consulting',
};

function getCompanyIndustry(label: string): string | null {
  if (SHORTHAND_INDUSTRY[label]) return SHORTHAND_INDUSTRY[label];
  // companies.ts is the source of truth for industry tagging on real companies.
  const found = COMPANIES.find((c) => c.name === label);
  return found?.industry ?? null;
}

/** List of role variations for the paired (role, company) — surfaces titles within
 *  the same industry the user may not have considered. Junior/analyst-leaning
 *  defaults to match Offerloop's audience. Returns [] if no industry match. */
function getRoleVariations(role: string, company: string): string[] {
  const industry = getCompanyIndustry(company);
  if (!industry) return [];
  const map = INDUSTRY_ROLE_VARIATIONS[industry];
  if (!map) return [];
  const lower = role.toLowerCase();
  if (map[lower]) return map[lower];
  // Substring fallback for multi-word keys ("investment banking" inside the role).
  for (const [key, list] of Object.entries(map)) {
    if (lower.includes(key)) return list;
  }
  return [];
}

// Curated peer-company alternatives. Each entry is the canonical company label (as
// produced by COMPANY_ALIASES) mapped to a list of similar firms in the same tier.
// Future-proof hook: when richer user context is wired (resume, GPA, year, target
// industries), this list can be re-ranked or filtered at render time without
// changing the schema or the consuming component.
const COMPANY_ALTERNATIVES: Record<string, string[]> = {
  // Bulge bracket investment banks
  'Goldman Sachs': ['Morgan Stanley', 'JPMorgan Chase', 'Evercore', 'Lazard'],
  'Morgan Stanley': ['Goldman Sachs', 'JPMorgan Chase', 'Evercore', 'Bank of America'],
  'JPMorgan Chase': ['Goldman Sachs', 'Morgan Stanley', 'Bank of America', 'Citigroup'],
  'Bank of America': ['JPMorgan Chase', 'Citigroup', 'Morgan Stanley'],
  'Citigroup': ['JPMorgan Chase', 'Bank of America', 'Barclays'],
  'Barclays': ['Deutsche Bank', 'JPMorgan Chase', 'Citigroup', 'Morgan Stanley'],
  'Deutsche Bank': ['Barclays', 'Credit Suisse'],
  'Credit Suisse': ['Deutsche Bank', 'Barclays'],
  // Elite boutiques
  'Evercore': ['Lazard', 'Centerview Partners', 'Houlihan Lokey', 'PJT Partners'],
  'Lazard': ['Evercore', 'Centerview Partners', 'Houlihan Lokey'],
  'Centerview Partners': ['Evercore', 'Lazard', 'PJT Partners'],
  'PJT Partners': ['Evercore', 'Lazard', 'Centerview Partners'],
  'Houlihan Lokey': ['Evercore', 'Lazard', 'PJT Partners'],
  // MBB consulting
  'McKinsey & Company': ['Boston Consulting Group', 'Bain & Company', 'Deloitte'],
  'Boston Consulting Group': ['McKinsey & Company', 'Bain & Company', 'Deloitte'],
  'Bain & Company': ['McKinsey & Company', 'Boston Consulting Group', 'Deloitte'],
  // Mid-tier consulting
  'Deloitte': ['Accenture', 'McKinsey & Company', 'Boston Consulting Group'],
  'Accenture': ['Deloitte', 'McKinsey & Company'],
  'Oliver Wyman': ['Bain & Company', 'McKinsey & Company'],
  'Booz Allen': ['Accenture', 'Deloitte'],
  // Tech (broad)
  'Google': ['Meta', 'Amazon', 'Microsoft', 'Apple'],
  'Meta': ['Google', 'Amazon', 'Apple'],
  'Amazon': ['Google', 'Microsoft', 'Meta', 'Apple'],
  'Apple': ['Google', 'Meta', 'Microsoft'],
  'Microsoft': ['Google', 'Amazon', 'Apple'],
  'Netflix': ['Spotify', 'Amazon'],
  'Salesforce': ['Snowflake', 'Databricks'],
  'Snowflake': ['Databricks', 'Salesforce'],
  'Databricks': ['Snowflake', 'Salesforce'],
  // Fintech
  'Stripe': ['Plaid', 'Robinhood', 'Coinbase'],
  'Plaid': ['Stripe', 'Robinhood'],
  'Robinhood': ['Coinbase', 'Plaid'],
  'Coinbase': ['Robinhood', 'Stripe'],
  // Private equity
  'Blackstone': ['KKR', 'Apollo Global Management', 'Carlyle Group', 'TPG Capital'],
  'KKR': ['Blackstone', 'Apollo Global Management', 'Carlyle Group'],
  'Apollo Global Management': ['Blackstone', 'KKR', 'Carlyle Group'],
  'Carlyle Group': ['Blackstone', 'KKR', 'Apollo Global Management'],
  'Warburg Pincus': ['Blackstone', 'KKR', 'TPG Capital'],
  'TPG Capital': ['Blackstone', 'Warburg Pincus', 'Carlyle Group'],
  // Hedge funds / quant
  'Citadel': ['Two Sigma', 'Jane Street', 'Point72'],
  'Two Sigma': ['Citadel', 'Jane Street', 'DE Shaw'],
  'Jane Street': ['Citadel', 'Two Sigma'],
  'Point72': ['Citadel', 'Two Sigma'],
  'Bridgewater': ['Two Sigma', 'Citadel'],
  // VC
  'Andreessen Horowitz': ['Sequoia Capital', 'Benchmark', 'Accel'],
  'Sequoia Capital': ['Andreessen Horowitz', 'Benchmark', 'Accel'],
  'Benchmark': ['Sequoia Capital', 'Andreessen Horowitz', 'Accel'],
  // AI labs
  'OpenAI': ['Anthropic'],
  'Anthropic': ['OpenAI'],
};

function getCompanyAlternatives(label: string): string[] {
  return COMPANY_ALTERNATIVES[label] ?? [];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface MatchResult {
  label: string;
  matched: string;
  range: [number, number];
}

/** Find the first matching term in `tokens` against `text`, preferring longer terms. */
function findFirstMatch(text: string, tokens: TokenEntry[]): MatchResult | null {
  // Flatten into (term, label) and sort by term length descending so the most specific
  // multi-word forms beat the single-word fallback ("investment banking analyst" beats "analyst").
  const flat: { term: string; label: string }[] = [];
  for (const entry of tokens) {
    for (const term of entry.match) {
      flat.push({ term, label: entry.label });
    }
  }
  flat.sort((a, b) => b.term.length - a.term.length);

  for (const { term, label } of flat) {
    const regex = new RegExp(`\\b${escapeRegex(term)}\\b`, 'i');
    const m = text.match(regex);
    if (m && typeof m.index === 'number') {
      return {
        label,
        matched: text.substr(m.index, term.length),
        range: [m.index, m.index + term.length],
      };
    }
  }
  return null;
}

/** Replace `[start, end)` in `text` with spaces — preserves indices for downstream passes. */
function maskRange(text: string, range: [number, number]): string {
  return text.substring(0, range[0]) + ' '.repeat(range[1] - range[0]) + text.substring(range[1]);
}

// Sort companies.ts and roles.ts by name length descending once at module load — used by
// the fallback scans only when the curated alias map misses.
const COMPANIES_FALLBACK = [...COMPANIES]
  .filter(c => c.name.length >= 4) // skip ultra-short names that cause false positives
  .sort((a, b) => b.name.length - a.name.length);

const ROLES_FALLBACK = [...ROLES].sort((a, b) => b.name.length - a.name.length);

function scanCompaniesFallback(text: string): MatchResult | null {
  for (const c of COMPANIES_FALLBACK) {
    const regex = new RegExp(`\\b${escapeRegex(c.name.toLowerCase())}\\b`, 'i');
    const m = text.match(regex);
    if (m && typeof m.index === 'number') {
      return { label: c.name, matched: text.substr(m.index, c.name.length), range: [m.index, m.index + c.name.length] };
    }
  }
  return null;
}

function scanUniversitiesFallback(text: string): MatchResult | null {
  // Only run when the prompt mentions a school keyword — avoids matching "Boston" inside
  // "Boston" the city as "Boston University".
  if (!/\b(university|college|school|alumni|alum|grad|grads|grad of|attended)\b/i.test(text)) {
    return null;
  }
  // Iterate longest first so "Boston College" beats "Boston". Cap to prevent runaway scans.
  const sorted = [...UNIVERSITIES].filter(u => u.length >= 6).sort((a, b) => b.length - a.length);
  for (const uni of sorted) {
    const regex = new RegExp(`\\b${escapeRegex(uni.toLowerCase())}\\b`, 'i');
    const m = text.match(regex);
    if (m && typeof m.index === 'number') {
      return { label: uni, matched: text.substr(m.index, uni.length), range: [m.index, m.index + uni.length] };
    }
  }
  return null;
}

function scanRolesFallback(text: string): MatchResult | null {
  for (const r of ROLES_FALLBACK) {
    if (r.name.length < 5) continue;
    const regex = new RegExp(`\\b${escapeRegex(r.name.toLowerCase())}\\b`, 'i');
    const m = text.match(regex);
    if (m && typeof m.index === 'number') {
      return { label: r.name, matched: text.substr(m.index, r.name.length), range: [m.index, m.index + r.name.length] };
    }
  }
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Analyze a search prompt for the four dimensions. Empty/short input returns all-null. */
export function analyzeQuery(prompt: string, rotationSeed: number = 0): QueryAnalysis {
  const result: QueryAnalysis = { role: null, location: null, company: null, school: null, industry: null };
  const trimmed = prompt.trim();
  if (trimmed.length < 2) return result;

  let working = prompt;

  // 1. Company — alias map first, then companies.ts fallback.
  let m: MatchResult | null = findFirstMatch(working, COMPANY_ALIASES);
  if (!m) m = scanCompaniesFallback(working);
  if (m) {
    result.company = { value: m.label, matched: m.matched };
    working = maskRange(working, m.range);
  }

  // 2. School — alias map, then keyword-gated universities.ts scan.
  // Run iteratively so we can detect transfer / study-abroad cases
  // ("UCI alum, transferred to USC", "Bocconi exchange from USC"). Primary
  // school stays in `result.school`; extras go in `additionalSchools` and
  // get sent to the backend as additional alumni filters.
  const additional: DimensionMatch[] = [];
  for (let pass = 0; pass < 3; pass++) {
    let m2 = findFirstMatch(working, SCHOOL_ALIASES);
    if (!m2) m2 = scanUniversitiesFallback(working);
    if (!m2) break;
    const canonical = SCHOOL_CANONICAL[m2.label] || m2.label;
    const match: DimensionMatch = { value: m2.label, matched: m2.matched, canonical };
    if (!result.school) {
      result.school = match;
    } else if (
      match.value.toLowerCase() !== result.school.value.toLowerCase() &&
      !additional.some((a) => a.value.toLowerCase() === match.value.toLowerCase())
    ) {
      additional.push(match);
    }
    working = maskRange(working, m2.range);
  }
  if (additional.length > 0) {
    result.additionalSchools = additional;
  }

  // 3. Location.
  m = findFirstMatch(working, LOCATION_TOKENS);
  if (m) {
    result.location = { value: m.label, matched: m.matched };
    working = maskRange(working, m.range);
  }

  // 4. Role — curated lexicon, then roles.ts fallback.
  m = findFirstMatch(working, ROLE_TOKENS);
  if (!m) m = scanRolesFallback(working);
  if (m) {
    result.role = { value: m.label, matched: m.matched };
  }

  // 5. Suggestion pass — surface variations (not auto-applied):
  //    - Role variations: industry-aware list of titles (Banker → IB Analyst,
  //      Sales & Trading Analyst, Equity Research Analyst). Exposes paths the
  //      user may not have considered.
  //    - Company alternatives: peer firms in the same tier (Barclays → Deutsche
  //      Bank, JPMorgan, Citigroup). Helps students explore beyond the one firm
  //      they typed.
  //    Both render as flip-up cards above their respective chips.
  if (result.role && result.company) {
    const variations = getRoleVariations(result.role.value, result.company.value);
    const filtered = variations.filter(
      (s) => s.toLowerCase() !== result.role!.value.toLowerCase()
    );
    if (filtered.length > 0) {
      result.role.suggestions = filtered;
    }
  }
  if (result.company) {
    const alternatives = getCompanyAlternatives(result.company.value);
    if (alternatives.length > 0) {
      result.company.suggestions = alternatives;
    }
  }

  // 5b. Industry — detect from a separate lexicon (run on the full prompt, not
  // the masked working buffer, so it can co-exist with role/school/company).
  if (!result.industry) {
    result.industry = _detectIndustry(prompt);
  }
  // When industry was detected but the user hasn't named a specific role yet,
  // populate role suggestions so the Grammarly-style card prompts them to swap
  // the vague industry term for a concrete title (PDL routes much better on
  // role titles than on industry words).
  if (result.industry && !result.role) {
    const roleSuggestions = getIndustryRoleSuggestions(result.industry.value);
    if (roleSuggestions.length > 0) {
      result.industry.suggestions = roleSuggestions;
    }
  }

  // 6. Role + location, no company → curated (role × location) shortlist.
  // This is the killer case — if the user has typed "Growth Analyst in LA"
  // we surface Snap/Roblox/GOAT, not the generic tech top-companies.
  if (result.role && result.location && !result.company) {
    const firms = getRoleLocationCompanies(result.role.value, result.location.value);
    if (firms.length > 0) {
      result.roleLocationCompanies = {
        roleLabel: result.role.value,
        location: result.location.value,
        firms: pickWithRotation(firms, 5, rotationSeed, 2),
      };
    }
  }

  // 7. Role-only → industry firms (no location specified, fall back to
  // role's industry-wide top employers).
  if (result.role && !result.company && !result.roleLocationCompanies) {
    const firms = getTopFirmsForRole(result.role.value);
    if (firms) {
      result.industryFirms = {
        industry: firms.industry,
        firms: pickWithRotation(firms.firms, 5, rotationSeed, 2),
      };
    }
  }

  // 7b. Industry detected alone (or alongside school) but no role/company →
  // show top firms in that industry. Lets queries like "USC grads in tech"
  // produce a meaningful rail even before they specify a role.
  if (
    result.industry &&
    !result.role &&
    !result.company &&
    !result.roleLocationCompanies &&
    !result.industryFirms
  ) {
    const firms = getIndustryFirms(result.industry.value);
    if (firms.length > 0) {
      result.industryFirms = {
        industry: result.industry.value,
        firms: pickWithRotation(firms, 5, rotationSeed, 2),
      };
    }
  }

  // 8. Role detected → always surface common hiring locations for that role.
  // Filter out any location the user already typed so we don't duplicate it back.
  // School-aware anchor: if a school is detected and its hometown isn't already
  // in the prompt, pin it to slot 1 — USC students see LA first, NYU students
  // see NYC first, etc. Removes the cognitive load of "where do I usually look?"
  if (result.role) {
    const locs = getTopLocationsForRole(result.role.value);
    if (locs) {
      const userLocLower = result.location?.value?.toLowerCase() ?? '';
      let filtered = locs.locations.filter(
        (l) => l.toLowerCase() !== userLocLower,
      );

      // Pin the school's hometown as the no-brainer slot.
      let pinned: string | null = null;
      if (result.school) {
        const home = getSchoolHometownLocation(result.school.value);
        if (home && home.toLowerCase() !== userLocLower) {
          pinned = home;
          // Drop hometown from the rotation pool so it doesn't double-list.
          filtered = filtered.filter((l) => l.toLowerCase() !== home.toLowerCase());
        }
      }

      const rotated = pickWithRotation(filtered, pinned ? 3 : 4, rotationSeed, 1);
      const final = pinned ? [pinned, ...rotated] : rotated;
      if (final.length > 0) {
        result.industryLocations = {
          roleLabel: locs.roleLabel,
          locations: final,
        };
      }
    }
  }

  // 9. School detected, no role + no company → "Where [school] alumni work".
  // If industry is ALSO detected, use the (school × industry) intersection map
  // so we don't show generic Goldman/Disney to a startup-flavored query.
  if (result.school && !result.role && !result.company) {
    let firms: string[] = [];
    let labelOverride: string | null = null;
    if (result.industry) {
      const intersect = getSchoolIndustryFirms(result.school.value, result.industry.value);
      if (intersect.length > 0) {
        firms = intersect;
        labelOverride = result.industry.value; // we'll use this in the rail heading
      } else {
        // No curated intersection — fall back to industry-wide list (still better
        // than school-generic for industry-flavored queries).
        firms = getIndustryFirms(result.industry.value);
      }
    }
    if (firms.length === 0) {
      firms = getSchoolTopEmployers(result.school.value);
    }
    if (firms.length > 0) {
      result.schoolEmployers = {
        schoolLabel: labelOverride
          ? `${result.school.value} × ${labelOverride}`
          : result.school.value,
        firms: pickWithRotation(firms, 5, rotationSeed, 2),
      };
    }
  }

  return result;
}

// ── Industry-detection pass — added after company/school/location/role ──────
// Patches into the existing analyzeQuery flow. We run a final pass for industry
// because it's the lowest-priority dimension (only fires when nothing more
// specific is in scope).
function _detectIndustry(prompt: string): DimensionMatch | null {
  const m = findFirstMatch(prompt.toLowerCase(), INDUSTRY_TOKENS);
  if (!m) return null;
  return { value: m.label, matched: m.matched };
}

// ── Role → top industry firms ────────────────────────────────────────────────

const ROLE_TO_INDUSTRY_SLUG: Record<string, string> = {
  // Finance / banking family
  'Finance': 'investment-banking',
  'Investment Banking': 'investment-banking',
  'Investment Banking Analyst': 'investment-banking',
  'Investment Banking Associate': 'investment-banking',
  'Banker': 'investment-banking',
  'Financial Analyst': 'corporate-finance',
  'Equity Research': 'investment-banking',
  // Trading & quant
  'Trader': 'hedge-funds',
  'Quantitative Analyst': 'hedge-funds',
  'Quantitative Researcher': 'hedge-funds',
  'Hedge Fund': 'hedge-funds',
  // Buy-side
  'Private Equity': 'private-equity',
  'Venture Capital': 'venture-capital',
  'Investment Analyst': 'venture-capital',
  'Venture Capital Analyst': 'venture-capital',
  'Private Equity Analyst': 'private-equity',
  // Consulting
  'Management Consulting': 'management-consulting',
  'Consultant': 'management-consulting',
  'Business Analyst': 'management-consulting',
  'Strategy Analyst': 'management-consulting',
  // Tech / startup roles
  'Software Engineer': 'tech',
  'ML Engineer': 'tech',
  'Data Scientist': 'tech',
  'Engineer': 'tech',
  'UX Designer': 'tech',
  'Designer': 'tech',
  'Founder': 'tech',
  'CEO': 'tech',
  'CTO': 'tech',
  'CFO': 'investment-banking',
  'Solutions Engineer': 'tech',
  'Forward-Deployed Engineer': 'tech',
  'Product Engineer': 'tech',
  'Program Manager': 'tech',
  // Product / growth / sales / marketing
  'Product Manager': 'product-management',
  'Marketing': 'marketing',
  'Growth Analyst': 'tech',
  'Growth Manager': 'tech',
  'Business Development Analyst': 'tech',
  'Business Development': 'tech',
  'Account Executive': 'tech',
  'Account Manager': 'tech',
  'Sales Development Representative': 'tech',
  'Customer Success Associate': 'tech',
  'Revenue Operations': 'tech',
  // Operations & corporate finance at companies
  'Operations Analyst': 'tech',
  'Operations Associate': 'tech',
  'Strategic Finance Analyst': 'corporate-finance',
  'FP&A Analyst': 'corporate-finance',
  // Other
  'Attorney': 'legal',
  'Accountant': 'accounting',
  'Recruiter': 'tech',
  'Scientist': 'biotech',
  'Researcher': 'biotech',
  'Strategist': 'management-consulting',
  'Research Analyst': 'investment-banking',
};

// ── (role, location) → curated company list ──────────────────────────────────
// Override layer: when both role AND location are detected, we look up specific
// companies that hire that role in that location. Falls back to the industry-wide
// top_companies if no override is found. Locations are matched case-insensitively
// and substring-friendly (so "Los Angeles, CA" matches "los angeles").

const ROLE_LOCATION_COMPANIES: Record<string, Record<string, string[]>> = {
  // Growth / BD / Sales / RevOps — modern startup/tech roles per geography
  'Growth Analyst': {
    'los angeles': ['Snap', 'Roblox', 'GOAT', 'ServiceTitan', 'Whoop'],
    'san francisco': ['Stripe', 'Notion', 'Figma', 'Doordash', 'Airbnb'],
    'new york': ['Datadog', 'Stripe', 'Etsy', 'Peloton', 'WeWork'],
  },
  'Growth Manager': {
    'los angeles': ['Snap', 'Roblox', 'GOAT', 'Tinder', 'Whoop'],
    'san francisco': ['Stripe', 'Airbnb', 'Notion', 'Figma', 'Plaid'],
    'new york': ['Datadog', 'Etsy', 'Peloton', 'Stripe'],
  },
  'Business Development Analyst': {
    'los angeles': ['Snap', 'Disney', 'Riot Games', 'Hulu'],
    'san francisco': ['Stripe', 'Salesforce', 'Slack', 'Atlassian'],
    'new york': ['Bloomberg', 'Datadog', 'Spotify', 'JPMorgan'],
  },
  'Account Executive': {
    'los angeles': ['Snap', 'ServiceTitan', 'Riot Games', 'GOAT'],
    'san francisco': ['Salesforce', 'Slack', 'Stripe', 'Notion', 'Figma'],
    'new york': ['Datadog', 'Salesforce', 'HubSpot', 'Spotify'],
  },
  'Solutions Engineer': {
    'san francisco': ['Stripe', 'Snowflake', 'Databricks', 'MongoDB', 'Datadog'],
    'new york': ['MongoDB', 'Datadog', 'Cloudflare', 'Twilio'],
    'los angeles': ['Snap', 'ServiceTitan', 'Snowflake'],
  },
  'Forward-Deployed Engineer': {
    'san francisco': ['Palantir', 'Anthropic', 'OpenAI', 'Scale AI', 'Stripe'],
    'new york': ['Palantir', 'Datadog'],
  },
  // Tech / engineering by city
  'Software Engineer': {
    'los angeles': ['Snap', 'Riot Games', 'Disney', 'Hulu', 'Netflix'],
    'san francisco': ['Google', 'Meta', 'Stripe', 'Anthropic', 'OpenAI'],
    'seattle': ['Microsoft', 'Amazon', 'Tableau', 'Smartsheet', 'Boeing'],
    'new york': ['Google', 'Stripe', 'Two Sigma', 'Datadog', 'Bloomberg'],
    'austin': ['Tesla', 'Meta', 'Indeed', 'Atlassian'],
  },
  'Engineer': {
    'los angeles': ['Snap', 'Riot Games', 'Disney', 'SpaceX', 'Northrop Grumman'],
    'san francisco': ['Google', 'Meta', 'Stripe', 'Anthropic', 'OpenAI'],
    'seattle': ['Microsoft', 'Amazon', 'Boeing'],
    'new york': ['Google', 'Stripe', 'Bloomberg', 'Two Sigma'],
  },
  'Product Manager': {
    'los angeles': ['Snap', 'Disney', 'Riot Games', 'Hulu', 'GOAT'],
    'san francisco': ['Google', 'Meta', 'Stripe', 'Notion', 'Figma'],
    'seattle': ['Microsoft', 'Amazon'],
    'new york': ['Google', 'Spotify', 'Datadog', 'Stripe'],
  },
  'ML Engineer': {
    'san francisco': ['OpenAI', 'Anthropic', 'Google', 'Meta', 'Scale AI'],
    'new york': ['Google', 'Two Sigma', 'D. E. Shaw', 'Hudson River Trading'],
    'los angeles': ['Snap', 'Riot Games'],
  },
  // Finance / banking by city
  'Investment Banking Analyst': {
    'new york': ['Goldman Sachs', 'JPMorgan', 'Morgan Stanley', 'Evercore', 'Lazard'],
    'los angeles': ['Houlihan Lokey', 'Moelis & Company', 'B. Riley', 'Centerview Partners'],
    'san francisco': ['Qatalyst Partners', 'Goldman Sachs', 'JPMorgan'],
    'london': ['Goldman Sachs', 'JPMorgan', 'Morgan Stanley', 'Barclays'],
    'chicago': ['Lincoln International', 'William Blair', 'BMO Capital Markets'],
  },
  'Banker': {
    'new york': ['Goldman Sachs', 'JPMorgan', 'Morgan Stanley', 'Evercore'],
    'los angeles': ['Houlihan Lokey', 'Moelis & Company', 'Centerview Partners'],
  },
  'Investment Banking': {
    'new york': ['Goldman Sachs', 'JPMorgan', 'Morgan Stanley', 'Evercore', 'Lazard'],
    'los angeles': ['Houlihan Lokey', 'Moelis & Company', 'B. Riley'],
    'london': ['Goldman Sachs', 'JPMorgan', 'Barclays'],
  },
  'Finance': {
    'new york': ['Goldman Sachs', 'JPMorgan', 'Morgan Stanley', 'Blackstone'],
    'los angeles': ['Houlihan Lokey', 'Moelis & Company', 'Capital Group'],
    'san francisco': ['Stripe', 'Plaid', 'Charles Schwab'],
  },
  'Financial Analyst': {
    'los angeles': ['Disney', 'Snap', 'SpaceX', 'Capital Group'],
    'san francisco': ['Stripe', 'Salesforce', 'Visa'],
    'new york': ['Goldman Sachs', 'Morgan Stanley', 'Bloomberg', 'Citi'],
  },
  // Consulting
  'Management Consultant': {
    'new york': ['McKinsey', 'BCG', 'Bain', 'Deloitte'],
    'chicago': ['McKinsey', 'BCG', 'Bain', 'Boston Consulting Group'],
    'boston': ['Bain', 'BCG', 'Deloitte'],
    'los angeles': ['McKinsey', 'BCG', 'Bain', 'Deloitte'],
    'washington dc': ['McKinsey', 'BCG', 'Bain', 'Booz Allen Hamilton'],
  },
  'Consultant': {
    'new york': ['McKinsey', 'BCG', 'Bain', 'Deloitte', 'Accenture'],
    'chicago': ['McKinsey', 'BCG', 'Bain'],
    'boston': ['Bain', 'BCG', 'Deloitte'],
    'los angeles': ['McKinsey', 'BCG', 'Bain'],
  },
  // Marketing
  'Marketing': {
    'los angeles': ['Disney', 'Snap', 'WPP', 'Spotify'],
    'new york': ['Google', 'Meta', 'WPP', 'Spotify'],
    'san francisco': ['Google', 'Meta', 'Salesforce'],
  },
};

function getRoleLocationCompanies(roleLabel: string, locationValue: string): string[] {
  const map = ROLE_LOCATION_COMPANIES[roleLabel];
  if (!map) return [];
  const locLower = locationValue.toLowerCase();
  // Exact match first
  if (map[locLower]) return map[locLower];
  // Substring match — handles "los angeles, ca" → "los angeles"
  for (const key of Object.keys(map)) {
    if (locLower.includes(key)) return map[key];
  }
  return [];
}

// ── School → top employers ─────────────────────────────────────────────────
// Where a school's alumni concentrate. Used when the user's prompt has a school
// but no role/company yet — gives them a starting answer to "where do USC grads
// work?" before they've fully refined their query.

const SCHOOL_TOP_EMPLOYERS: Record<string, string[]> = {
  'USC': ['Goldman Sachs', 'McKinsey', 'Disney', 'Snap', 'Bain', 'Deloitte', 'EY', 'JPMorgan', 'BCG', 'Houlihan Lokey', 'Roblox', 'PwC', 'Spotify', 'Riot Games'],
  'UCLA': ['Google', 'Disney', 'Netflix', 'McKinsey', 'EY', 'BCG', 'Spotify', 'Snap', 'Bain', 'Goldman Sachs', 'Deloitte', 'Riot Games'],
  'Stanford': ['Google', 'Meta', 'Stripe', 'McKinsey', 'Sequoia Capital', 'Apple', 'a16z', 'Goldman Sachs', 'Anthropic', 'OpenAI', 'BCG', 'Bain'],
  'Harvard': ['Goldman Sachs', 'McKinsey', 'BCG', 'Bain', 'JPMorgan', 'Bridgewater', 'Morgan Stanley', 'Blackstone', 'KKR', 'Stripe'],
  'Yale': ['Goldman Sachs', 'McKinsey', 'BCG', 'JPMorgan', 'Bridgewater', 'Morgan Stanley', 'Bain', 'Evercore', 'Lazard'],
  'Princeton': ['Goldman Sachs', 'McKinsey', 'JPMorgan', 'Morgan Stanley', 'Bridgewater', 'BCG', 'Bain', 'Evercore'],
  'Columbia': ['Goldman Sachs', 'JPMorgan', 'Morgan Stanley', 'McKinsey', 'BCG', 'Bain', 'Deloitte', 'Citi', 'Evercore'],
  'Cornell': ['Goldman Sachs', 'JPMorgan', 'Morgan Stanley', 'McKinsey', 'Deloitte', 'BCG', 'Bain', 'EY'],
  'Dartmouth': ['Goldman Sachs', 'McKinsey', 'BCG', 'Bain', 'Morgan Stanley', 'JPMorgan', 'Evercore'],
  'Brown': ['Goldman Sachs', 'McKinsey', 'JPMorgan', 'Morgan Stanley', 'Bain', 'BCG', 'Stripe'],
  'NYU': ['Goldman Sachs', 'JPMorgan', 'Morgan Stanley', 'McKinsey', 'Deloitte', 'BCG', 'Bain', 'Citi', 'Datadog'],
  'MIT': ['Google', 'Meta', 'McKinsey', 'BCG', 'Bain', 'Two Sigma', 'Microsoft', 'Apple', 'Stripe', 'Anthropic'],
  'UPenn': ['Goldman Sachs', 'McKinsey', 'JPMorgan', 'Morgan Stanley', 'Bain', 'BCG', 'Blackstone', 'KKR'],
  'UC Berkeley': ['Google', 'Apple', 'Meta', 'McKinsey', 'Stripe', 'Anthropic', 'OpenAI', 'Microsoft', 'Adobe'],
  'Michigan': ['McKinsey', 'BCG', 'Goldman Sachs', 'Deloitte', 'JPMorgan', 'Bain', 'EY', 'PwC', 'Stripe'],
  'Northwestern': ['McKinsey', 'BCG', 'Bain', 'Goldman Sachs', 'Deloitte', 'JPMorgan', 'PwC'],
  'Duke': ['Goldman Sachs', 'McKinsey', 'BCG', 'Bain', 'Deloitte', 'JPMorgan', 'Morgan Stanley'],
  'Georgetown': ['Goldman Sachs', 'McKinsey', 'JPMorgan', 'Booz Allen Hamilton', 'Bain', 'Deloitte'],
  'CMU': ['Google', 'Meta', 'Microsoft', 'Apple', 'Amazon', 'Anthropic', 'OpenAI', 'NVIDIA'],
  'Notre Dame': ['Deloitte', 'Goldman Sachs', 'JPMorgan', 'EY', 'McKinsey', 'PwC'],
  // ── US — additional ────────────────────────────────────────────────────────
  'UC Irvine': ['Google', 'Disney', 'Snap', 'Deloitte', 'EY', 'Apple', 'PwC'],
  'UC Santa Cruz': ['Google', 'Apple', 'Adobe', 'Cisco', 'Salesforce'],
  'UC Riverside': ['Deloitte', 'EY', 'Google', 'Disney'],
  'UC Davis': ['Google', 'Apple', 'Genentech', 'Intel', 'Deloitte'],
  'University of Louisville': ['Humana', 'Brown-Forman', 'GE Appliances', 'Ford', 'Yum Brands', 'Deloitte'],
  'University of Central Florida': ['Disney', 'Lockheed Martin', 'Deloitte', 'EY', 'Walt Disney World'],
  'Florida State': ['Deloitte', 'EY', 'PwC', 'JPMorgan', 'Florida Power & Light'],
  'Arizona State': ['Intel', 'Deloitte', 'EY', 'Honeywell', 'Wells Fargo'],
  'Indiana University': ['Deloitte', 'EY', 'PwC', 'Goldman Sachs', 'Eli Lilly', 'Cummins'],
  'Texas A&M': ['ExxonMobil', 'Deloitte', 'EY', 'Lockheed Martin', 'PwC'],
  'Ohio State': ['Deloitte', 'EY', 'JPMorgan', 'Procter & Gamble', 'Nationwide'],
  'Penn State': ['Deloitte', 'EY', 'PwC', 'JPMorgan', 'IBM', 'Accenture'],
  'Villanova': ['Deloitte', 'EY', 'JPMorgan', 'PwC', 'Vanguard'],
  // ── International — UK ────────────────────────────────────────────────────
  'LSE': ['Goldman Sachs', 'JPMorgan', 'McKinsey', 'Barclays', 'Morgan Stanley', 'BCG', 'Deloitte'],
  'Oxford': ['Goldman Sachs', 'McKinsey', 'BCG', 'Bain', 'JPMorgan', 'DeepMind'],
  'Cambridge': ['Goldman Sachs', 'McKinsey', 'BCG', 'JPMorgan', 'DeepMind', 'Microsoft'],
  'Imperial College London': ['Google', 'Goldman Sachs', 'McKinsey', 'Microsoft', 'JPMorgan'],
  'UCL': ['Google', 'Goldman Sachs', 'McKinsey', 'JPMorgan', 'Deloitte'],
  "King's College London": ['McKinsey', 'BCG', 'Goldman Sachs', 'JPMorgan', 'Deloitte'],
  'Warwick': ['McKinsey', 'BCG', 'Goldman Sachs', 'PwC', 'Deloitte'],
  'London Business School': ['McKinsey', 'BCG', 'Bain', 'Goldman Sachs', 'JPMorgan'],
  // ── International — Italy ─────────────────────────────────────────────────
  'Bocconi': ['Mediobanca', 'McKinsey', 'Goldman Sachs', 'BCG', 'Bain', 'JPMorgan', 'BNP Paribas', 'UniCredit', 'Rothschild & Co'],
  'Politecnico di Milano': ['Google', 'Microsoft', 'Mediobanca', 'McKinsey', 'BCG'],
  'LUISS': ['McKinsey', 'BCG', 'Goldman Sachs', 'BNP Paribas', 'Mediobanca'],
  // ── International — France ────────────────────────────────────────────────
  'HEC Paris': ['BNP Paribas', 'McKinsey', 'BCG', 'Bain', 'Société Générale', 'Goldman Sachs', 'Lazard'],
  'INSEAD': ['McKinsey', 'BCG', 'Bain', 'Goldman Sachs', 'JPMorgan', 'Roland Berger'],
  'ESCP': ['BNP Paribas', 'McKinsey', 'BCG', 'Société Générale', 'Roland Berger'],
  'ESSEC': ['BNP Paribas', 'McKinsey', 'BCG', 'Société Générale', 'Lazard'],
  'Sciences Po': ['McKinsey', 'BCG', 'BNP Paribas', 'Roland Berger', 'Lazard'],
  // ── International — Spain ─────────────────────────────────────────────────
  'IE Business School': ['McKinsey', 'BCG', 'Bain', 'Santander', 'Roland Berger'],
  'ESADE': ['McKinsey', 'BCG', 'Bain', 'Santander', 'Roland Berger'],
  'IESE': ['McKinsey', 'BCG', 'Bain', 'Santander', 'JPMorgan'],
  // ── International — Germany ───────────────────────────────────────────────
  'WHU': ['McKinsey', 'BCG', 'Bain', 'Goldman Sachs', 'Roland Berger', 'Deutsche Bank'],
  'ESMT Berlin': ['McKinsey', 'BCG', 'Bain', 'Roland Berger'],
  'Mannheim': ['McKinsey', 'BCG', 'SAP', 'Roland Berger', 'Deloitte'],
  'TU Munich': ['Google', 'Microsoft', 'BMW', 'Siemens', 'McKinsey'],
  'RWTH Aachen': ['Siemens', 'BMW', 'Bosch', 'McKinsey', 'BCG'],
  // ── International — Switzerland ───────────────────────────────────────────
  'ETH Zurich': ['Google', 'Microsoft', 'McKinsey', 'Goldman Sachs', 'Anthropic', 'OpenAI'],
  'EPFL': ['Google', 'Apple', 'Logitech', 'Anthropic', 'Microsoft'],
  'IMD': ['McKinsey', 'BCG', 'Goldman Sachs', 'Nestlé', 'Roche'],
  'University of St. Gallen': ['McKinsey', 'BCG', 'Goldman Sachs', 'UBS', 'Credit Suisse'],
  // ── International — Netherlands ───────────────────────────────────────────
  'RSM Erasmus': ['McKinsey', 'BCG', 'ING', 'Booking.com', 'Adyen'],
  'Erasmus University': ['ING', 'Booking.com', 'McKinsey', 'BCG', 'Adyen'],
  // ── International — Nordics & Ireland ─────────────────────────────────────
  'Stockholm School of Economics': ['McKinsey', 'BCG', 'Klarna', 'Goldman Sachs', 'Spotify'],
  'KTH Stockholm': ['Spotify', 'Klarna', 'Ericsson', 'Google', 'Microsoft'],
  'Copenhagen Business School': ['McKinsey', 'BCG', 'Maersk', 'Novo Nordisk'],
  'Trinity College Dublin': ['Google', 'Meta', 'McKinsey', 'BCG', 'Deloitte'],
  // ── International — Asia ──────────────────────────────────────────────────
  'NUS': ['Goldman Sachs', 'McKinsey', 'JPMorgan', 'Standard Chartered', 'Grab', 'Sea Limited'],
  'NTU': ['Google', 'Microsoft', 'Standard Chartered', 'McKinsey', 'Grab'],
  'HKUST': ['Goldman Sachs', 'JPMorgan', 'McKinsey', 'HSBC', 'Tencent'],
  'HKU': ['Goldman Sachs', 'JPMorgan', 'McKinsey', 'HSBC', 'Standard Chartered'],
  'CUHK': ['Goldman Sachs', 'JPMorgan', 'HSBC', 'McKinsey', 'BCG'],
  'IIT Bombay': ['Google', 'Microsoft', 'Goldman Sachs', 'McKinsey', 'Two Sigma', 'Anthropic'],
  'IIT Delhi': ['Google', 'Microsoft', 'Goldman Sachs', 'McKinsey'],
  'IIT Madras': ['Google', 'Microsoft', 'Amazon', 'McKinsey'],
  'IIM Ahmedabad': ['McKinsey', 'BCG', 'Bain', 'Goldman Sachs', 'JPMorgan'],
  'IIM Bangalore': ['McKinsey', 'BCG', 'Bain', 'Goldman Sachs'],
  'Tsinghua': ['Tencent', 'ByteDance', 'Alibaba', 'Google', 'McKinsey'],
  'Peking University': ['Tencent', 'ByteDance', 'Alibaba', 'Goldman Sachs', 'McKinsey'],
  'University of Tokyo': ['Sony', 'Rakuten', 'Goldman Sachs', 'McKinsey', 'BCG'],
  'Seoul National University': ['Samsung', 'Hyundai', 'McKinsey', 'BCG'],
  // ── International — Canada / Australia ────────────────────────────────────
  'University of Toronto': ['Goldman Sachs', 'JPMorgan', 'McKinsey', 'RBC Capital Markets', 'BMO Capital Markets', 'Shopify'],
  'UBC': ['Microsoft', 'Goldman Sachs', 'McKinsey', 'Shopify', 'RBC Capital Markets'],
  "Queen's University": ['McKinsey', 'BCG', 'RBC Capital Markets', 'BMO Capital Markets'],
  'Western (Ivey)': ['McKinsey', 'BCG', 'Goldman Sachs', 'RBC Capital Markets', 'JPMorgan'],
  'University of Melbourne': ['Macquarie', 'McKinsey', 'BCG', 'Goldman Sachs'],
  'University of Sydney': ['Macquarie', 'McKinsey', 'Goldman Sachs', 'BCG'],
  'UNSW': ['Macquarie', 'Atlassian', 'McKinsey', 'Goldman Sachs', 'Canva'],
};

function getSchoolTopEmployers(schoolLabel: string): string[] {
  return SCHOOL_TOP_EMPLOYERS[schoolLabel] || [];
}

// ── School → no-brainer hometown location ───────────────────────────────────
// When a school is detected, this is the most obvious city to recruit in. We
// pin it as slot 1 of the locations rail so a USC student doesn't have to scroll
// past five out-of-region cities to find LA.
const SCHOOL_HOMETOWN_LOCATION: Record<string, string> = {
  'USC': 'Los Angeles, CA',
  'UCLA': 'Los Angeles, CA',
  'NYU': 'New York, NY',
  'Columbia': 'New York, NY',
  'Stanford': 'San Francisco, CA',
  'UC Berkeley': 'San Francisco, CA',
  'Harvard': 'Boston, MA',
  'MIT': 'Boston, MA',
  'Boston University': 'Boston, MA',
  'Boston College': 'Boston, MA',
  'Yale': 'New York, NY',
  'Princeton': 'New York, NY',
  'UPenn': 'Philadelphia, PA',
  'Cornell': 'New York, NY',
  'Dartmouth': 'New York, NY',
  'Brown': 'New York, NY',
  'Northwestern': 'Chicago, IL',
  'CMU': 'San Francisco, CA',
  'Michigan': 'Chicago, IL',
  'Notre Dame': 'Chicago, IL',
  'Duke': 'New York, NY',
  'Georgetown': 'Washington, DC',
  'GW': 'Washington, DC',
  'Vanderbilt': 'Nashville, TN',
  'Emory': 'Atlanta, GA',
  'Rice': 'Houston, TX',
  'UCSD': 'San Diego, CA',
  'UC San Diego': 'San Diego, CA',
  'UCSB': 'Los Angeles, CA',
  'UC Santa Barbara': 'Los Angeles, CA',
  'UT Austin': 'Austin, TX',
  'UC Irvine': 'Los Angeles, CA',
  'UC Santa Cruz': 'San Francisco, CA',
  'UC Riverside': 'Los Angeles, CA',
  'UC Davis': 'San Francisco, CA',
  'University of Louisville': 'Louisville, KY',
  'University of Central Florida': 'Orlando, FL',
  'Florida State': 'Tallahassee, FL',
  'Arizona State': 'Phoenix, AZ',
  'Indiana University': 'Bloomington, IN',
  'Texas A&M': 'College Station, TX',
  'Ohio State': 'Columbus, OH',
  'Penn State': 'State College, PA',
  'Villanova': 'Philadelphia, PA',
  // International
  'LSE': 'London, United Kingdom',
  'Oxford': 'Oxford, United Kingdom',
  'Cambridge': 'Cambridge, United Kingdom',
  'Imperial College London': 'London, United Kingdom',
  'UCL': 'London, United Kingdom',
  "King's College London": 'London, United Kingdom',
  'Warwick': 'Coventry, United Kingdom',
  'London Business School': 'London, United Kingdom',
  'Bocconi': 'Milan, Italy',
  'Politecnico di Milano': 'Milan, Italy',
  'LUISS': 'Rome, Italy',
  'HEC Paris': 'Paris, France',
  'INSEAD': 'Fontainebleau, France',
  'ESCP': 'Paris, France',
  'ESSEC': 'Paris, France',
  'Sciences Po': 'Paris, France',
  'IE Business School': 'Madrid, Spain',
  'ESADE': 'Barcelona, Spain',
  'IESE': 'Barcelona, Spain',
  'WHU': 'Vallendar, Germany',
  'ESMT Berlin': 'Berlin, Germany',
  'Mannheim': 'Mannheim, Germany',
  'RWTH Aachen': 'Aachen, Germany',
  'TU Munich': 'Munich, Germany',
  'ETH Zurich': 'Zurich, Switzerland',
  'EPFL': 'Lausanne, Switzerland',
  'IMD': 'Lausanne, Switzerland',
  'University of St. Gallen': 'St. Gallen, Switzerland',
  'RSM Erasmus': 'Rotterdam, Netherlands',
  'Erasmus University': 'Rotterdam, Netherlands',
  'Stockholm School of Economics': 'Stockholm, Sweden',
  'KTH Stockholm': 'Stockholm, Sweden',
  'Copenhagen Business School': 'Copenhagen, Denmark',
  'Trinity College Dublin': 'Dublin, Ireland',
  // Asia
  'NUS': 'Singapore',
  'NTU': 'Singapore',
  'HKUST': 'Hong Kong',
  'HKU': 'Hong Kong',
  'CUHK': 'Hong Kong',
  'IIT Bombay': 'Mumbai, India',
  'IIT Delhi': 'New Delhi, India',
  'IIT Madras': 'Chennai, India',
  'IIM Ahmedabad': 'Ahmedabad, India',
  'IIM Bangalore': 'Bengaluru, India',
  'Tsinghua': 'Beijing, China',
  'Peking University': 'Beijing, China',
  'University of Tokyo': 'Tokyo, Japan',
  'Seoul National University': 'Seoul, South Korea',
  // Canada / Australia
  'University of Toronto': 'Toronto, Canada',
  'UBC': 'Vancouver, Canada',
  "Queen's University": 'Kingston, Canada',
  'Western (Ivey)': 'London, Canada',
  'University of Melbourne': 'Melbourne, Australia',
  'University of Sydney': 'Sydney, Australia',
  'UNSW': 'Sydney, Australia',
};

function getSchoolHometownLocation(schoolLabel: string): string | null {
  return SCHOOL_HOMETOWN_LOCATION[schoolLabel] || null;
}

// ── Seeded rotation helper ───────────────────────────────────────────────────
//
// Picks N items from a pool with a stable shuffle driven by `seed`. Same seed
// + same pool = same selection (so re-renders during typing don't shuffle the
// rail underneath the user's mouse). Different seed = different selection.
//
// "Anchor" mode: the first `anchorCount` slots are always the top of the pool
// (so the user keeps seeing their best-fit firms), and the remaining slots
// rotate through the rest of the pool. This balances stability with discovery.

function _seededShuffle<T>(arr: T[], seed: number): T[] {
  // Mulberry32 — small deterministic PRNG. Plenty for shuffle.
  let s = seed | 0;
  const prng = () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickWithRotation<T>(
  pool: T[],
  count: number,
  seed: number,
  anchorCount: number = 0,
): T[] {
  if (pool.length <= count) return pool.slice();
  const anchor = pool.slice(0, anchorCount);
  const rotatable = pool.slice(anchorCount);
  const shuffled = _seededShuffle(rotatable, seed);
  return anchor.concat(shuffled.slice(0, count - anchorCount));
}

// ── Industry detection — 5th dimension on the analyzer ───────────────────────
//
// Industry intent is distinct from a specific role title. "USC grads in Tech —
// Startup" carries clear sectoral signal (startups in tech) but no role/company.
// The token list mirrors the strings produced by the Direction extractor on the
// Profile page, so what the user picks there round-trips here.

const INDUSTRY_TOKENS: TokenEntry[] = [
  // Tech sub-buckets — the user's "Tech — Startup" interest case
  { match: ['tech — startup', 'tech - startup', 'tech startups', 'startup', 'startups', 'tech startup'], label: 'Tech — Startup' },
  { match: ['tech — big', 'tech - big', 'big tech', 'faang'], label: 'Tech — Big' },
  // Bare "tech" / "in tech" — generic industry signal, lower priority than the specific
  // sub-buckets above (those run first via the longest-first match order).
  { match: ['in tech', 'into tech', 'tech industry', 'tech'], label: 'Tech' },
  { match: ['ai / ml', 'ai/ml', 'ai and ml', 'ml / ai', 'machine learning', 'artificial intelligence'], label: 'AI / ML' },
  { match: ['developer tools', 'dev tools', 'devtools'], label: 'Developer Tools' },
  // Finance / banking buckets
  { match: ['investment banking sector', 'ib sector', 'in ib', 'ib'], label: 'Investment Banking' },
  { match: ['private equity sector'], label: 'Private Equity' },
  { match: ['venture capital sector', 'vc sector'], label: 'Venture Capital' },
  { match: ['hedge funds sector', 'hedge fund sector'], label: 'Hedge Funds' },
  { match: ['quant trading', 'quantitative trading'], label: 'Quant Trading' },
  { match: ['fintech', 'fin tech'], label: 'FinTech' },
  // Consulting buckets
  { match: ['consulting (mbb)', 'mbb consulting', 'mbb'], label: 'Consulting (MBB)' },
  { match: ['consulting (big 4)', 'big 4 consulting'], label: 'Consulting (Big 4)' },
  { match: ['strategy consulting', 'consulting (strategy)'], label: 'Consulting (Strategy)' },
  // Other industries
  { match: ['healthcare', 'health care'], label: 'Healthcare' },
  { match: ['marketing sector'], label: 'Marketing' },
  { match: ['sales / bd', 'sales and bd', 'sales/bd'], label: 'Sales / BD' },
  { match: ['product management sector'], label: 'Product Management' },
  { match: ['real estate sector'], label: 'Real Estate' },
  { match: ['energy sector'], label: 'Energy' },
  { match: ['media & entertainment', 'media and entertainment'], label: 'Media & Entertainment' },
  { match: ['government / policy', 'government and policy'], label: 'Government / Policy' },
  { match: ['nonprofit', 'non-profit'], label: 'Nonprofit' },
];

// ── (School × Industry) → curated firm list ──────────────────────────────────
//
// When both a school AND an industry are detected, we show a curated list of
// firms that match the intersection. Critical for queries like "USC grads in
// Tech — Startup" where the generic SCHOOL_TOP_EMPLOYERS list (Goldman, McKinsey,
// Disney) actively misleads the user — they want startup-leaning USC employers.

const SCHOOL_INDUSTRY_FIRMS: Record<string, Record<string, string[]>> = {
  USC: {
    'Tech — Startup': ['Snap', 'Roblox', 'GOAT', 'ServiceTitan', 'Whoop', 'Tinder', 'Hinge', 'Niantic', 'Riot Games', 'Honey', 'ZipRecruiter', 'FabFitFun'],
    'Tech — Big': ['Snap', 'Google', 'Meta', 'Amazon', 'Apple', 'Microsoft', 'Disney', 'Adobe', 'Salesforce', 'Netflix'],
    'AI / ML': ['Anthropic', 'OpenAI', 'Scale AI', 'Snap', 'Riot Games', 'Disney', 'NVIDIA', 'Google'],
    'Developer Tools': ['ServiceTitan', 'GitHub', 'Stripe', 'Vercel', 'Linear', 'Datadog'],
    'Investment Banking': ['Goldman Sachs', 'Houlihan Lokey', 'Moelis & Company', 'JPMorgan', 'B. Riley', 'Centerview Partners', 'Morgan Stanley', 'Lazard', 'Evercore', 'Lincoln International', 'William Blair', 'PJT Partners'],
    'Consulting (MBB)': ['McKinsey', 'BCG', 'Bain', 'Oliver Wyman', 'L.E.K. Consulting', 'A.T. Kearney'],
    'Consulting (Big 4)': ['Deloitte', 'EY', 'PwC', 'KPMG', 'Accenture', 'RSM', 'Grant Thornton'],
    'Private Equity': ['Blackstone', 'Ares Management', 'Oaktree Capital', 'KKR', 'Carlyle Group', 'Apollo Global Management', 'TPG Capital'],
    'Venture Capital': ['Sequoia Capital', 'a16z', 'Upfront Ventures', 'Greycroft', 'BAM Ventures', 'Mucker Capital'],
    'FinTech': ['Stripe', 'Plaid', 'Affirm', 'Chime', 'Brex', 'Ramp', 'Robinhood', 'Coinbase'],
    'Healthcare': ['McKinsey Health', 'Deloitte', 'Johnson & Johnson', 'CVS Health', 'UnitedHealth', 'Hims & Hers', 'Anthem'],
    'Marketing': ['Disney', 'Snap', 'WPP', 'Spotify', 'Omnicom', 'Publicis', 'Edelman'],
    'Media & Entertainment': ['Disney', 'NBCUniversal', 'Netflix', 'Warner Bros', 'Paramount', 'Hulu', 'Spotify', 'Riot Games'],
  },
  UCLA: {
    'Tech — Startup': ['Snap', 'Roblox', 'GOAT', 'ServiceTitan', 'Whoop', 'Tinder', 'Honey', 'Riot Games'],
    'Tech — Big': ['Google', 'Meta', 'Amazon', 'Apple', 'Microsoft', 'Disney', 'Netflix', 'Snap'],
    'AI / ML': ['Anthropic', 'OpenAI', 'Google', 'Scale AI', 'Meta'],
    'Investment Banking': ['Goldman Sachs', 'Houlihan Lokey', 'Moelis & Company', 'JPMorgan', 'B. Riley', 'Morgan Stanley', 'Centerview Partners'],
    'Consulting (MBB)': ['McKinsey', 'BCG', 'Bain', 'Oliver Wyman', 'L.E.K. Consulting'],
    'Media & Entertainment': ['Disney', 'Netflix', 'NBCUniversal', 'Spotify', 'Warner Bros', 'Hulu'],
  },
  Stanford: {
    'Tech — Startup': ['Stripe', 'Anthropic', 'OpenAI', 'Notion', 'Figma', 'Vercel', 'Linear', 'Ramp', 'Mercury', 'Retool', 'Scale AI'],
    'Tech — Big': ['Google', 'Meta', 'Apple', 'Amazon', 'Microsoft', 'Tesla', 'NVIDIA'],
    'AI / ML': ['OpenAI', 'Anthropic', 'Google', 'Meta', 'Scale AI', 'NVIDIA', 'Apple'],
    'Venture Capital': ['Sequoia Capital', 'a16z', 'Benchmark', 'Accel', 'Greylock Partners', 'Founders Fund', 'Lightspeed'],
    'Investment Banking': ['Goldman Sachs', 'Morgan Stanley', 'JPMorgan', 'Qatalyst Partners', 'Evercore', 'Centerview Partners'],
    'Consulting (MBB)': ['McKinsey', 'BCG', 'Bain', 'Oliver Wyman'],
  },
  Harvard: {
    'Tech — Startup': ['Stripe', 'Notion', 'Anthropic', 'Ramp', 'Mercury', 'Brex'],
    'Investment Banking': ['Goldman Sachs', 'JPMorgan', 'Morgan Stanley', 'Evercore', 'Lazard', 'PJT Partners', 'Centerview Partners'],
    'Private Equity': ['Blackstone', 'KKR', 'Apollo Global Management', 'Carlyle Group', 'Bain Capital', 'TPG Capital', 'Warburg Pincus'],
    'Consulting (MBB)': ['McKinsey', 'BCG', 'Bain', 'Oliver Wyman'],
  },
  MIT: {
    'Tech — Startup': ['Anthropic', 'OpenAI', 'Stripe', 'Notion', 'Scale AI', 'Vercel', 'Databricks'],
    'Tech — Big': ['Google', 'Meta', 'Microsoft', 'Apple', 'NVIDIA', 'Amazon'],
    'AI / ML': ['OpenAI', 'Anthropic', 'Google', 'Scale AI', 'Meta', 'NVIDIA', 'DeepMind'],
    'Quant Trading': ['Two Sigma', 'Citadel', 'Jane Street', 'Hudson River Trading', 'D. E. Shaw', 'Jump Trading', 'Optiver'],
  },
  UPenn: {
    'Tech — Startup': ['Stripe', 'Notion', 'Snap', 'Brex', 'Ramp', 'Datadog'],
    'Investment Banking': ['Goldman Sachs', 'JPMorgan', 'Morgan Stanley', 'Evercore', 'Lazard', 'Centerview Partners', 'PJT Partners'],
    'Consulting (MBB)': ['McKinsey', 'BCG', 'Bain', 'Oliver Wyman'],
    'Private Equity': ['Blackstone', 'KKR', 'Apollo Global Management', 'TPG Capital', 'Bain Capital'],
  },
  'UC Berkeley': {
    'Tech — Startup': ['Stripe', 'Anthropic', 'OpenAI', 'Notion', 'Figma', 'Plaid', 'Linear', 'Vercel', 'Datadog'],
    'Tech — Big': ['Google', 'Apple', 'Meta', 'Amazon', 'Microsoft', 'NVIDIA', 'Adobe'],
    'AI / ML': ['OpenAI', 'Anthropic', 'Google', 'Meta', 'Scale AI'],
  },
  Michigan: {
    'Tech — Startup': ['Stripe', 'Snap', 'Roblox', 'Notion', 'Ramp'],
    'Investment Banking': ['Goldman Sachs', 'JPMorgan', 'Morgan Stanley', 'Lazard', 'Evercore'],
    'Consulting (MBB)': ['McKinsey', 'BCG', 'Bain', 'Oliver Wyman'],
  },
  NYU: {
    'Tech — Startup': ['Datadog', 'Stripe', 'Etsy', 'Snap', 'Peloton', 'WeWork', 'Notion'],
    'Investment Banking': ['Goldman Sachs', 'JPMorgan', 'Morgan Stanley', 'Centerview Partners', 'Evercore', 'Lazard'],
    'Media & Entertainment': ['NBCUniversal', 'Spotify', 'WeWork', 'Disney', 'Bloomberg'],
  },
  // ── International schools ──────────────────────────────────────────────────
  Bocconi: {
    'Investment Banking': ['Mediobanca', 'Rothschild & Co', 'Goldman Sachs', 'JPMorgan', 'Morgan Stanley', 'Lazard', 'UniCredit', 'Intesa Sanpaolo', 'BNP Paribas'],
    'Consulting (MBB)': ['McKinsey', 'BCG', 'Bain', 'Roland Berger', 'Oliver Wyman'],
    'Private Equity': ['Blackstone', 'KKR', 'Carlyle Group', 'CVC Capital', 'Permira'],
    'Tech — Startup': ['Klarna', 'Wise', 'Revolut', 'Booking.com', 'Adyen'],
    'FinTech': ['Stripe', 'Klarna', 'Revolut', 'N26', 'Adyen'],
  },
  LSE: {
    'Investment Banking': ['Goldman Sachs', 'JPMorgan', 'Morgan Stanley', 'Barclays', 'Rothschild & Co', 'Lazard', 'Credit Suisse', 'Deutsche Bank', 'BNP Paribas'],
    'Consulting (MBB)': ['McKinsey', 'BCG', 'Bain', 'Oliver Wyman', 'Roland Berger'],
    'Hedge Funds': ['Citadel', 'Two Sigma', 'Bridgewater', 'Point72', 'Jane Street'],
    'Private Equity': ['Blackstone', 'KKR', 'Apollo Global Management', 'CVC Capital', 'Permira'],
    'Tech — Startup': ['Wise', 'Revolut', 'Monzo', 'Deliveroo', 'Klarna'],
  },
  Oxford: {
    'Investment Banking': ['Goldman Sachs', 'JPMorgan', 'Morgan Stanley', 'Rothschild & Co', 'Lazard'],
    'Consulting (MBB)': ['McKinsey', 'BCG', 'Bain', 'Oliver Wyman'],
    'Tech — Startup': ['DeepMind', 'Anthropic', 'Wise', 'Darktrace', 'Arm'],
    'AI / ML': ['DeepMind', 'Anthropic', 'OpenAI', 'Google', 'Meta'],
  },
  Cambridge: {
    'Investment Banking': ['Goldman Sachs', 'JPMorgan', 'Morgan Stanley', 'Rothschild & Co', 'Lazard'],
    'Consulting (MBB)': ['McKinsey', 'BCG', 'Bain'],
    'Tech — Startup': ['DeepMind', 'Arm', 'Darktrace', 'Wise'],
    'AI / ML': ['DeepMind', 'Anthropic', 'Google', 'Meta'],
  },
  'Imperial College London': {
    'Tech — Startup': ['Stripe', 'Wise', 'Revolut', 'DeepMind', 'Anthropic'],
    'Tech — Big': ['Google', 'Meta', 'Amazon', 'Microsoft', 'Apple'],
    'AI / ML': ['DeepMind', 'Anthropic', 'OpenAI', 'Google'],
    'Investment Banking': ['Goldman Sachs', 'JPMorgan', 'Morgan Stanley', 'Barclays'],
  },
  UCL: {
    'Investment Banking': ['Goldman Sachs', 'JPMorgan', 'Morgan Stanley', 'Barclays'],
    'Consulting (MBB)': ['McKinsey', 'BCG', 'Bain'],
    'Tech — Startup': ['DeepMind', 'Stripe', 'Revolut', 'Wise'],
  },
  'London Business School': {
    'Investment Banking': ['Goldman Sachs', 'JPMorgan', 'Morgan Stanley', 'Rothschild & Co', 'Barclays'],
    'Consulting (MBB)': ['McKinsey', 'BCG', 'Bain'],
    'Private Equity': ['Blackstone', 'KKR', 'CVC Capital', 'Permira'],
    'Hedge Funds': ['Brevan Howard', 'Citadel', 'Bridgewater'],
  },
  'HEC Paris': {
    'Investment Banking': ['BNP Paribas', 'Société Générale', 'Goldman Sachs', 'JPMorgan', 'Lazard', 'Rothschild & Co'],
    'Consulting (MBB)': ['McKinsey', 'BCG', 'Bain', 'Roland Berger', 'Oliver Wyman'],
    'Tech — Startup': ['Mistral AI', 'Doctolib', 'Hugging Face', 'Klarna'],
    'AI / ML': ['Mistral AI', 'Hugging Face', 'Google', 'Meta'],
  },
  INSEAD: {
    'Consulting (MBB)': ['McKinsey', 'BCG', 'Bain', 'Roland Berger'],
    'Investment Banking': ['Goldman Sachs', 'JPMorgan', 'Morgan Stanley', 'Lazard'],
    'Private Equity': ['Blackstone', 'KKR', 'CVC Capital', 'Permira'],
    'Tech — Startup': ['Stripe', 'Anthropic', 'OpenAI', 'Klarna', 'Revolut'],
  },
  ESCP: {
    'Investment Banking': ['BNP Paribas', 'Société Générale', 'JPMorgan', 'Lazard'],
    'Consulting (MBB)': ['McKinsey', 'BCG', 'Bain', 'Roland Berger'],
  },
  ESSEC: {
    'Investment Banking': ['BNP Paribas', 'Société Générale', 'JPMorgan', 'Lazard'],
    'Consulting (MBB)': ['McKinsey', 'BCG', 'Bain'],
  },
  'IE Business School': {
    'Consulting (MBB)': ['McKinsey', 'BCG', 'Bain', 'Roland Berger'],
    'Investment Banking': ['Santander', 'BBVA', 'Goldman Sachs', 'JPMorgan'],
    'Tech — Startup': ['Cabify', 'Glovo', 'Wallapop', 'Klarna'],
  },
  ESADE: {
    'Consulting (MBB)': ['McKinsey', 'BCG', 'Bain', 'Roland Berger'],
    'Investment Banking': ['Santander', 'BBVA', 'Goldman Sachs'],
  },
  IESE: {
    'Consulting (MBB)': ['McKinsey', 'BCG', 'Bain'],
    'Investment Banking': ['Santander', 'BBVA', 'Goldman Sachs', 'JPMorgan'],
  },
  WHU: {
    'Investment Banking': ['Goldman Sachs', 'JPMorgan', 'Deutsche Bank', 'Morgan Stanley'],
    'Consulting (MBB)': ['McKinsey', 'BCG', 'Bain', 'Roland Berger'],
  },
  'ETH Zurich': {
    'Tech — Startup': ['Stripe', 'Anthropic', 'OpenAI', 'Google', 'Meta'],
    'Tech — Big': ['Google', 'Meta', 'Microsoft', 'Apple'],
    'AI / ML': ['DeepMind', 'OpenAI', 'Anthropic', 'Google'],
  },
  IMD: {
    'Consulting (MBB)': ['McKinsey', 'BCG', 'Bain'],
    'Investment Banking': ['Goldman Sachs', 'UBS', 'Credit Suisse', 'JPMorgan'],
  },
  NUS: {
    'Investment Banking': ['Goldman Sachs', 'JPMorgan', 'Morgan Stanley', 'Standard Chartered', 'DBS'],
    'Consulting (MBB)': ['McKinsey', 'BCG', 'Bain'],
    'Tech — Startup': ['Grab', 'Sea Limited', 'Shopee', 'Stripe'],
  },
  HKUST: {
    'Investment Banking': ['Goldman Sachs', 'JPMorgan', 'Morgan Stanley', 'HSBC', 'Standard Chartered'],
    'Consulting (MBB)': ['McKinsey', 'BCG', 'Bain'],
    'Tech — Startup': ['Tencent', 'ByteDance', 'Alibaba'],
  },
  HKU: {
    'Investment Banking': ['Goldman Sachs', 'JPMorgan', 'Morgan Stanley', 'HSBC'],
    'Consulting (MBB)': ['McKinsey', 'BCG', 'Bain'],
  },
  'IIT Bombay': {
    'Tech — Startup': ['Google', 'Meta', 'Microsoft', 'Stripe', 'Anthropic'],
    'Tech — Big': ['Google', 'Meta', 'Microsoft', 'Amazon'],
    'AI / ML': ['Google', 'Meta', 'OpenAI', 'Anthropic', 'NVIDIA'],
    'Quant Trading': ['Two Sigma', 'Citadel', 'Jane Street', 'Hudson River Trading'],
  },
  'IIM Ahmedabad': {
    'Consulting (MBB)': ['McKinsey', 'BCG', 'Bain'],
    'Investment Banking': ['Goldman Sachs', 'JPMorgan', 'Morgan Stanley'],
    'Private Equity': ['Blackstone', 'KKR', 'TPG Capital'],
  },
  'University of Toronto': {
    'Investment Banking': ['Goldman Sachs', 'JPMorgan', 'Morgan Stanley', 'RBC Capital Markets', 'BMO Capital Markets'],
    'Tech — Startup': ['Shopify', 'Stripe', 'Anthropic', 'OpenAI'],
    'Consulting (MBB)': ['McKinsey', 'BCG', 'Bain', 'Deloitte'],
  },
  UBC: {
    'Tech — Startup': ['Stripe', 'Shopify', 'Microsoft', 'Anthropic'],
    'Investment Banking': ['Goldman Sachs', 'RBC Capital Markets', 'BMO Capital Markets'],
  },
  'Western (Ivey)': {
    'Investment Banking': ['Goldman Sachs', 'JPMorgan', 'RBC Capital Markets', 'BMO Capital Markets'],
    'Consulting (MBB)': ['McKinsey', 'BCG', 'Bain'],
  },
};

function getSchoolIndustryFirms(school: string, industry: string): string[] {
  return SCHOOL_INDUSTRY_FIRMS[school]?.[industry] || [];
}

// Generic industry → top firms (no school filter). Used when only industry is
// detected but no school. Maps to industries.ts top_companies via a slug map.
const INDUSTRY_LABEL_TO_SLUG: Record<string, string> = {
  'Investment Banking': 'investment-banking',
  'Private Equity': 'private-equity',
  'Venture Capital': 'venture-capital',
  'Hedge Funds': 'hedge-funds',
  'Quant Trading': 'hedge-funds',
  'Tech — Big': 'tech',
  'Tech — Startup': 'tech',
  'Tech': 'tech',
  'Consulting (MBB)': 'management-consulting',
  'Consulting (Big 4)': 'management-consulting',
  'Consulting (Strategy)': 'management-consulting',
  'AI / ML': 'tech',
  'Developer Tools': 'tech',
  'FinTech': 'fintech',
  'Healthcare': 'healthcare',
  'Marketing': 'marketing',
  'Product Management': 'product-management',
  'Real Estate': 'real-estate',
  'Energy': 'energy',
  'Media & Entertainment': 'media-entertainment',
  'Government / Policy': 'government-policy',
  'Nonprofit': 'nonprofit',
};

// Slug → a display label (first label that maps to each slug).
const SLUG_TO_INDUSTRY_LABEL: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [label, slug] of Object.entries(INDUSTRY_LABEL_TO_SLUG)) {
    if (!out[slug]) out[slug] = label;
  }
  return out;
})();

// All curated roles for an industry slug (flattened from the role-variations
// map, deduped, junior-leaning).
function rolesForIndustrySlug(slug: string): string[] {
  const map = INDUSTRY_ROLE_VARIATIONS[slug];
  if (!map) return [];
  const out: string[] = [];
  for (const arr of Object.values(map)) {
    for (const r of arr) if (!out.includes(r)) out.push(r);
  }
  return out;
}

/**
 * Cross-axis "harmony" suggestions. The four Loop dimensions inform each other:
 * a chosen company implies an industry (and that industry's roles); a chosen
 * industry implies roles + peer companies; a chosen role implies companies. So
 * each list is biased by what the user has already specified (per `analysis`),
 * then by their profile, so picks reinforce one another instead of pulling the
 * Loop in conflicting directions.
 *
 * Returns ordered, deduped candidates (caller filters out anything already in
 * the brief and slices to taste).
 */
export function harmonizedSuggestions(
  analysis: QueryAnalysis,
  profile: { roles: string[]; industries: string[]; firms: string[] },
): { roles: string[]; industries: string[]; companies: string[] } {
  const companyLabel = analysis.company?.value ?? null;
  const industryLabel = analysis.industry?.value ?? null;

  const companySlug = companyLabel ? getCompanyIndustry(companyLabel) : null;
  const industrySlug = industryLabel ? INDUSTRY_LABEL_TO_SLUG[industryLabel] ?? null : null;
  const contextSlug = companySlug ?? industrySlug;

  const dedupePush = (arr: string[], v: string) => {
    if (v && !arr.includes(v)) arr.push(v);
  };

  // ROLES — lead with the roles that fit the company's / industry's world,
  // then the user's profile roles.
  const roles: string[] = [];
  if (contextSlug) for (const r of rolesForIndustrySlug(contextSlug)) dedupePush(roles, r);
  for (const r of profile.roles) dedupePush(roles, r);

  // INDUSTRIES — a chosen company's industry is AUTHORITATIVE: offer only that,
  // so the user can't pair Goldman with a contradicting industry ("Sales / BD").
  // Only fall back to profile industries when no company pins one down.
  const industries: string[] = [];
  if (companySlug && SLUG_TO_INDUSTRY_LABEL[companySlug]) {
    dedupePush(industries, SLUG_TO_INDUSTRY_LABEL[companySlug]);
  } else {
    for (const i of profile.industries) dedupePush(industries, i);
  }

  // COMPANIES — context firms analyzeQuery derived from role/industry, peers of
  // a chosen company, then profile firms.
  const companies: string[] = [];
  for (const f of analysis.roleLocationCompanies?.firms ?? []) dedupePush(companies, f);
  for (const f of analysis.industryFirms?.firms ?? []) dedupePush(companies, f);
  if (companyLabel) for (const f of getCompanyAlternatives(companyLabel)) dedupePush(companies, f);
  for (const f of profile.firms) dedupePush(companies, f);

  return { roles, industries, companies };
}

// ── Vague industry → specific entry-level roles ────────────────────────────
//
// When the user types a broad industry term ("tech", "finance", "marketing"),
// the backend (PDL) can't search effectively — it needs concrete role titles.
// This map drives the Grammarly-style role-variation card to push the user
// toward a specific role they can actually search by.
//
// Example: user types "USC grads in tech" → industry chip lights up "Tech",
// AND the variations card surfaces "Try: Software Engineer · Product Manager
// · Data Scientist · ML Engineer". Clicking one swaps "tech" for the role.

const INDUSTRY_VAGUE_TO_ROLES: Record<string, string[]> = {
  // Generic Tech — most ambiguous; suggest the four most common roles
  'Tech': ['Software Engineer', 'Product Manager', 'Data Scientist', 'ML Engineer'],
  'Tech — Big': ['Software Engineer', 'Product Manager', 'Data Scientist'],
  'Tech — Startup': ['Product Engineer', 'Forward-Deployed Engineer', 'Growth Analyst', 'Software Engineer'],
  'AI / ML': ['ML Engineer', 'Data Scientist', 'Research Engineer', 'AI Product Manager'],
  'Developer Tools': ['Software Engineer', 'Solutions Engineer', 'Developer Advocate', 'Product Manager'],
  // Finance buckets
  'Finance': ['Investment Banking Analyst', 'Financial Analyst', 'Equity Research Analyst', 'Sales and Trading Analyst'],
  'Investment Banking': ['Investment Banking Analyst', 'Investment Banking Associate', 'Equity Research Analyst'],
  'Private Equity': ['Private Equity Analyst', 'Private Equity Associate', 'Investment Analyst'],
  'Venture Capital': ['Venture Capital Analyst', 'Investment Associate', 'Research Analyst'],
  'Hedge Funds': ['Quantitative Analyst', 'Trading Analyst', 'Research Analyst'],
  'Quant Trading': ['Quantitative Researcher', 'Trading Analyst', 'Quantitative Developer'],
  'FinTech': ['Software Engineer', 'Product Manager', 'Strategic Finance Analyst', 'Business Analyst'],
  // Consulting buckets
  'Consulting (MBB)': ['Management Consultant', 'Business Analyst', 'Strategy Consultant'],
  'Consulting (Big 4)': ['Audit Associate', 'Tax Analyst', 'Strategy Consultant'],
  'Consulting (Strategy)': ['Strategy Consultant', 'Strategy Analyst', 'Management Consultant'],
  // Sales / BD
  'Sales / BD': ['Account Executive', 'Sales Development Representative', 'Business Development Analyst'],
  // Marketing
  'Marketing': ['Marketing Analyst', 'Brand Manager', 'Growth Marketing Manager'],
  'Product Management': ['Product Manager', 'Associate Product Manager', 'Technical Product Manager'],
  // Sectors
  'Healthcare': ['Healthcare Consultant', 'Strategy Analyst', 'Operations Analyst'],
  'Real Estate': ['Real Estate Analyst', 'Investment Analyst', 'Acquisitions Associate'],
  'Energy': ['Energy Analyst', 'Operations Analyst', 'Strategy Associate'],
  'Media & Entertainment': ['Business Analyst', 'Marketing Analyst', 'Content Strategy Analyst'],
  'Government / Policy': ['Policy Analyst', 'Research Associate', 'Program Analyst'],
  'Nonprofit': ['Program Analyst', 'Strategy Associate', 'Research Analyst'],
};

function getIndustryRoleSuggestions(industryLabel: string): string[] {
  return INDUSTRY_VAGUE_TO_ROLES[industryLabel] || [];
}

function getIndustryFirms(industryLabel: string): string[] {
  // Tech — Startup deserves its own list since the generic 'tech' top_companies
  // (Google/Meta/Amazon/Apple/Microsoft) are the opposite of startups.
  if (industryLabel === 'Tech — Startup') {
    return ['Stripe', 'Anthropic', 'OpenAI', 'Notion', 'Figma', 'Snap', 'Vercel', 'Linear', 'Ramp', 'Brex'];
  }
  if (industryLabel === 'Tech') {
    // Generic "tech" — mix of big and notable startups so users see a balanced rail
    return ['Google', 'Meta', 'Apple', 'Stripe', 'Anthropic', 'Snap', 'Microsoft', 'Amazon', 'OpenAI', 'NVIDIA'];
  }
  if (industryLabel === 'AI / ML') {
    return ['OpenAI', 'Anthropic', 'Scale AI', 'Google', 'Meta', 'NVIDIA', 'Snap'];
  }
  if (industryLabel === 'Developer Tools') {
    return ['Stripe', 'GitHub', 'Vercel', 'Linear', 'Datadog', 'MongoDB', 'Cloudflare'];
  }
  const slug = INDUSTRY_LABEL_TO_SLUG[industryLabel];
  if (!slug) return [];
  const ind = INDUSTRIES_DATA.find((i) => i.slug === slug);
  return ind?.top_companies?.slice(0, 8) || [];
}

function getTopFirmsForRole(roleLabel: string): { industry: string; firms: string[] } | null {
  const slug = ROLE_TO_INDUSTRY_SLUG[roleLabel];
  if (!slug) return null;
  const industry = INDUSTRIES_DATA.find((i) => i.slug === slug);
  if (!industry || !industry.top_companies?.length) return null;
  return { industry: industry.name, firms: industry.top_companies.slice(0, 4) };
}

// ── Role → top hiring locations ──────────────────────────────────────────────

const ROLE_TO_TOP_LOCATIONS: Record<string, string[]> = {
  // Finance / banking / buy-side
  'Finance': ['New York, NY', 'London', 'Chicago, IL', 'Hong Kong'],
  'Investment Banking': ['New York, NY', 'London', 'Hong Kong', 'San Francisco, CA'],
  'Investment Banking Analyst': ['New York, NY', 'London', 'Hong Kong'],
  'Investment Banking Associate': ['New York, NY', 'London', 'Hong Kong'],
  'Banker': ['New York, NY', 'London', 'Hong Kong'],
  'Financial Analyst': ['New York, NY', 'Chicago, IL', 'San Francisco, CA'],
  'Equity Research': ['New York, NY', 'London', 'San Francisco, CA'],
  'Trader': ['New York, NY', 'Chicago, IL', 'London'],
  'Quantitative Analyst': ['New York, NY', 'Chicago, IL', 'San Francisco, CA'],
  'Quantitative Researcher': ['New York, NY', 'Chicago, IL'],
  'Hedge Fund': ['New York, NY', 'Greenwich, CT', 'London'],
  'Private Equity': ['New York, NY', 'San Francisco, CA', 'London'],
  'Venture Capital': ['San Francisco, CA', 'New York, NY', 'Boston, MA'],
  // Consulting
  'Management Consulting': ['New York, NY', 'Boston, MA', 'Chicago, IL', 'Washington, DC'],
  'Consultant': ['New York, NY', 'Chicago, IL', 'Boston, MA', 'Washington, DC'],
  'Business Analyst': ['New York, NY', 'Chicago, IL', 'San Francisco, CA'],
  'Strategist': ['New York, NY', 'San Francisco, CA', 'Boston, MA'],
  // Tech
  'Software Engineer': ['San Francisco, CA', 'Seattle, WA', 'New York, NY', 'Austin, TX'],
  'Engineer': ['San Francisco, CA', 'Seattle, WA', 'New York, NY'],
  'ML Engineer': ['San Francisco, CA', 'Seattle, WA', 'New York, NY'],
  'Data Scientist': ['San Francisco, CA', 'Seattle, WA', 'New York, NY'],
  'Product Manager': ['San Francisco, CA', 'Seattle, WA', 'New York, NY'],
  'UX Designer': ['San Francisco, CA', 'New York, NY', 'Los Angeles, CA'],
  'Designer': ['San Francisco, CA', 'New York, NY', 'Los Angeles, CA'],
  // Marketing & media
  'Marketing': ['New York, NY', 'San Francisco, CA', 'Los Angeles, CA'],
  // Other
  'Attorney': ['New York, NY', 'Washington, DC', 'San Francisco, CA'],
  'Accountant': ['New York, NY', 'Chicago, IL', 'Los Angeles, CA'],
  'Recruiter': ['San Francisco, CA', 'New York, NY', 'Austin, TX'],
  'Founder': ['San Francisco, CA', 'New York, NY', 'Austin, TX'],
  'CEO': ['San Francisco, CA', 'New York, NY'],
  'CTO': ['San Francisco, CA', 'New York, NY', 'Seattle, WA'],
  'CFO': ['New York, NY', 'San Francisco, CA'],
};

function getTopLocationsForRole(roleLabel: string): { roleLabel: string; locations: string[] } | null {
  const list = ROLE_TO_TOP_LOCATIONS[roleLabel];
  if (!list || list.length === 0) return null;
  return { roleLabel, locations: list.slice(0, 4) };
}

// ── School canonical expansion ───────────────────────────────────────────────
//
// Frontend chips display the short label ("USC", "UCLA"). Acronyms are inherently
// ambiguous to PDL (USC vs University of South Carolina, UT vs University of Texas
// vs Tennessee, UCSC vs UC Santa Cruz vs UC Santa Barbara, etc.). When sending
// the prompt to the backend, expand to the full official name so PDL's school
// matcher hits the right institution every time.

const SCHOOL_CANONICAL: Record<string, string> = {
  'USC': 'University of Southern California',
  'UCLA': 'University of California, Los Angeles',
  'NYU': 'New York University',
  'MIT': 'Massachusetts Institute of Technology',
  'UPenn': 'University of Pennsylvania',
  'UC Berkeley': 'University of California, Berkeley',
  'Stanford': 'Stanford University',
  'Harvard': 'Harvard University',
  'Yale': 'Yale University',
  'Princeton': 'Princeton University',
  'Columbia': 'Columbia University',
  'Cornell': 'Cornell University',
  'Dartmouth': 'Dartmouth College',
  'Brown': 'Brown University',
  'Michigan': 'University of Michigan',
  'Northwestern': 'Northwestern University',
  'Duke': 'Duke University',
  'Georgetown': 'Georgetown University',
  'CMU': 'Carnegie Mellon University',
  'GW': 'George Washington University',
  'Notre Dame': 'University of Notre Dame',
  'Emory': 'Emory University',
  'Vanderbilt': 'Vanderbilt University',
  'Rice': 'Rice University',
  'Johns Hopkins': 'Johns Hopkins University',
  'UC San Diego': 'University of California, San Diego',
  'UC Santa Barbara': 'University of California, Santa Barbara',
  'UT Austin': 'University of Texas at Austin',
  'Boston University': 'Boston University',
  'Boston College': 'Boston College',
  // US — additional
  'UC Irvine': 'University of California, Irvine',
  'UC Santa Cruz': 'University of California, Santa Cruz',
  'UC Riverside': 'University of California, Riverside',
  'UC Davis': 'University of California, Davis',
  'University of Louisville': 'University of Louisville',
  'University of Central Florida': 'University of Central Florida',
  'Florida State': 'Florida State University',
  'Arizona State': 'Arizona State University',
  'Indiana University': 'Indiana University Bloomington',
  'Texas A&M': 'Texas A&M University',
  'Ohio State': 'Ohio State University',
  'Penn State': 'Pennsylvania State University',
  'Villanova': 'Villanova University',
  // International — UK
  'LSE': 'London School of Economics',
  'Oxford': 'University of Oxford',
  'Cambridge': 'University of Cambridge',
  'Imperial College London': 'Imperial College London',
  'UCL': 'University College London',
  "King's College London": "King's College London",
  'Warwick': 'University of Warwick',
  'London Business School': 'London Business School',
  // International — Italy
  'Bocconi': 'Bocconi University',
  'Politecnico di Milano': 'Politecnico di Milano',
  'LUISS': 'LUISS Guido Carli',
  // International — France
  'HEC Paris': 'HEC Paris',
  'INSEAD': 'INSEAD',
  'ESCP': 'ESCP Business School',
  'ESSEC': 'ESSEC Business School',
  'Sciences Po': 'Sciences Po',
  // International — Spain
  'IE Business School': 'IE Business School',
  'ESADE': 'ESADE Business School',
  'IESE': 'IESE Business School',
  // International — Germany
  'WHU': 'WHU - Otto Beisheim School of Management',
  'ESMT Berlin': 'ESMT Berlin',
  'Mannheim': 'University of Mannheim',
  'RWTH Aachen': 'RWTH Aachen University',
  'TU Munich': 'Technical University of Munich',
  // International — Switzerland
  'ETH Zurich': 'ETH Zurich',
  'EPFL': 'École Polytechnique Fédérale de Lausanne',
  'IMD': 'IMD Business School',
  'University of St. Gallen': 'University of St. Gallen',
  // International — Netherlands
  'RSM Erasmus': 'Rotterdam School of Management',
  'Erasmus University': 'Erasmus University Rotterdam',
  // International — Nordics & Ireland
  'Stockholm School of Economics': 'Stockholm School of Economics',
  'KTH Stockholm': 'KTH Royal Institute of Technology',
  'Copenhagen Business School': 'Copenhagen Business School',
  'Trinity College Dublin': 'Trinity College Dublin',
  // International — Asia
  'NUS': 'National University of Singapore',
  'NTU': 'Nanyang Technological University',
  'HKUST': 'Hong Kong University of Science and Technology',
  'HKU': 'University of Hong Kong',
  'CUHK': 'Chinese University of Hong Kong',
  'IIT Bombay': 'Indian Institute of Technology Bombay',
  'IIT Delhi': 'Indian Institute of Technology Delhi',
  'IIT Madras': 'Indian Institute of Technology Madras',
  'IIM Ahmedabad': 'Indian Institute of Management Ahmedabad',
  'IIM Bangalore': 'Indian Institute of Management Bangalore',
  'Tsinghua': 'Tsinghua University',
  'Peking University': 'Peking University',
  'University of Tokyo': 'The University of Tokyo',
  'Seoul National University': 'Seoul National University',
  // International — Canada / Australia
  'University of Toronto': 'University of Toronto',
  'UBC': 'University of British Columbia',
  "Queen's University": "Queen's University",
  'Western (Ivey)': 'Western University (Ivey Business School)',
  'University of Melbourne': 'University of Melbourne',
  'University of Sydney': 'University of Sydney',
  'UNSW': 'University of New South Wales',
};

export function getCanonicalSchool(label: string): string {
  return SCHOOL_CANONICAL[label] || label;
}

/**
 * Rewrite the user's raw prompt to use canonical institution names so the
 * backend (PDL) gets unambiguous signal. Expands school acronyms and any
 * additional schools detected in the prompt (transfer / study-abroad cases).
 *
 * Example:
 *   "USC alumni working in finance at Goldman" →
 *   "University of Southern California alumni working in finance at Goldman"
 *
 *   "UCI alumni who transferred to USC" →
 *   "University of California, Irvine alumni who transferred to University of Southern California"
 *
 * Use right before sending the prompt to the search API. The frontend chip
 * keeps showing the short label ("USC") — only the backend payload is expanded.
 */
export function expandQueryForBackend(prompt: string): string {
  const analysis = analyzeQuery(prompt);
  let result = prompt;

  // Helper to apply one expansion safely
  const applyExpansion = (m: DimensionMatch): string => {
    const canonical = m.canonical;
    if (!canonical || canonical.toLowerCase() === m.matched.toLowerCase()) return result;
    const escaped = m.matched.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'i');
    return result.replace(re, canonical);
  };

  if (analysis.school) {
    result = applyExpansion(analysis.school);
  }
  if (analysis.additionalSchools && analysis.additionalSchools.length > 0) {
    for (const extra of analysis.additionalSchools) {
      result = applyExpansion(extra);
    }
  }
  return result;
}

/**
 * Predict a completion for the trailing fragment of the prompt against the dimension
 * lexicons. Used by the input's ghost-text autocomplete (Tab/Right-arrow accepts).
 *
 *   findCompletion("usc alumni in los ange") → "les"
 *   findCompletion("goldman") → " sachs"
 *   findCompletion("usc ") → null   (whitespace at end suppresses)
 *
 * Rules:
 *   - Trailing whitespace → no suggestion (user finished a word).
 *   - Match must start at a word boundary in the input (start-of-input or after whitespace).
 *   - Min 3 chars matched, min 1 char of completion. Avoids noise on short prefixes.
 *   - Longest matching prefix wins; ties broken by lexicon iteration order.
 *   - Token must be ≥ 4 chars total (prevents suggesting completions for ultra-short aliases).
 */
export function findCompletion(
  input: string,
  priorityTokens: string[] = [],
): string | null {
  if (!input) return null;
  if (/\s$/.test(input)) return null;

  const lower = input.toLowerCase();
  // Priority tokens (from the user's profile — target firms, locations, etc.) get
  // checked first so completions for "I want to meet someone at gold..." resolve
  // to the user's actual target firm "goldman sachs" rather than to whichever
  // baseline lexicon entry happens to win lexicographically.
  const allTokens: string[] = [];
  for (const t of priorityTokens) {
    if (typeof t === 'string' && t.length >= 4) allTokens.push(t.toLowerCase());
  }
  for (const e of ROLE_TOKENS) for (const t of e.match) allTokens.push(t);
  for (const e of LOCATION_TOKENS) for (const t of e.match) allTokens.push(t);
  for (const e of COMPANY_ALIASES) for (const t of e.match) allTokens.push(t);
  for (const e of SCHOOL_ALIASES) for (const t of e.match) allTokens.push(t);

  let bestSuggestion: string | null = null;
  let bestPrefixLen = 0;

  for (const token of allTokens) {
    if (token.length < 4) continue;
    const maxLen = Math.min(token.length - 1, lower.length);
    for (let len = maxLen; len >= 3; len--) {
      const prefix = token.slice(0, len);
      if (!lower.endsWith(prefix)) continue;
      const startIdx = lower.length - len;
      if (startIdx !== 0 && !/\s/.test(lower[startIdx - 1])) break;
      if (len > bestPrefixLen) {
        bestPrefixLen = len;
        bestSuggestion = token.slice(len);
      }
      break; // longest match for this token; move to next token
    }
  }

  return bestSuggestion && bestSuggestion.length >= 1 ? bestSuggestion : null;
}

/**
 * Build at most one qualitative nudge for the given analysis.
 *  - 0 detected → generic "try mentioning ..." advisory.
 *  - 1–2 detected and Location missing → location advisory (not clickable).
 *  - 1–2 detected and School missing AND user has a school → school nudge (clickable, appends).
 *  - 3+ detected → null (the user is doing fine).
 */
export function buildNudge(analysis: QueryAnalysis, userSchool: string | null): Nudge | null {
  const detected = [analysis.role, analysis.location, analysis.company, analysis.school]
    .filter((d): d is DimensionMatch => d !== null).length;

  if (detected === 0) {
    return { text: 'Try mentioning a role, company, school, or location', appendOnClick: null };
  }
  if (detected >= 3) return null;

  // 1–2 detected — location takes priority (matches user spec ordering).
  if (!analysis.location) {
    return { text: 'Try adding a location for stronger matches', appendOnClick: null };
  }
  if (!analysis.school && userSchool) {
    return { text: `Try adding ${userSchool} alumni`, appendOnClick: `${userSchool} alumni` };
  }
  return null;
}
