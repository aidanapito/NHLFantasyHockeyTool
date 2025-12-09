import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { prisma } from '@/lib/prisma'

function getCurrentSeason(): string {
  const now = new Date()
  const year = now.getUTCFullYear()
  // NHL seasons span two years, encode as YYYYYYYY like 20252026
  const start = now.getUTCMonth() >= 6 ? year : year - 1
  const end = start + 1
  return `${start}${end}`
}

function convertEspnSeasonToDbSeason(espnSeason: string | undefined | null): string {
  // ESPN uses format like "2026" which refers to the 2025-2026 season
  // Database uses "20252026" format (start year + end year)
  if (!espnSeason) {
    return getCurrentSeason()
  }
  // If already in database format (8 digits), return as-is
  if (espnSeason.length === 8) {
    return espnSeason
  }
  // Convert from ESPN format (4 digits) to database format
  // ESPN "2026" means the season ending in 2026, which is 2025-2026
  if (espnSeason.length === 4) {
    const endYear = parseInt(espnSeason)
    const startYear = endYear - 1
    return `${startYear}${endYear}`
  }
  // Fallback to current season
  return getCurrentSeason()
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const teamId = params.id
    const searchParams = request.nextUrl.searchParams
    const leagueIdFilter = searchParams.get('leagueId') || undefined
    const seasonParam = searchParams.get('season') || undefined

    let team = await prisma.fantasyTeam.findUnique({
      where: { id: teamId },
      include: {
        league: true,
        roster: {
          include: {
            player: {
              select: {
                id: true,           // Database ID (used by PlayerStats)
                nhlId: true,         // NHL ID (used by FantasyRoster.playerId)
                fullName: true,
                position: true,
                team: true,
              },
            },
          },
          orderBy: { addedDate: 'asc' },
        },
      },
    })

    if (!team) {
      const where: any = {
        platformTeamId: teamId,
      }
      if (leagueIdFilter) {
        where.leagueId = leagueIdFilter
      }
      team = await prisma.fantasyTeam.findFirst({
        where,
        include: {
          league: true,
          roster: {
            include: {
              player: {
                select: {
                  id: true,
                  nhlId: true,
                  fullName: true,
                  position: true,
                  team: true,
                },
              },
            },
            orderBy: { addedDate: 'asc' },
          },
        },
      })
    }

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

    // Use season from query param, league season, or current season (in that order)
    // Convert ESPN format to database format if needed
    const leagueSeason = team.league.season
    const season = convertEspnSeasonToDbSeason(seasonParam || leagueSeason)
    
    // Debug logging
    console.log(`[Team API] Team: ${team.teamName}, Season param: ${seasonParam}, League season: ${leagueSeason}, Converted season: ${season}`)
    console.log(`[Team API] Roster size: ${team.roster.length}`)

    const skaterTotals = {
      gamesPlayed: 0,
      goals: 0,
      assists: 0,
      points: 0,
      plusMinus: 0,
      pim: 0,
      shotsOnGoal: 0,
      powerPlayPoints: 0,
      hits: 0,
      blockedShots: 0,
      faceoffsWon: 0,
    }

    const goalieTotals = {
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      otLosses: 0,
      saves: 0,
      shotsAgainst: 0,
      goalsAgainst: 0,
      shutouts: 0,
      // Rate stats aggregated via numerator/denominator
      savePctNumerator: 0,
      savePctDenominator: 0,
      gaaNumerator: 0,
      gaaDenominator: 0,
    }

    // SIMPLE APPROACH: Query ALL players by NHL ID first, then get their stats
    // Don't filter by stats existence - just get all players and include stats
    
    // Get all NHL IDs from roster
    const nhlIds = team.roster
      .map(r => r.player?.nhlId)
      .filter((id): id is number => id != null)
    
    console.log(`[Team API] Looking for stats for ${nhlIds.length} players by NHL ID`)
    console.log(`[Team API] Sample NHL IDs: ${nhlIds.slice(0, 5).join(', ')}`)
    
    // Query ALL Player records by NHL ID (don't filter by stats existence)
    const allPlayers = await prisma.player.findMany({
      where: {
        nhlId: { in: nhlIds },  // Match by NHL ID (unique, reliable)
      },
      select: {
        id: true,
        nhlId: true,
        fullName: true,
        position: true,
        team: true,
        stats: {
          where: {
            season: season,
            gameType: 'regular',
          },
          take: 1,
        },
      },
    })
    
    console.log(`[Team API] Found ${allPlayers.length} Player records for ${nhlIds.length} NHL IDs`)
    
    // If no stats for requested season, get stats from any season
    const allPlayersWithAnyStats = await prisma.player.findMany({
      where: {
        nhlId: { in: nhlIds },
      },
      select: {
        id: true,
        nhlId: true,
        fullName: true,
        position: true,
        team: true,
        stats: {
          where: {
            gameType: 'regular',
          },
          take: 1,
          orderBy: {
            season: 'desc',
          },
        },
      },
    })
    
    // Create lookup maps: NHL ID -> stats, and Name -> stats (for fallback)
    const statsByNhlId = new Map<number, typeof allPlayers[0]['stats'][0]>()
    const statsByName = new Map<string, typeof allPlayers[0]['stats'][0]>()
    
    // First, use stats from requested season
    for (const player of allPlayers) {
      if (player.stats[0]) {
        statsByNhlId.set(player.nhlId, player.stats[0])
        statsByName.set(player.fullName.toLowerCase(), player.stats[0])
        console.log(`[Team API] ✓ ${player.fullName} (NHL ID: ${player.nhlId}): GP=${player.stats[0].gamesPlayed} [season ${season}]`)
      }
    }
    
    // Then fill in missing ones from any season
    for (const player of allPlayersWithAnyStats) {
      if (player.stats[0]) {
        if (!statsByNhlId.has(player.nhlId)) {
          statsByNhlId.set(player.nhlId, player.stats[0])
          console.log(`[Team API] ✓ ${player.fullName} (NHL ID: ${player.nhlId}): GP=${player.stats[0].gamesPlayed} [season ${player.stats[0].season}]`)
        }
        if (!statsByName.has(player.fullName.toLowerCase())) {
          statsByName.set(player.fullName.toLowerCase(), player.stats[0])
        }
      }
    }
    
    // FALLBACK: For roster players not matched by NHL ID, try to find by name
    const statsNhlIds = new Set(statsByNhlId.keys())
    const missingNhlIds = nhlIds.filter(id => !statsNhlIds.has(id))
    if (missingNhlIds.length > 0) {
      console.log(`[Team API] ⚠️  ${missingNhlIds.length} roster players not matched by NHL ID, trying name matching...`)
      
      const missingRosterPlayers = team.roster.filter(r => 
        r.player?.nhlId && missingNhlIds.includes(r.player.nhlId)
      )
      
      // Try matching by name from players we already queried
      for (const rosterEntry of missingRosterPlayers) {
        const playerName = rosterEntry.player?.fullName?.toLowerCase()
        if (playerName && statsByName.has(playerName)) {
          const stats = statsByName.get(playerName)!
          // Map it to the roster's NHL ID so it matches
          statsByNhlId.set(rosterEntry.player.nhlId!, stats)
          console.log(`[Team API] ✓ Matched ${rosterEntry.player.fullName} by NAME (roster NHL ID: ${rosterEntry.player.nhlId}): GP=${stats.gamesPlayed}`)
        } else {
          // Try direct database lookup by name
          const playerByName = await prisma.player.findFirst({
            where: {
              fullName: { equals: rosterEntry.player?.fullName || '', mode: 'insensitive' },
              stats: { some: { gameType: 'regular' } },
            },
            select: {
              nhlId: true,
              fullName: true,
              id: true,
              stats: {
                where: { gameType: 'regular' },
                take: 1,
                orderBy: { season: 'desc' },
              },
            },
          })
          if (playerByName?.stats[0]) {
            console.log(`[Team API] ⚠️  NHL ID MISMATCH: Roster "${rosterEntry.player?.fullName}" has NHL ID ${rosterEntry.player?.nhlId}, but DB has NHL ID ${playerByName.nhlId}`)
            console.log(`[Team API]   → Using stats from DB player (GP: ${playerByName.stats[0].gamesPlayed})`)
            statsByNhlId.set(rosterEntry.player.nhlId!, playerByName.stats[0])
          }
        }
      }
    }
    
    console.log(`[Team API] Final: Found stats for ${statsByNhlId.size}/${nhlIds.length} players`)
    
    const roster = team.roster.map((r) => {
      const player = r.player
      if (!player) {
        return {
          playerId: 0,
          name: 'Unknown',
          position: 'N/A',
          team: null,
          slotPosition: r.slotPosition,
          stats: null,
        }
      }

      // Get stats from lookup map
      const stats = statsByNhlId.get(player.nhlId!) || null
      
      // Debug logging
      if (stats) {
        console.log(`[Team API] ✓ Attaching stats to ${player.fullName} (NHL ID: ${player.nhlId}): GP=${stats.gamesPlayed}, G=${stats.goals}, A=${stats.assists}`)
      } else if (player.nhlId) {
        console.log(`[Team API] ❌ No stats in map for ${player.fullName} (NHL ID: ${player.nhlId})`)
      }
      
      const isGoalie = player.position === 'G'

      // Aggregate totals
      if (stats) {
        if (isGoalie) {
          goalieTotals.gamesPlayed += stats.gamesPlayed || 0
          goalieTotals.wins += stats.wins || 0
          goalieTotals.losses += stats.losses || 0
          goalieTotals.otLosses += stats.otLosses || 0
          goalieTotals.saves += stats.saves || 0
          goalieTotals.shotsAgainst += stats.shotsAgainst || 0
          goalieTotals.goalsAgainst += stats.goalsAgainst || 0
          goalieTotals.shutouts += stats.shutouts || 0
          goalieTotals.savePctNumerator += stats.saves || 0
          goalieTotals.savePctDenominator += stats.shotsAgainst || 0
          if (typeof stats.goalsAgainst === 'number' && typeof stats.gamesPlayed === 'number' && stats.gamesPlayed > 0) {
            goalieTotals.gaaNumerator += stats.goalsAgainst
            goalieTotals.gaaDenominator += stats.gamesPlayed
          }
        } else {
          skaterTotals.gamesPlayed += stats.gamesPlayed || 0
          skaterTotals.goals += stats.goals || 0
          skaterTotals.assists += stats.assists || 0
          skaterTotals.points += stats.points || 0
          skaterTotals.plusMinus += stats.plusMinus || 0
          skaterTotals.pim += stats.pim || 0
          skaterTotals.shotsOnGoal += stats.shotsOnGoal || 0
          skaterTotals.powerPlayPoints += stats.powerPlayPoints || 0
          skaterTotals.hits += stats.hits || 0
          skaterTotals.blockedShots += stats.blockedShots || 0
          skaterTotals.faceoffsWon += stats.faceoffsWon || 0
        }
      }

      return {
        playerId: player.nhlId,
        name: player.fullName,
        position: player.position,
        team: player.team,
        slotPosition: r.slotPosition,
        stats: stats ? {
          // Explicitly map all stat fields to ensure they're serialized
          gamesPlayed: stats.gamesPlayed,
          goals: stats.goals,
          assists: stats.assists,
          points: stats.points,
          plusMinus: stats.plusMinus,
          pim: stats.pim,
          shotsOnGoal: stats.shotsOnGoal,
          powerPlayPoints: stats.powerPlayPoints,
          hits: stats.hits,
          blockedShots: stats.blockedShots,
          faceoffsWon: stats.faceoffsWon,
          wins: stats.wins,
          losses: stats.losses,
          otLosses: stats.otLosses,
          saves: stats.saves,
          shotsAgainst: stats.shotsAgainst,
          goalsAgainst: stats.goalsAgainst,
          shutouts: stats.shutouts,
          savePct: stats.savePct,
          gaa: stats.gaa,
        } : null,
      }
    })

    const aggregated = {
      skaters: skaterTotals,
      goalies: {
        wins: goalieTotals.wins,
        losses: goalieTotals.losses,
        otLosses: goalieTotals.otLosses,
        saves: goalieTotals.saves,
        shotsAgainst: goalieTotals.shotsAgainst,
        goalsAgainst: goalieTotals.goalsAgainst,
        shutouts: goalieTotals.shutouts,
        savePct:
          goalieTotals.savePctDenominator > 0
            ? goalieTotals.savePctNumerator / goalieTotals.savePctDenominator
            : null,
        gaa:
          goalieTotals.gaaDenominator > 0
            ? goalieTotals.gaaNumerator / goalieTotals.gaaDenominator
            : null,
      },
    }

    return NextResponse.json({
      team: {
        id: team.id,
        teamName: team.teamName,
        ownerName: team.ownerName,
        league: { id: team.league.id, leagueName: team.league.leagueName, season: team.league.season },
        roster,
        totals: aggregated,
      },
      season,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch team' }, { status: 500 })
  }
}


