import { prisma } from './prisma';
import { findDuplicatePlayers } from './player-matcher';

/**
 * Merge duplicate players into a single record
 * Keeps the player with the most complete data and merges all related records
 */
export async function mergeDuplicatePlayers(
  playerIds: number[],
  keepPlayerId: number
): Promise<{
  success: boolean;
  mergedCount: number;
  errors: string[];
}> {
  if (playerIds.length < 2) {
    return {
      success: false,
      mergedCount: 0,
      errors: ['Need at least 2 player IDs to merge'],
    };
  }

  if (!playerIds.includes(keepPlayerId)) {
    return {
      success: false,
      mergedCount: 0,
      errors: ['keepPlayerId must be in the playerIds array'],
    };
  }

  const errors: string[] = [];
  let mergedCount = 0;

  try {
    // Get all players to merge
    const players = await prisma.player.findMany({
      where: { id: { in: playerIds } },
    });

    if (players.length !== playerIds.length) {
      return {
        success: false,
        mergedCount: 0,
        errors: ['Some player IDs not found'],
      };
    }

    const keepPlayer = players.find(p => p.id === keepPlayerId);
    if (!keepPlayer) {
      return {
        success: false,
        mergedCount: 0,
        errors: ['Keep player not found'],
      };
    }

    const playersToMerge = players.filter(p => p.id !== keepPlayerId);

    // Use a transaction to ensure data integrity
    await prisma.$transaction(async (tx) => {
      // Determine the best NHL ID to keep (prefer non-negative, non-zero)
      let bestNhlId = keepPlayer.nhlId;
      for (const player of playersToMerge) {
        if (player.nhlId > 0 && (bestNhlId <= 0 || bestNhlId === 0)) {
          bestNhlId = player.nhlId;
        }
      }

      // Update the keep player with the best NHL ID if needed
      if (bestNhlId > 0 && bestNhlId !== keepPlayer.nhlId) {
        // Check if the NHL ID is already taken
        const existing = await tx.player.findUnique({
          where: { nhlId: bestNhlId },
        });
        if (existing && existing.id !== keepPlayerId) {
          // If it's taken by one of the players we're merging, that's fine
          if (!playerIds.includes(existing.id)) {
            errors.push(`NHL ID ${bestNhlId} is already taken by another player`);
            return;
          }
        } else {
          await tx.player.update({
            where: { id: keepPlayerId },
            data: { nhlId: bestNhlId },
          });
        }
      }

      // Merge all related records
      for (const player of playersToMerge) {
        try {
          // Update PlayerStats
          await tx.playerStats.updateMany({
            where: { playerId: player.id },
            data: { playerId: keepPlayerId },
          });

          // Update GameLogs
          await tx.gameLog.updateMany({
            where: { playerId: player.id },
            data: { playerId: keepPlayerId },
          });

          // Update FantasyRoster
          await tx.fantasyRoster.updateMany({
            where: { playerId: player.id },
            data: { playerId: keepPlayerId },
          });

          // Delete the duplicate player
          await tx.player.delete({
            where: { id: player.id },
          });

          mergedCount++;
        } catch (error: any) {
          errors.push(`Error merging player ${player.id}: ${error.message}`);
        }
      }

      // Update the keep player with the most complete data
      const allPlayers = [keepPlayer, ...playersToMerge];
      const bestData = {
        fullName: allPlayers.find(p => p.fullName && p.fullName !== 'Unknown Player')?.fullName || keepPlayer.fullName,
        firstName: allPlayers.find(p => p.firstName && p.firstName !== 'Unknown')?.firstName || keepPlayer.firstName,
        lastName: allPlayers.find(p => p.lastName && p.lastName !== 'Player')?.lastName || keepPlayer.lastName,
        position: allPlayers.find(p => p.position && p.position !== 'N/A')?.position || keepPlayer.position,
        team: allPlayers.find(p => p.team)?.team || keepPlayer.team,
        jerseyNumber: allPlayers.find(p => p.jerseyNumber)?.jerseyNumber || keepPlayer.jerseyNumber,
        height: allPlayers.find(p => p.height)?.height || keepPlayer.height,
        weight: allPlayers.find(p => p.weight)?.weight || keepPlayer.weight,
        birthDate: allPlayers.find(p => p.birthDate)?.birthDate || keepPlayer.birthDate,
        birthCity: allPlayers.find(p => p.birthCity)?.birthCity || keepPlayer.birthCity,
        birthCountry: allPlayers.find(p => p.birthCountry)?.birthCountry || keepPlayer.birthCountry,
        nationality: allPlayers.find(p => p.nationality)?.nationality || keepPlayer.nationality,
        headshot: allPlayers.find(p => p.headshot)?.headshot || keepPlayer.headshot,
        isActive: allPlayers.some(p => p.isActive) || keepPlayer.isActive,
      };

      await tx.player.update({
        where: { id: keepPlayerId },
        data: bestData,
      });
    });

    return {
      success: errors.length === 0,
      mergedCount,
      errors,
    };
  } catch (error: any) {
    return {
      success: false,
      mergedCount,
      errors: [...errors, `Transaction failed: ${error.message}`],
    };
  }
}

/**
 * Find and report all duplicate players
 */
export async function detectAndReportDuplicates(): Promise<{
  duplicates: Array<{
    players: Array<{
      id: number;
      nhlId: number;
      fullName: string;
      firstName: string;
      lastName: string;
      position: string;
      team: string | null;
    }>;
    similarity: number;
    reason: string;
    suggestedKeepId: number;
  }>;
  totalDuplicates: number;
}> {
  const duplicates = await findDuplicatePlayers();

  // For each duplicate group, suggest which player to keep
  const enrichedDuplicates = duplicates.map(group => {
    // Prefer player with:
    // 1. Valid NHL ID (> 0)
    // 2. Most complete data
    // 3. Most recent activity
    const suggestedKeep = group.players.reduce((best, current) => {
      let bestScore = 0;
      let currentScore = 0;

      // NHL ID score (prefer valid IDs)
      if (best.nhlId > 0) bestScore += 10;
      if (current.nhlId > 0) currentScore += 10;

      // Data completeness score
      const bestCompleteness = [
        best.fullName && best.fullName !== 'Unknown Player',
        best.team !== null,
        best.position && best.position !== 'N/A',
      ].filter(Boolean).length;
      const currentCompleteness = [
        current.fullName && current.fullName !== 'Unknown Player',
        current.team !== null,
        current.position && current.position !== 'N/A',
      ].filter(Boolean).length;

      bestScore += bestCompleteness;
      currentScore += currentCompleteness;

      return currentScore > bestScore ? current : best;
    });

    return {
      ...group,
      suggestedKeepId: suggestedKeep.id,
    };
  });

  return {
    duplicates: enrichedDuplicates,
    totalDuplicates: enrichedDuplicates.reduce((sum, group) => sum + group.players.length - 1, 0),
  };
}

