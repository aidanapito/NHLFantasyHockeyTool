/**
 * Team Name Mapping
 * 
 * Maps between fantasy team abbreviations and full team names.
 * This is league-specific and may need to be updated for different leagues.
 */

/**
 * Mapping from full team names to abbreviations
 */
export const TEAM_NAME_TO_ABBREV: Record<string, string> = {
  'On the Hutson': 'Dady',
  'No Longer Boeser than You': 'Mama',
  'Yee Haw (screaming)': 'YH',
  'Yee Haw': 'YH',
  "Theo's Thrashers": 'MASH',
  'Bros Before Hossas': 'Bros',
  'Colonel Klink': 'KLNK',
  "Spoked B's": 'KLUC',
  'Buds 4 Ever!': 'Buds',
  'Buds 4 ever': 'Buds',
  "Stacy's Basketball Team": 'MAC',
  'Stacys Basketball Team': 'MAC',
  'Hockey Team': 'CBS',
}

/**
 * Reverse mapping: abbreviation to full name
 */
export const ABBREV_TO_FULL_NAME: Record<string, string> = {}
Object.entries(TEAM_NAME_TO_ABBREV).forEach(([fullName, abbrev]) => {
  ABBREV_TO_FULL_NAME[abbrev.toUpperCase()] = fullName
})

/**
 * Convert team abbreviation to full name
 */
export function abbrevToFullName(abbrev: string): string | null {
  return ABBREV_TO_FULL_NAME[abbrev.toUpperCase()] || null
}

/**
 * Convert full team name to abbreviation
 */
export function fullNameToAbbrev(fullName: string): string | null {
  return TEAM_NAME_TO_ABBREV[fullName] || null
}

/**
 * Try to match a team name (could be either abbrev or full name) to the full name
 */
export function normalizeTeamName(teamName: string): string {
  // First check if it's already a full name
  if (TEAM_NAME_TO_ABBREV[teamName]) {
    return teamName
  }
  
  // Check if it's an abbreviation
  const fullName = ABBREV_TO_FULL_NAME[teamName.toUpperCase()]
  if (fullName) {
    return fullName
  }
  
  // Return as-is if no mapping found
  return teamName
}

