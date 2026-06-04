/**
 * Supplementary dream-company names for the onboarding autocomplete.
 *
 * The rich, curated dataset lives in `companies.ts` (used by company pages,
 * comparisons, recommendations, etc.). This is a flat name-only list that only
 * widens the autocomplete's free-text search pool — it does NOT feed those other
 * features. Overlaps with companies.ts are fine; the autocomplete dedupes by
 * lowercased name.
 */

export const EXTRA_DREAM_COMPANIES: string[] = [
  // ── Banks & Investment Banking (bulge, boutique, middle-market) ──
  "Wells Fargo", "UBS", "RBC Capital Markets", "BMO Capital Markets", "Scotiabank",
  "TD Securities", "Mizuho", "Nomura", "MUFG", "SMBC", "Societe Generale", "BNP Paribas",
  "HSBC", "Standard Chartered", "Jefferies", "Houlihan Lokey", "Moelis & Company",
  "PJT Partners", "Centerview Partners", "Perella Weinberg Partners", "Greenhill",
  "Guggenheim Partners", "Rothschild & Co", "Qatalyst Partners", "Allen & Company",
  "LionTree", "Robey Warshaw", "Raine Group", "Ducera Partners", "Solomon Partners",
  "Union Square Advisors", "FT Partners", "Harris Williams", "Lincoln International",
  "William Blair", "Robert W. Baird", "Piper Sandler", "TD Cowen", "Stifel",
  "Raymond James", "Truist Securities", "Needham & Company", "Canaccord Genuity",
  "Oppenheimer", "BTIG", "KeyBanc Capital Markets", "Stephens", "Brown Brothers Harriman",
  "Wedbush Securities", "Leerink Partners", "Sandler O'Neill",

  // ── Private Equity & Growth ──
  "Bain Capital", "Vista Equity Partners", "Thoma Bravo", "Silver Lake",
  "Advent International", "Hellman & Friedman", "Leonard Green & Partners",
  "Clayton Dubilier & Rice", "General Atlantic", "Permira", "CVC Capital Partners",
  "EQT Partners", "Cinven", "Bridgepoint", "Ares Management", "Oaktree Capital Management",
  "Sixth Street", "Golub Capital", "Audax Group", "Berkshire Partners", "Genstar Capital",
  "Roark Capital", "Stone Point Capital", "GTCR", "Madison Dearborn Partners",
  "New Mountain Capital", "Insight Partners", "Thomas H. Lee Partners", "Francisco Partners",
  "Platinum Equity", "American Securities", "Clearlake Capital", "L Catterton",
  "Brookfield Asset Management", "Partners Group", "Vibrant Capital", "H.I.G. Capital",

  // ── Venture Capital ──
  "Tiger Global Management", "Coatue Management", "General Catalyst",
  "Lightspeed Venture Partners", "Bessemer Venture Partners", "Index Ventures",
  "Founders Fund", "Khosla Ventures", "New Enterprise Associates", "Battery Ventures",
  "Thrive Capital", "Spark Capital", "GV", "Kleiner Perkins", "Greylock Partners",
  "IVP", "Menlo Ventures", "Redpoint Ventures", "Social Capital", "First Round Capital",
  "Initialized Capital", "Craft Ventures", "8VC", "Ribbit Capital", "Dragoneer Investment Group",
  "D1 Capital Partners", "Insight Venture Partners", "Bond Capital", "Felicis Ventures",

  // ── Hedge Funds, Asset Management & Trading ──
  "BlackRock", "The Vanguard Group", "Fidelity Investments", "State Street", "PIMCO",
  "T. Rowe Price", "Wellington Management", "Capital Group", "Invesco",
  "Millennium Management", "Balyasny Asset Management", "ExodusPoint Capital",
  "Schonfeld Strategic Advisors", "Marshall Wace", "AQR Capital Management",
  "Renaissance Technologies", "D.E. Shaw & Co.", "Elliott Management", "Pershing Square Capital",
  "Third Point", "Baupost Group", "Lone Pine Capital", "Viking Global Investors",
  "Tudor Investment Corporation", "Brevan Howard", "Man Group", "Davidson Kempner Capital",
  "Farallon Capital", "Susquehanna International Group", "Hudson River Trading", "Optiver",
  "IMC Trading", "Jump Trading", "DRW", "Flow Traders", "Akuna Capital", "Five Rings",
  "Old Mission Capital", "Tower Research Capital", "Virtu Financial", "Wolverine Trading",

  // ── Consulting & Advisory ──
  "Kearney", "Roland Berger", "Strategy&", "Monitor Deloitte", "EY-Parthenon",
  "PwC", "KPMG", "Capgemini", "IBM Consulting", "ZS Associates", "Analysis Group",
  "Cornerstone Research", "NERA Economic Consulting", "Charles River Associates",
  "Bates White", "Simon-Kucher & Partners", "Alvarez & Marsal", "FTI Consulting",
  "AlixPartners", "Huron Consulting", "Cognizant", "Infosys", "Gartner", "Forrester",
  "Slalom", "West Monroe", "Guidehouse", "Putnam Associates", "Kaiser Associates",
  "Bridgespan Group", "Marakon", "Parthenon Group",

  // ── Big Tech & Enterprise Software ──
  "Nvidia", "Adobe", "Intel", "Oracle", "IBM", "Cisco", "Qualcomm", "Broadcom", "AMD",
  "Texas Instruments", "Dell Technologies", "HP", "VMware", "ServiceNow", "Workday",
  "Atlassian", "Twilio", "Datadog", "Cloudflare", "MongoDB", "Okta", "Zscaler",
  "CrowdStrike", "Palo Alto Networks", "Fortinet", "Splunk", "Elastic", "HashiCorp",
  "GitLab", "GitHub", "Asana", "Notion", "Figma", "Canva", "Airtable", "Miro", "Linear",
  "Confluent", "dbt Labs", "Fivetran", "Airbyte", "Segment", "Amplitude", "Mixpanel",

  // ── Fintech, Startups & Unicorns ──
  "Ramp", "Brex", "Plaid", "Chime", "Robinhood", "Coinbase", "Block", "PayPal", "Affirm",
  "SoFi", "Marqeta", "Toast", "Instacart", "DoorDash", "Lyft", "Pinterest", "Snap",
  "Reddit", "Discord", "Spotify", "Shopify", "Squarespace", "Wix", "Dropbox", "Box",
  "Zoom", "Slack", "Twitch", "Roblox", "Unity", "Epic Games", "Riot Games",
  "Activision Blizzard", "Electronic Arts", "ByteDance", "TikTok", "Rivian", "Lucid Motors",
  "Waymo", "Cruise", "Scale AI", "Anduril Industries", "Samsara", "Rippling", "Gusto",
  "Carta", "Deel", "Mercury", "Vanta", "Retool", "Vercel", "Replit", "Cohere",
  "Hugging Face", "Mistral AI", "Perplexity AI", "Character.AI", "Anysphere", "Glean",

  // ── Consumer, CPG & Retail ──
  "Procter & Gamble", "Unilever", "Nestle", "PepsiCo", "The Coca-Cola Company",
  "Johnson & Johnson", "Colgate-Palmolive", "Kimberly-Clark", "General Mills",
  "Kellanova", "Mondelez International", "Mars", "Kraft Heinz", "The Estee Lauder Companies",
  "L'Oreal", "Nike", "Adidas", "Lululemon", "LVMH", "Walmart", "Target", "Costco",
  "The Kroger Co.", "The Home Depot", "Lowe's", "Best Buy", "Walgreens", "McDonald's",
  "Starbucks", "Chipotle", "Yum! Brands", "The Walt Disney Company",
  "Warner Bros. Discovery", "Comcast", "NBCUniversal", "Paramount", "Sony", "Live Nation",

  // ── Healthcare, Pharma & Biotech ──
  "Pfizer", "Moderna", "Merck", "AbbVie", "Bristol Myers Squibb", "Eli Lilly", "Novartis",
  "Roche", "AstraZeneca", "GSK", "Sanofi", "Amgen", "Gilead Sciences", "Biogen",
  "Regeneron", "Vertex Pharmaceuticals", "Genentech", "UnitedHealth Group", "Cigna",
  "Humana", "Elevance Health", "Kaiser Permanente", "HCA Healthcare", "Medtronic",
  "Abbott Laboratories", "Stryker", "Boston Scientific", "Intuitive Surgical",
  "Becton Dickinson", "Thermo Fisher Scientific", "Danaher", "IQVIA", "McKesson",
  "Cardinal Health", "Tempus", "Flatiron Health", "Oscar Health", "Devoted Health",

  // ── Energy & Industrials ──
  "ExxonMobil", "Chevron", "Shell", "BP", "ConocoPhillips", "Schlumberger", "Halliburton",
  "NextEra Energy", "Duke Energy", "General Electric", "GE Vernova", "Siemens",
  "Honeywell", "Caterpillar", "Deere & Company", "3M", "Emerson Electric", "Eaton",
  "Parker Hannifin", "Illinois Tool Works", "Cummins", "First Solar", "Enphase Energy",
  "Sunrun", "Bloom Energy", "Constellation Energy",

  // ── Aerospace & Defense ──
  "Lockheed Martin", "Boeing", "RTX", "Northrop Grumman", "General Dynamics", "BAE Systems",
  "L3Harris Technologies", "Leidos", "SAIC", "Airbus", "Pratt & Whitney", "Collins Aerospace",

  // ── Automotive ──
  "Ford Motor Company", "General Motors", "Toyota", "Honda", "Volkswagen", "BMW",
  "Mercedes-Benz", "Stellantis", "Hyundai", "Ferrari",

  // ── Real Estate ──
  "CBRE", "JLL", "Cushman & Wakefield", "Hines", "Related Companies", "Tishman Speyer",
  "Brookfield Properties", "Prologis", "Simon Property Group", "Starwood Capital Group",
  "Greystar", "Boston Properties",

  // ── Law Firms ──
  "Cravath, Swaine & Moore", "Wachtell, Lipton, Rosen & Katz", "Sullivan & Cromwell",
  "Skadden", "Latham & Watkins", "Kirkland & Ellis", "Davis Polk & Wardwell",
  "Simpson Thacher & Bartlett", "Paul, Weiss", "Sidley Austin", "Gibson Dunn",
  "Cleary Gottlieb", "Weil, Gotshal & Manges", "White & Case", "Jones Day",

  // ── Accounting ──
  "Grant Thornton", "BDO", "RSM US",

  // ── Payments, Cards & Financial Services ──
  "American Express", "Mastercard", "Visa", "Capital One", "Discover Financial Services",
  "Synchrony", "Fiserv", "FIS", "Global Payments", "Charles Schwab", "Nasdaq",
  "Intercontinental Exchange", "CME Group", "S&P Global", "Moody's", "MSCI", "FactSet",
  "Bloomberg",

  // ── Telecom ──
  "AT&T", "Verizon", "T-Mobile", "Charter Communications",

  // ── Public Sector & Nonprofit ──
  "Federal Reserve", "World Bank", "International Monetary Fund", "United Nations",
  "Teach For America", "Peace Corps",
];
