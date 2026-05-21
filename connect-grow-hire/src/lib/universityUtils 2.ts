const UNIVERSITY_SHORT_NAMES: Record<string, string> = {
  'university of southern california': 'USC',
  'usc': 'USC',
  'university of california, los angeles': 'UCLA',
  'ucla': 'UCLA',
  'university of california, berkeley': 'UC Berkeley',
  'uc berkeley': 'UC Berkeley',
  'new york university': 'NYU',
  'nyu': 'NYU',
  'university of michigan': 'Michigan',
  'umich': 'Michigan',
  'university of pennsylvania': 'Penn',
  'upenn': 'Penn',
  'georgetown university': 'Georgetown',
  'stanford university': 'Stanford',
  'stanford': 'Stanford',
  'harvard university': 'Harvard',
  'harvard': 'Harvard',
  'mit': 'MIT',
  'massachusetts institute of technology': 'MIT',
  'cornell university': 'Cornell',
  'columbia university': 'Columbia',
  'duke university': 'Duke',
  'northwestern university': 'Northwestern',
  'university of chicago': 'UChicago',
  'university of texas at austin': 'UT Austin',
  'university of florida': 'UF',
  'university of washington': 'UW',
  'boston university': 'BU',
  'carnegie mellon university': 'CMU',
  'carnegie mellon': 'CMU',
  'vanderbilt university': 'Vanderbilt',
  'emory university': 'Emory',
  'washington university in st. louis': 'WashU',
  'university of notre dame': 'Notre Dame',
  'rice university': 'Rice',
  'tufts university': 'Tufts',
  'university of virginia': 'UVA',
  'uva': 'UVA',
  'georgia institute of technology': 'Georgia Tech',
  'georgia tech': 'Georgia Tech',
  'university of north carolina': 'UNC',
  'unc': 'UNC',
  'purdue university': 'Purdue',
  'ohio state university': 'Ohio State',
  'penn state university': 'Penn State',
  'university of illinois': 'UIUC',
  'uiuc': 'UIUC',
};

/**
 * Returns a short display name for a university.
 * Returns null if the university is unknown - callers should
 * hide any university-specific UI in that case rather than
 * showing a wrong or generic value.
 */
export function getUniversityShortName(university: string | null | undefined): string | null {
  if (!university) return null;
  const normalized = university.toLowerCase().trim();
  for (const [key, short] of Object.entries(UNIVERSITY_SHORT_NAMES)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return short;
    }
  }
  return null;
}

/**
 * Replaces occurrences of "USC" in a string with the user's actual school short name.
 * Returns null if the user's school is unknown - callers should
 * hide the string entirely in that case.
 */
export function personalizeForSchool(
  template: string,
  university: string | null | undefined
): string | null {
  const shortName = getUniversityShortName(university);
  if (!shortName) return null;
  return template.replace(/\bUSC\b/g, shortName);
}

// ── School metadata for personalization ─────────────────────────────

export interface SchoolMeta {
  demonym: string;
  color: string;
  seal: string;
}

const SCHOOL_META: Record<string, SchoolMeta> = {
  'USC':          { demonym: 'Trojans',      color: '#990000', seal: 'SC' },
  'UCLA':         { demonym: 'Bruins',        color: '#2774AE', seal: 'UCLA' },
  'Michigan':     { demonym: 'Wolverines',    color: '#00274C', seal: 'M' },
  'Penn':         { demonym: 'Quakers',       color: '#011F5B', seal: 'P' },
  'Georgetown':   { demonym: 'Hoyas',         color: '#041E42', seal: 'G' },
  'NYU':          { demonym: 'Violets',       color: '#57068C', seal: 'NYU' },
  'Stanford':     { demonym: 'Cardinal',      color: '#8C1515', seal: 'S' },
  'Harvard':      { demonym: 'Crimson',       color: '#A51C30', seal: 'H' },
  'MIT':          { demonym: 'Engineers',     color: '#A31F34', seal: 'MIT' },
  'Cornell':      { demonym: 'Big Red',       color: '#B31B1B', seal: 'C' },
  'Columbia':     { demonym: 'Lions',         color: '#B9D9EB', seal: 'CU' },
  'Duke':         { demonym: 'Blue Devils',   color: '#003087', seal: 'D' },
  'Northwestern': { demonym: 'Wildcats',      color: '#4E2A84', seal: 'N' },
  'UChicago':     { demonym: 'Maroons',       color: '#800000', seal: 'UC' },
  'UT Austin':    { demonym: 'Longhorns',     color: '#BF5700', seal: 'UT' },
  'UC Berkeley':  { demonym: 'Golden Bears',  color: '#003262', seal: 'Cal' },
  'UF':           { demonym: 'Gators',        color: '#0021A5', seal: 'UF' },
  'UW':           { demonym: 'Huskies',       color: '#4B2E83', seal: 'W' },
  'BU':           { demonym: 'Terriers',      color: '#CC0000', seal: 'BU' },
  'CMU':          { demonym: 'Tartans',       color: '#C41230', seal: 'CMU' },
  'Vanderbilt':   { demonym: 'Commodores',    color: '#866D4B', seal: 'V' },
  'Emory':        { demonym: 'Eagles',        color: '#012169', seal: 'E' },
  'WashU':        { demonym: 'Bears',         color: '#A51417', seal: 'WU' },
  'Notre Dame':   { demonym: 'Fighting Irish', color: '#0C2340', seal: 'ND' },
  'Rice':         { demonym: 'Owls',          color: '#00205B', seal: 'R' },
  'UVA':          { demonym: 'Cavaliers',     color: '#232D4B', seal: 'VA' },
  'Georgia Tech': { demonym: 'Yellow Jackets', color: '#B3A369', seal: 'GT' },
  'UNC':          { demonym: 'Tar Heels',     color: '#7BAFD4', seal: 'NC' },
  'Purdue':       { demonym: 'Boilermakers',  color: '#CEB888', seal: 'PU' },
  'Ohio State':   { demonym: 'Buckeyes',      color: '#BB0000', seal: 'OSU' },
  'Penn State':   { demonym: 'Nittany Lions', color: '#041E42', seal: 'PSU' },
  'UIUC':         { demonym: 'Fighting Illini', color: '#E84A27', seal: 'IL' },
};

/**
 * Returns demonym, school color, and seal monogram for a university.
 * Returns null for schools not in the map - callers should fall back
 * to using the school name directly.
 */
export function getSchoolMeta(university: string | null | undefined): SchoolMeta | null {
  const shortName = getUniversityShortName(university);
  if (!shortName) return null;
  return SCHOOL_META[shortName] ?? null;
}
