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

    // Bulk fetch stats for all roster players for this season
    const playerIds = team.roster.map(r => r.player.id).filter(id => id != null)
    
    let statsRows: any[] = []
    
    // CRITICAL: Handle ID mismatch between FantasyRoster and PlayerStats
    // FantasyRoster.playerId = NHL ID (references Player.nhlId)
    // PlayerStats.playerId = Database ID (references Player.id)
    // We need to find ALL Player records with roster NHL IDs, then query their stats
    
    // Step 1: Get NHL IDs from roster
    const nhlIds = team.roster
      .map(r => r.player?.nhlId)
      .filter((id): id is number => id != null)
    
    if (nhlIds.length > 0) {
      // Step 2: Find ALL Player records with these NHL IDs (handles duplicates)
      const allPlayers = await prisma.player.findMany({
        where: { nhlId: { in: nhlIds } },
        select: { id: true, nhlId: true, fullName: true }
      })
      
      if (allPlayers.length > 0) {
        // Step 3: Get ALL database IDs (from all Player records)
        const allPlayerDbIds = allPlayers.map(p => p.id)
        
        // Step 4: Query stats using ALL database IDs
        let stats = await prisma.playerStats.findMany({
          where: {
            playerId: { in: allPlayerDbIds },
            season: season,
            gameType: 'regular'
          },
          include: {
            player: {
              select: { id: true, nhlId: true, fullName: true }
            }
          }
        })
        
        // FALLBACK: If no stats found by DB ID, try querying by NHL ID directly
        // This handles the case where stats are linked to different Player DB IDs
        if (stats.length === 0) {
          stats = await prisma.playerStats.findMany({
            where: {
              player: {
                nhlId: { in: nhlIds }
              },
              season: season,
              gameType: 'regular'
            },
            include: {
              player: {
                select: { id: true, nhlId: true, fullName: true }
              }
            }
          })
          
          // FALLBACK 2: If still no stats, try matching by player name
          // This handles cases where roster has Player records with wrong NHL IDs
          if (stats.length === 0) {
            const rosterPlayerNames = team.roster
              .map(r => r.player?.fullName)
              .filter((name): name is string => name != null)
            
            // Find Player records with matching names that have stats
            const playersWithStats = await prisma.player.findMany({
              where: {
                fullName: { in: rosterPlayerNames },
                stats: {
                  some: {
                    season: season,
                    gameType: 'regular'
                  }
                }
              },
              include: {
                stats: {
                  where: {
                    season: season,
                    gameType: 'regular'
                  },
                  take: 1
                }
              }
            })
            
            // Convert to stats format
            stats = playersWithStats
              .filter(p => p.stats.length > 0)
              .map(p => ({
                ...p.stats[0],
                player: {
                  id: p.id,
                  nhlId: p.nhlId,
                  fullName: p.fullName
                }
              }))
          }
        }
        
        if (stats.length > 0) {
          // Step 5: Map stats by NHL ID and by name (handles duplicate Player records and wrong NHL IDs)
          const nhlIdToStatsMap = new Map<number, any>()
          const nameToStatsMap = new Map<string, any>()
          for (const stat of stats) {
            // Map by NHL ID
            const existing = nhlIdToStatsMap.get(stat.player.nhlId)
            if (!existing || stat.gamesPlayed > existing.gamesPlayed) {
              nhlIdToStatsMap.set(stat.player.nhlId, stat)
            }
            // Map by name (for fallback matching)
            const existingByName = nameToStatsMap.get(stat.player.fullName.toLowerCase())
            if (!existingByName || stat.gamesPlayed > existingByName.gamesPlayed) {
              nameToStatsMap.set(stat.player.fullName.toLowerCase(), stat)
            }
          }
          
          // Step 6: Match stats to roster entries by NHL ID, then by name as fallback
          for (const rosterEntry of team.roster) {
            const nhlId = rosterEntry.player?.nhlId
            const playerName = rosterEntry.player?.fullName?.toLowerCase()
            let stat = null
            
            // Try NHL ID first
            if (nhlId && nhlIdToStatsMap.has(nhlId)) {
              stat = nhlIdToStatsMap.get(nhlId)
            } 
            // Fallback to name matching (handles wrong NHL IDs in roster)
            else if (playerName && nameToStatsMap.has(playerName)) {
              stat = nameToStatsMap.get(playerName)
            }
            
            if (stat) {
              statsRows.push(stat)
            }
          }
        } else {
          // Fallback: Try other seasons
          const anyStats = await prisma.playerStats.findMany({
            where: {
              playerId: { in: allPlayerDbIds },
              gameType: 'regular'
            },
            select: { season: true },
            distinct: ['season']
          })
          
          const availableSeasons = anyStats.map(s => s.season).sort().reverse()
          
          if (availableSeasons.length > 0) {
            const fallbackSeason = availableSeasons[0]
            
            const fallbackStats = await prisma.playerStats.findMany({
              where: {
                playerId: { in: allPlayerDbIds },
                season: fallbackSeason,
                gameType: 'regular'
              },
              include: {
                player: {
                  select: { id: true, nhlId: true, fullName: true }
                }
              }
            })
            
            const fallbackMap = new Map<number, any>()
            for (const stat of fallbackStats) {
              const existing = fallbackMap.get(stat.player.nhlId)
              if (!existing || stat.gamesPlayed > existing.gamesPlayed) {
                fallbackMap.set(stat.player.nhlId, stat)
              }
            }
            
            for (const rosterEntry of team.roster) {
              const nhlId = rosterEntry.player?.nhlId
              if (nhlId && fallbackMap.has(nhlId)) {
                statsRows.push(fallbackMap.get(nhlId))
              }
            }
          }
        }
      }
    }
    
    // Build final map: roster player DB ID -> stats
    // statsRows are matched by NHL ID or name, so we need to map them back to roster entries
    const playerIdToStats = new Map<number, typeof statsRows[number]>()
    const nhlIdToStats = new Map<number, typeof statsRows[number]>()
    
    // Map stats to roster players by NHL ID first, then by name as fallback
    for (const stat of statsRows) {
      // Try to find roster entry by NHL ID first
      let rosterEntry = team.roster.find(r => r.player?.nhlId === stat.player.nhlId)
      
      // If not found by NHL ID, try by name (handles cases where we matched by name)
      if (!rosterEntry) {
        rosterEntry = team.roster.find(r => 
          r.player?.fullName?.toLowerCase() === stat.player.fullName?.toLowerCase()
        )
      }
      
      if (rosterEntry && rosterEntry.player) {
        playerIdToStats.set(rosterEntry.player.id, stat)
        nhlIdToStats.set(rosterEntry.player.nhlId, stat)
      }
    }

    const roster = team.roster.map(r => {
      const player = r.player
      // Try to find stats by database ID first, then by NHL ID as fallback
      let s = playerIdToStats.get(player.id) || null
      if (!s) {
        s = nhlIdToStats.get(player.nhlId) || null
      }
      const isGoalie = player.position === 'G'

      if (s) {
        if (isGoalie) {
          goalieTotals.gamesPlayed += s.gamesPlayed || 0
          goalieTotals.wins += s.wins || 0
          goalieTotals.losses += s.losses || 0
          goalieTotals.otLosses += s.otLosses || 0
          goalieTotals.saves += s.saves || 0
          goalieTotals.shotsAgainst += s.shotsAgainst || 0
          goalieTotals.goalsAgainst += s.goalsAgainst || 0
          goalieTotals.shutouts += s.shutouts || 0
          // Save% = saves/shotsAgainst
          goalieTotals.savePctNumerator += s.saves || 0
          goalieTotals.savePctDenominator += s.shotsAgainst || 0
          // GAA ~ goalsAgainst / (TOI/60). If we don't track TOI for goalies, approximate using gamesPlayed
          if (typeof s.goalsAgainst === 'number' && typeof s.gamesPlayed === 'number' && s.gamesPlayed > 0) {
            goalieTotals.gaaNumerator += s.goalsAgainst
            goalieTotals.gaaDenominator += s.gamesPlayed
          }
        } else {
          skaterTotals.gamesPlayed += s.gamesPlayed
          skaterTotals.goals += s.goals
          skaterTotals.assists += s.assists
          skaterTotals.points += s.points
          skaterTotals.plusMinus += s.plusMinus
          skaterTotals.pim += s.pim
          skaterTotals.shotsOnGoal += s.shotsOnGoal || 0
          skaterTotals.powerPlayPoints += s.powerPlayPoints
          skaterTotals.hits += s.hits
          skaterTotals.blockedShots += s.blockedShots
          skaterTotals.faceoffsWon += s.faceoffsWon
        }
      }

      return {
        playerId: player.nhlId,
        name: player.fullName,
        position: player.position,
        team: player.team,
        slotPosition: r.slotPosition,
        stats: s,
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


