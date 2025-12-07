import { prisma } from './prisma';

export interface PlayerMatchInput {
  nhlId?: number | null;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  position?: string;
  team?: string | null;
}

export interface PlayerMatchResult {
  player: {
    id: number;
    nhlId: number;
    fullName: string;
    firstName: string;
    lastName: string;
    position: string;
    team: string | null;
  } | null;
  matchType: 'nhlId' | 'name' | 'fuzzy' | 'none';
  confidence: number; // 0-1, where 1 is highest confidence
}

/**
 * Normalize a name for comparison (lowercase, trim, remove extra spaces)
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,'"]/g, '');
}

/**
 * Calculate similarity between two names using Levenshtein distance
 * Returns a score between 0 and 1
 */
function nameSimilarity(name1: string, name2: string): number {
  const normalized1 = normalizeName(name1);
  const normalized2 = normalizeName(name2);

  // Exact match after normalization
  if (normalized1 === normalized2) return 1.0;

  // Check if one name contains the other (for abbreviations)
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
    return 0.8;
  }

  // Calculate Levenshtein distance
  const maxLen = Math.max(normalized1.length, normalized2.length);
  if (maxLen === 0) return 1.0;

  const distance = levenshteinDistance(normalized1, normalized2);
  return 1 - distance / maxLen;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Match a player by NHL ID (highest confidence)
 */
async function matchByNhlId(nhlId: number): Promise<PlayerMatchResult | null> {
  const player = await prisma.player.findUnique({
    where: { nhlId },
  });

  if (player) {
    return {
      player: {
        id: player.id,
        nhlId: player.nhlId,
        fullName: player.fullName,
        firstName: player.firstName,
        lastName: player.lastName,
        position: player.position,
        team: player.team,
      },
      matchType: 'nhlId',
      confidence: 1.0,
    };
  }

  return null;
}

/**
 * Match a player by exact name (high confidence)
 */
async function matchByName(
  fullName: string,
  firstName?: string,
  lastName?: string,
  position?: string
): Promise<PlayerMatchResult | null> {
  const normalizedFullName = normalizeName(fullName);

  // Try exact full name match first
  const exactMatch = await prisma.player.findFirst({
    where: {
      fullName: {
        equals: fullName,
        mode: 'insensitive',
      },
    },
  });

  if (exactMatch) {
    return {
      player: {
        id: exactMatch.id,
        nhlId: exactMatch.nhlId,
        fullName: exactMatch.fullName,
        firstName: exactMatch.firstName,
        lastName: exactMatch.lastName,
        position: exactMatch.position,
        team: exactMatch.team,
      },
      matchType: 'name',
      confidence: 0.95,
    };
  }

  // Try first + last name match
  if (firstName && lastName) {
    const nameMatch = await prisma.player.findFirst({
      where: {
        AND: [
          { firstName: { equals: firstName, mode: 'insensitive' } },
          { lastName: { equals: lastName, mode: 'insensitive' } },
        ],
      },
    });

    if (nameMatch) {
      // If position matches, increase confidence
      const positionMatch = !position || nameMatch.position === position;
      return {
        player: {
          id: nameMatch.id,
          nhlId: nameMatch.nhlId,
          fullName: nameMatch.fullName,
          firstName: nameMatch.firstName,
          lastName: nameMatch.lastName,
          position: nameMatch.position,
          team: nameMatch.team,
        },
        matchType: 'name',
        confidence: positionMatch ? 0.9 : 0.7,
      };
    }
  }

  return null;
}

/**
 * Match a player using fuzzy name matching (lower confidence)
 */
async function matchByFuzzyName(
  fullName: string,
  firstName?: string,
  lastName?: string,
  position?: string,
  minSimilarity: number = 0.85
): Promise<PlayerMatchResult | null> {
  // Get all players to compare (could be optimized with better indexing)
  const candidates = await prisma.player.findMany({
    where: {
      // Filter by position if provided to reduce candidates
      ...(position ? { position } : {}),
    },
    take: 1000, // Limit to prevent performance issues
  });

  let bestMatch: PlayerMatchResult | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    // Compare full names
    const fullNameScore = nameSimilarity(fullName, candidate.fullName);

    // Compare first + last if available
    let nameScore = fullNameScore;
    if (firstName && lastName) {
      const firstNameScore = nameSimilarity(firstName, candidate.firstName);
      const lastNameScore = nameSimilarity(lastName, candidate.lastName);
      const combinedScore = (firstNameScore + lastNameScore) / 2;
      nameScore = Math.max(fullNameScore, combinedScore);
    }

    // Boost score if position matches
    const positionBonus = position && candidate.position === position ? 0.1 : 0;
    const totalScore = Math.min(1.0, nameScore + positionBonus);

    if (totalScore >= minSimilarity && totalScore > bestScore) {
      bestScore = totalScore;
      bestMatch = {
        player: {
          id: candidate.id,
          nhlId: candidate.nhlId,
          fullName: candidate.fullName,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          position: candidate.position,
          team: candidate.team,
        },
        matchType: 'fuzzy',
        confidence: totalScore,
      };
    }
  }

  return bestMatch;
}

/**
 * Main function to find or match a player
 * Uses a cascading approach: NHL ID → Exact Name → Fuzzy Name
 */
export async function findOrMatchPlayer(
  input: PlayerMatchInput
): Promise<PlayerMatchResult> {
  // Priority 1: Match by NHL ID (highest confidence)
  if (input.nhlId && input.nhlId > 0) {
    const nhlIdMatch = await matchByNhlId(input.nhlId);
    if (nhlIdMatch) {
      return nhlIdMatch;
    }
  }

  // Priority 2: Match by exact name
  if (input.fullName) {
    const nameMatch = await matchByName(
      input.fullName,
      input.firstName,
      input.lastName,
      input.position
    );
    if (nameMatch && nameMatch.confidence >= 0.9) {
      return nameMatch;
    }
  }

  // Priority 3: Fuzzy name matching (only if we have a name)
  if (input.fullName) {
    const fuzzyMatch = await matchByFuzzyName(
      input.fullName,
      input.firstName,
      input.lastName,
      input.position
    );
    if (fuzzyMatch) {
      return fuzzyMatch;
    }
  }

  // No match found
  return {
    player: null,
    matchType: 'none',
    confidence: 0,
  };
}

/**
 * Ensure a player exists in the database, creating if necessary
 * Returns the database player ID
 */
export async function ensurePlayerExists(
  input: PlayerMatchInput & {
    jerseyNumber?: number | null;
    height?: string | null;
    weight?: number | null;
    birthDate?: Date | null;
    birthCity?: string | null;
    birthCountry?: string | null;
    nationality?: string | null;
    headshot?: string | null;
    isActive?: boolean;
  }
): Promise<{ id: number; created: boolean; matched: boolean }> {
  // First, try to find existing player
  const match = await findOrMatchPlayer(input);

  if (match.player && match.confidence >= 0.85) {
    // Update existing player if we have new information
    const updated = await prisma.player.update({
      where: { id: match.player.id },
      data: {
        // Only update if we have new, non-null values
        ...(input.fullName && { fullName: input.fullName }),
        ...(input.firstName && { firstName: input.firstName }),
        ...(input.lastName && { lastName: input.lastName }),
        ...(input.position && { position: input.position }),
        ...(input.team !== undefined && { team: input.team }),
        ...(input.jerseyNumber !== undefined && { jerseyNumber: input.jerseyNumber }),
        ...(input.height !== undefined && { height: input.height }),
        ...(input.weight !== undefined && { weight: input.weight }),
        ...(input.birthDate !== undefined && { birthDate: input.birthDate }),
        ...(input.birthCity !== undefined && { birthCity: input.birthCity }),
        ...(input.birthCountry !== undefined && { birthCountry: input.birthCountry }),
        ...(input.nationality !== undefined && { nationality: input.nationality }),
        ...(input.headshot !== undefined && { headshot: input.headshot }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        // Update NHL ID if we have one and it's missing
        ...(input.nhlId && !match.player.nhlId && { nhlId: input.nhlId }),
      },
    });

    return {
      id: updated.id,
      created: false,
      matched: match.confidence >= 0.9,
    };
  }

  // Create new player if no good match found
  if (!input.fullName) {
    throw new Error('Cannot create player without fullName');
  }

  const nameParts = input.fullName.trim().split(' ').filter(Boolean);
  const firstName = input.firstName || nameParts[0] || 'Unknown';
  const lastName = input.lastName || nameParts.slice(1).join(' ') || firstName;

  // Generate a temporary negative NHL ID if none provided (will need to be updated later)
  // This allows us to create players without NHL IDs while maintaining uniqueness
  if (!input.nhlId || input.nhlId <= 0) {
    // Find the lowest negative ID to use
    const existingNegativeIds = await prisma.player.findMany({
      where: { nhlId: { lt: 0 } },
      select: { nhlId: true },
      orderBy: { nhlId: 'asc' },
      take: 1,
    });
    
    const baseNegativeId = existingNegativeIds.length > 0 
      ? existingNegativeIds[0].nhlId - 1 
      : -1;
    
    input.nhlId = baseNegativeId;
  }

  const newPlayer = await prisma.player.create({
    data: {
      nhlId: input.nhlId,
      firstName,
      lastName,
      fullName: input.fullName,
      position: input.position || 'N/A',
      team: input.team || null,
      jerseyNumber: input.jerseyNumber || null,
      height: input.height || null,
      weight: input.weight || null,
      birthDate: input.birthDate || null,
      birthCity: input.birthCity || null,
      birthCountry: input.birthCountry || null,
      nationality: input.nationality || null,
      headshot: input.headshot || null,
      isActive: input.isActive !== undefined ? input.isActive : true,
    },
  });

  return {
    id: newPlayer.id,
    created: true,
    matched: false,
  };
}

/**
 * Find potential duplicate players in the database
 */
export async function findDuplicatePlayers(): Promise<
  Array<{
    players: Array<{
      id: number;
      nhlId: number;
      fullName: string;
      firstName: string;
      lastName: string;
      position: string;
    }>;
    similarity: number;
    reason: string;
  }>
> {
  const allPlayers = await prisma.player.findMany({
    select: {
      id: true,
      nhlId: true,
      fullName: true,
      firstName: true,
      lastName: true,
      position: true,
    },
  });

  const duplicates: Array<{
    players: Array<{
      id: number;
      nhlId: number;
      fullName: string;
      firstName: string;
      lastName: string;
      position: string;
    }>;
    similarity: number;
    reason: string;
  }> = [];

  const processed = new Set<number>();

  for (let i = 0; i < allPlayers.length; i++) {
    if (processed.has(allPlayers[i].id)) continue;

    const player1 = allPlayers[i];
    const group = [player1];
    let maxSimilarity = 0;
    let reason = '';

    for (let j = i + 1; j < allPlayers.length; j++) {
      if (processed.has(allPlayers[j].id)) continue;

      const player2 = allPlayers[j];

      // Check for same NHL ID (shouldn't happen due to unique constraint, but check anyway)
      if (player1.nhlId > 0 && player2.nhlId > 0 && player1.nhlId === player2.nhlId) {
        group.push(player2);
        processed.add(player2.id);
        maxSimilarity = 1.0;
        reason = 'Same NHL ID';
        continue;
      }

      // Check name similarity
      const similarity = nameSimilarity(player1.fullName, player2.fullName);
      if (similarity >= 0.9 && player1.position === player2.position) {
        group.push(player2);
        processed.add(player2.id);
        maxSimilarity = Math.max(maxSimilarity, similarity);
        reason = `Similar name (${Math.round(similarity * 100)}%) and same position`;
      }
    }

    if (group.length > 1) {
      duplicates.push({
        players: group,
        similarity: maxSimilarity,
        reason,
      });
      group.forEach(p => processed.add(p.id));
    }
  }

  return duplicates;
}

