import * as path from 'path'
import * as fs from 'fs'

import { prisma } from '@/lib/prisma'

const STORAGE_PATH = path.join(process.cwd(), '.playwright', 'espn-storage.json')
const BASE_URL = 'https://fantasy.espn.com'
const API_HOST = 'https://lm-api-reads.fantasy.espn.com'

const PRO_TEAM_MAP: Record<number, { abbrev: string; name: string }> = {
  0: { abbrev: 'FA', name: 'Free Agents' },
  1: { abbrev: 'BOS', name: 'Boston Bruins' },
  2: { abbrev: 'BUF', name: 'Buffalo Sabres' },
  3: { abbrev: 'CGY', name: 'Calgary Flames' },
  4: { abbrev: 'CHI', name: 'Chicago Blackhawks' },
  5: { abbrev: 'DET', name: 'Detroit Red Wings' },
  6: { abbrev: 'EDM', name: 'Edmonton Oilers' },
  7: { abbrev: 'CAR', name: 'Carolina Hurricanes' },
  8: { abbrev: 'LAK', name: 'Los Angeles Kings' },
  9: { abbrev: 'DAL', name: 'Dallas Stars' },
  10: { abbrev: 'MTL', name: 'Montréal Canadiens' },
  11: { abbrev: 'NJD', name: 'New Jersey Devils' },
  12: { abbrev: 'NYI', name: 'New York Islanders' },
  13: { abbrev: 'NYR', name: 'New York Rangers' },
  14: { abbrev: 'OTT', name: 'Ottawa Senators' },
  15: { abbrev: 'PHI', name: 'Philadelphia Flyers' },
  16: { abbrev: 'PIT', name: 'Pittsburgh Penguins' },
  17: { abbrev: 'COL', name: 'Colorado Avalanche' },
  18: { abbrev: 'SJS', name: 'San Jose Sharks' },
  19: { abbrev: 'STL', name: 'St. Louis Blues' },
  20: { abbrev: 'TBL', name: 'Tampa Bay Lightning' },
  21: { abbrev: 'TOR', name: 'Toronto Maple Leafs' },
  22: { abbrev: 'VAN', name: 'Vancouver Canucks' },
  23: { abbrev: 'WSH', name: 'Washington Capitals' },
  24: { abbrev: 'ANA', name: 'Anaheim Ducks' },
  25: { abbrev: 'FLA', name: 'Florida Panthers' },
  26: { abbrev: 'CBJ', name: 'Columbus Blue Jackets' },
  27: { abbrev: 'NSH', name: 'Nashville Predators' },
  28: { abbrev: 'WPG', name: 'Winnipeg Jets' },
  29: { abbrev: 'MIN', name: 'Minnesota Wild' },
  30: { abbrev: 'SEA', name: 'Seattle Kraken' },
  31: { abbrev: 'VGK', name: 'Vegas Golden Knights' },
  32: { abbrev: 'UTA', name: 'Utah Hockey Club' },
  33: { abbrev: 'ARI', name: 'Arizona Coyotes' },
  37: { abbrev: 'VGK', name: 'Vegas Golden Knights' },
  124292: { abbrev: 'FLA', name: 'Florida Panthers' },
  129764: { abbrev: 'UTA', name: 'Utah Hockey Club' },
}

const DEFAULT_SEASON = '2026'
const PRO_TEAM_BY_ABBREV: Record<string, { abbrev: string; name: string }> = Object.values(PRO_TEAM_MAP).reduce(
  (acc, team) => {
    acc[team.abbrev.toUpperCase()] = team
    return acc
  },
  {} as Record<string, { abbrev: string; name: string }>
)

export class EspnSyncError extends Error {
  status: number
  constructor(message: string, status = 500) {
    super(message)
    this.name = 'EspnSyncError'
    this.status = status
  }
}

function buildCookieHeader(storageState: any): string {
  if (!storageState || !Array.isArray(storageState.cookies)) {
    return ''
  }
  const relevantCookies = storageState.cookies.filter(
    (cookie: any) => cookie.domain && cookie.domain.includes('espn.com')
  )
  return relevantCookies.map((cookie: any) => `${cookie.name}=${cookie.value}`).join('; ')
}

function mapSlot(slotId: number, slotMap: Map<number, string>, positionMap: Map<number, string>): string {
  if (slotMap.has(slotId)) {
    return slotMap.get(slotId) as string
  }
  const DEFAULT_SLOT_MAP: Record<number, string> = {
    0: 'C',
    1: 'C',
    2: 'LW',
    3: 'RW',
    4: 'D',
    5: 'G',
    6: 'G',
    7: 'F',
    8: 'UTIL',
    9: 'BN',
    10: 'IR',
    11: 'IR',
    12: 'IR+',
    13: 'BN',
    14: 'BN',
    15: 'BN',
  }
  if (slotId in DEFAULT_SLOT_MAP) {
    return DEFAULT_SLOT_MAP[slotId]
  }
  if (positionMap.has(slotId)) {
    return positionMap.get(slotId) as string
  }
  return `Slot ${slotId}`
}

function mapPosition(positionId: number, positionMap: Map<number, string>): string {
  if (positionMap.has(positionId)) {
    return positionMap.get(positionId) as string
  }
  const DEFAULT_POSITION_MAP: Record<number, string> = {
    0: 'C',
    1: 'C',
    2: 'LW',
    3: 'RW',
    4: 'D',
    5: 'G',
  }
  if (positionId in DEFAULT_POSITION_MAP) {
    return DEFAULT_POSITION_MAP[positionId]
  }
  return `Pos ${positionId}`
}

function mapProTeam(proTeamId: number | undefined | null) {
  if (proTeamId === undefined || proTeamId === null) {
    return { abbrev: 'FA', name: 'Free Agents' }
  }
  return PRO_TEAM_MAP[proTeamId] ?? { abbrev: `Team ${proTeamId}`, name: `Team ${proTeamId}` }
}

export interface EspnRosterPlayer {
  playerId: number | null
  fullName: string
  defaultPosition: string
  lineupSlot: string | null
  proTeamAbbrev: string | null
  proTeamName: string | null
  proTeamId: number | null
  injuryStatus: string | null
  stats: any[]
}

export interface EspnTeam {
  teamId: string
  teamName: string
  ownerName: string | null
  abbrev: string | null
  logo: string | null
  roster: EspnRosterPlayer[]
  record: any
}

export interface EspnLeagueFetchResult {
  success: boolean
  leagueId: string
  season: string
  leagueName?: string
  categories?: string[]
  teams: EspnTeam[]
  raw?: any
  debug?: {
    proTeams?: Array<{ id: number; abbrev: string; name: string }>
    players?: any[]
  }
}

export async function fetchEspnLeagueData({
  leagueId,
  season = DEFAULT_SEASON,
  includeDebug = false,
}: {
  leagueId: string
  season?: string
  includeDebug?: boolean
}): Promise<EspnLeagueFetchResult> {
  if (!leagueId) {
    throw new EspnSyncError('leagueId is required', 400)
  }

  if (!fs.existsSync(STORAGE_PATH)) {
    throw new EspnSyncError('ESPN session not found. Please run "npm run espn-login" first to capture your login session.', 401)
  }

  const storageState = JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf-8'))
  const cookieHeader = buildCookieHeader(storageState)

  if (!cookieHeader) {
    throw new EspnSyncError('Unable to build ESPN cookie header from saved session. Re-run "npm run espn-login".', 401)
  }

  const espnUrl = `${API_HOST}/apis/v3/games/fhl/seasons/${season}/segments/0/leagues/${leagueId}?view=mRoster&view=mTeam&view=mSettings&view=proTeamSchedules_wl`

  const response = await fetch(espnUrl, {
    headers: {
      Cookie: cookieHeader,
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      Connection: 'keep-alive',
      Referer: `${BASE_URL}/hockey/team?leagueId=${leagueId}`,
      Origin: BASE_URL,
      'x-fantasy-platform': 'kona',
      'x-fantasy-source': 'kona',
    },
    method: 'GET',
  })

  if (response.status === 401 || response.status === 403) {
    const body = await response.text().catch(() => '')
    throw new EspnSyncError(
      `Authentication failed with ESPN. Session may have expired. ${body.slice(0, 200)}`,
      401
    )
  }

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    const bodyText = await response.text().catch(() => '')
    const needsConsent =
      bodyText.includes('Access Denied') ||
      bodyText.includes('Please accept the ESPN Fantasy app access request') ||
      bodyText.includes('Add League to ESPN Fantasy App') ||
      bodyText.includes('You must accept access') ||
      bodyText.includes('continue to ESPN Fantasy')

    throw new EspnSyncError(
      needsConsent
        ? 'You may need to visit ESPN in a browser and accept the “Add league to ESPN Fantasy App” consent prompt, then rerun npm run espn-login.'
        : `ESPN returned unexpected content-type (${contentType || 'unknown'})`,
      502
    )
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new EspnSyncError(`Failed to fetch teams from ESPN (${response.status}): ${body.slice(0, 200)}`, response.status)
  }

  const data = await response.json()

  const members = new Map<string, string>()
  if (Array.isArray(data.members)) {
    data.members.forEach((member: any) => {
      const key = (member.id ?? member.memberId ?? '').toString()
      const display =
        member.displayName ||
        member.firstName ||
        member.lastName ||
        member.nickname ||
        member.email ||
        key
      if (key) {
        members.set(key, display)
      }
    })
  }

  const positionMap = new Map<number, string>()
  if (Array.isArray(data.settings?.positions)) {
    data.settings.positions.forEach((position: any) => {
      if (typeof position.id === 'number') {
        positionMap.set(position.id, position.abbrev || position.name || position.label || `Pos ${position.id}`)
      }
    })
  }

  const slotMap = new Map<number, string>()
  const slotItems = data.settings?.rosterSettings?.slotCategoryItems
  if (Array.isArray(slotItems)) {
    slotItems.forEach((item: any) => {
      const slotId = item.slotCategoryId ?? item.slotId ?? item.id
      if (typeof slotId === 'number') {
        slotMap.set(slotId, item.name || item.abbrev || item.shortName || `Slot ${slotId}`)
      }
    })
  }

  const proTeamMapFromSettings = new Map<number, { abbrev: string; name: string }>()
  if (Array.isArray(data.settings?.proTeams)) {
    data.settings.proTeams.forEach((team: any) => {
      if (typeof team.id === 'number') {
        proTeamMapFromSettings.set(team.id, {
          abbrev: team.abbrev || team.abbreviation || team.location || `Team ${team.id}`,
          name: team.name || team.displayName || team.location || `Team ${team.id}`,
        })
      }
    })
  }

  const teams = Array.isArray(data.teams) ? data.teams : []

  const playerIdSet = new Set<number>()
  teams.forEach((team: any) => {
    const rosterEntries = team.roster?.entries || []
    rosterEntries.forEach((entry: any) => {
      const playerEntry = entry.playerPoolEntry || entry.player || {}
      const player = playerEntry.player || {}
      const playerId = player.id ?? player.playerId ?? playerEntry.id
      if (typeof playerId === 'number' && playerId > 0) {
        playerIdSet.add(playerId)
      }
    })
  })

  let dbPlayerMap = new Map<number, { team: string | null; position: string | null }>()
  if (playerIdSet.size > 0) {
    const dbPlayers = await prisma.player.findMany({
      where: { nhlId: { in: Array.from(playerIdSet) } },
      select: { nhlId: true, team: true, position: true },
    })
    dbPlayerMap = new Map(dbPlayers.map(p => [p.nhlId, { team: p.team, position: p.position }]))
  }

  const debugPlayers: any[] = []

  const normalizedTeams: EspnTeam[] = teams.map((team: any) => {
    const teamId = (team.id ?? team.teamId ?? team.team_id)?.toString?.() ?? ''
    const nameParts = [team.location, team.nickname].filter(Boolean)
    const teamName = nameParts.length > 0 ? nameParts.join(' ') : team.teamName || team.abbrev || `Team ${teamId}`

    let ownerName: string | null = null
    if (Array.isArray(team.owners) && team.owners.length > 0) {
      const ownerId = team.owners[0]?.toString()
      ownerName = ownerId ? members.get(ownerId) || ownerId : null
    } else if (team.primaryOwner) {
      ownerName = members.get(team.primaryOwner.toString()) || team.primaryOwner.toString()
    }

    const rosterEntries = team.roster?.entries || []
    const roster: EspnRosterPlayer[] = rosterEntries.map((entry: any) => {
      const playerEntry = entry.playerPoolEntry || entry.player || {}
      const player = playerEntry.player || {}
      const playerId = player.id ?? player.playerId ?? playerEntry.id
      if (typeof playerId === 'number' && playerId > 0 && !debugPlayers.some(p => p.playerId === playerId)) {
        if (includeDebug) {
          debugPlayers.push({
            playerId,
            fullName: player.fullName || player.name || player.displayName,
            proTeamId: player.proTeamId,
            proTeamAbbrev: player.proTeamAbbrev,
            proTeamName: player.proTeamName,
            defaultPositionId: player.defaultPositionId,
            defaultPosition: player.defaultPosition,
            defaultPositionAbbrev: player.defaultPositionAbbrev,
            proTeam: player.proTeam
              ? {
                  id: player.proTeam.id ?? player.proTeam.teamId ?? null,
                  abbrev: player.proTeam.abbrev ?? player.proTeam.abbreviation ?? null,
                  name: player.proTeam.name ?? player.proTeam.displayName ?? player.proTeam.location ?? null,
                  location: player.proTeam.location ?? null,
                  nickname: player.proTeam.nickname ?? null,
                }
              : null,
            teamId: player.teamId,
            ownership: player.ownership,
            eligibleSlots: player.eligibleSlots,
          })
        }
      }
      const fullName = player.fullName || player.name || player.displayName || 'Unknown Player'
      const defaultPositionId = player.defaultPositionId ?? (Array.isArray(player.eligibleSlots) ? player.eligibleSlots[0] : null)
      const dbInfo = typeof playerId === 'number' ? dbPlayerMap.get(playerId) : undefined
      let defaultPosition: string | null = null
      if (typeof player.defaultPositionAbbrev === 'string' && player.defaultPositionAbbrev.trim().length > 0) {
        defaultPosition = player.defaultPositionAbbrev.toUpperCase()
      } else if (typeof player.defaultPosition === 'string' && player.defaultPosition.trim().length > 0) {
        defaultPosition = player.defaultPosition.toUpperCase()
      } else if (typeof player.position === 'string' && player.position.trim().length > 0) {
        defaultPosition = player.position.toUpperCase()
      } else if (defaultPositionId !== null && defaultPositionId !== undefined) {
        defaultPosition = mapPosition(defaultPositionId, positionMap)
      } else if (Array.isArray(player.eligibleSlots) && player.eligibleSlots.length > 0) {
        defaultPosition = mapPosition(player.eligibleSlots[0], positionMap)
      }
      const dbPosition = dbInfo?.position?.toUpperCase()
      if (!defaultPosition && dbPosition) {
        defaultPosition = dbPosition
      }
      if (!defaultPosition) {
        defaultPosition = 'N/A'
      }
      const lineupSlotId = entry.lineupSlotId ?? entry.slotId ?? entry.positionId
      const slotLabel = typeof lineupSlotId === 'number' ? mapSlot(lineupSlotId, slotMap, positionMap) : null
      const statsArray = Array.isArray(player.stats)
        ? player.stats
        : Array.isArray(playerEntry.stats)
          ? playerEntry.stats
          : []
      const statsTeamId = statsArray.find(
        (stat: any) => typeof stat?.proTeamId === 'number' && stat.proTeamId > 0
      )?.proTeamId ?? null
      const baseProTeamId = player.proTeamId ?? statsTeamId ?? null
      const directProTeamAbbrev =
        (typeof player.proTeamAbbrev === 'string' && player.proTeamAbbrev.trim().length > 0
          ? player.proTeamAbbrev
          : undefined) ??
        (typeof player.proTeamAbbreviation === 'string' && player.proTeamAbbreviation.trim().length > 0
          ? player.proTeamAbbreviation
          : undefined) ??
        (typeof player.proTeam?.abbrev === 'string' && player.proTeam?.abbrev.trim().length > 0
          ? player.proTeam.abbrev
          : undefined) ??
        (typeof player.proTeam?.abbreviation === 'string' && player.proTeam?.abbreviation.trim().length > 0
          ? player.proTeam.abbreviation
          : undefined)

      const directProTeamName =
        (typeof player.proTeam?.name === 'string' && player.proTeam.name.trim().length > 0 ? player.proTeam.name : undefined) ??
        (typeof player.proTeamName === 'string' && player.proTeamName.trim().length > 0 ? player.proTeamName : undefined) ??
        (typeof player.proTeam?.displayName === 'string' && player.proTeam.displayName.trim().length > 0 ? player.proTeam.displayName : undefined) ??
        (typeof player.proTeam?.location === 'string' && player.proTeam.location.trim().length > 0 ? player.proTeam.location : undefined)

      const proTeamFromSettings = typeof baseProTeamId === 'number' ? proTeamMapFromSettings.get(baseProTeamId) : undefined
      const fallbackTeam = mapProTeam(baseProTeamId ?? undefined)
      let proTeamAbbrev =
        directProTeamAbbrev?.toUpperCase() ??
        proTeamFromSettings?.abbrev?.toUpperCase?.() ??
        (typeof baseProTeamId === 'number' ? PRO_TEAM_MAP[baseProTeamId]?.abbrev : undefined) ??
        (typeof statsTeamId === 'number' ? PRO_TEAM_MAP[statsTeamId]?.abbrev : undefined) ??
        fallbackTeam.abbrev
      let proTeamName =
        directProTeamName ??
        proTeamFromSettings?.name ??
        (typeof baseProTeamId === 'number' ? PRO_TEAM_MAP[baseProTeamId]?.name : undefined) ??
        (typeof statsTeamId === 'number' ? PRO_TEAM_MAP[statsTeamId]?.name : undefined) ??
        fallbackTeam.name
      const normalizedDbTeam = dbInfo?.team?.toUpperCase()

      if (normalizedDbTeam) {
        proTeamAbbrev = normalizedDbTeam
        const mappedTeam = PRO_TEAM_BY_ABBREV[proTeamAbbrev]
        proTeamName = mappedTeam?.name ?? proTeamAbbrev
      } else if (!proTeamAbbrev || proTeamAbbrev.startsWith('Team ') || proTeamAbbrev.trim().length === 0) {
        proTeamAbbrev = fallbackTeam.abbrev
        proTeamName = fallbackTeam.name
      }

      return {
        playerId: typeof playerId === 'number' ? playerId : null,
        fullName,
        defaultPosition: defaultPosition,
        lineupSlot: slotLabel,
        proTeamAbbrev,
        proTeamName,
        proTeamId: baseProTeamId,
        injuryStatus: player.injuryStatus || player.injury?.status || null,
        stats: statsArray,
      }
    })

    roster.sort((a: any, b: any) => {
      if (a.lineupSlot === null && b.lineupSlot !== null) return 1
      if (a.lineupSlot !== null && b.lineupSlot === null) return -1
      if (a.lineupSlot === b.lineupSlot) return 0
      return (a.lineupSlot ?? '').localeCompare(b.lineupSlot ?? '')
    })

    return {
      teamId,
      teamName,
      ownerName,
      abbrev: team.abbrev || null,
      logo: team.logo || null,
      roster,
      record: team.record || team.altTeamScores || null,
    }
  })

  const leagueName =
    data.settings?.name ||
    data.settings?.leagueName ||
    data.settings?.league?.name ||
    data.settings?.league?.leagueName ||
    data.status?.leagueName ||
    `ESPN League ${leagueId}`

  const categories =
    Array.isArray(data.settings?.scoringSettings?.categories)
      ? data.settings.scoringSettings.categories.map((cat: any) =>
          typeof cat === 'string'
            ? cat
            : cat.displayName || cat.name || cat.abbrev || JSON.stringify(cat)
        )
      : []

  const result: EspnLeagueFetchResult = {
    success: true,
    leagueId,
    season,
    leagueName,
    categories,
    teams: normalizedTeams,
  }

  if (includeDebug) {
    result.debug = {
      proTeams: Array.from(proTeamMapFromSettings.entries()).map(([id, info]) => ({
        id,
        abbrev: info.abbrev,
        name: info.name,
      })),
      players: debugPlayers,
    }
    result.raw = {
      settingsProTeams: data.settings?.proTeams ?? null,
      proTeams: data.proTeams ?? null,
    }
  }

  return result
}

export async function syncEspnLeagueToDatabase({
  leagueId,
  season = DEFAULT_SEASON,
}: {
  leagueId: string
  season?: string
}) {
  const fetchResult = await fetchEspnLeagueData({ leagueId, season })

  const { leagueName, categories = [], teams, season: resolvedSeason } = fetchResult

  const transactionResult = await prisma.$transaction(async tx => {
    const league = await tx.fantasyLeague.upsert({
      where: {
        platform_platformId_season: {
          platform: 'espn',
          platformId: leagueId,
          season: resolvedSeason,
        },
      },
      update: {
        leagueName,
        categories,
      },
      create: {
        platform: 'espn',
        platformId: leagueId,
        leagueName,
        season: resolvedSeason,
        categories,
      },
    })

    let playerCount = 0

    for (const team of teams) {
      const savedTeam = await tx.fantasyTeam.upsert({
        where: {
          leagueId_platformTeamId: {
            leagueId: league.id,
            platformTeamId: team.teamId,
          },
        },
        update: {
          teamName: team.teamName,
          ownerName: team.ownerName ?? undefined,
        },
        create: {
          leagueId: league.id,
          platformTeamId: team.teamId,
          teamName: team.teamName,
          ownerName: team.ownerName ?? null,
        },
      })

      await tx.fantasyRoster.deleteMany({ where: { teamId: savedTeam.id } })

      const rosterRecords: { teamId: string; playerId: number; slotPosition: string }[] = []

      await Promise.all(
        team.roster.map(async player => {
          const nhlId = typeof player.playerId === 'number' ? player.playerId : null
          const fullName = player.fullName || 'Unknown Player'
          const nameParts = fullName.trim().split(' ').filter(Boolean)
          const firstName = nameParts.shift() || fullName
          const lastName = nameParts.length ? nameParts.join(' ') : firstName
          const position = player.defaultPosition?.toUpperCase() || 'N/A'
          const teamAbbrev = player.proTeamAbbrev?.toUpperCase() || 'FA'

          // Use player matcher to find or create player
          // First try to find by NHL ID
          let dbPlayer = null
          if (nhlId && nhlId > 0) {
            dbPlayer = await tx.player.findUnique({
              where: { nhlId },
            })
          }

          // If not found by NHL ID, try name matching
          if (!dbPlayer) {
            const nameMatch = await tx.player.findFirst({
              where: {
                AND: [
                  { firstName: { equals: firstName, mode: 'insensitive' } },
                  { lastName: { equals: lastName, mode: 'insensitive' } },
                  ...(position !== 'N/A' ? [{ position }] : []),
                ],
              },
            })
            if (nameMatch) {
              dbPlayer = nameMatch
            }
          }

          // Create player if not found
          if (!dbPlayer) {
            // Generate a temporary negative NHL ID if none provided
            let finalNhlId = nhlId && nhlId > 0 ? nhlId : -1
            if (finalNhlId <= 0) {
              const existingNegativeIds = await tx.player.findMany({
                where: { nhlId: { lt: 0 } },
                select: { nhlId: true },
                orderBy: { nhlId: 'asc' },
                take: 1,
              })
              finalNhlId = existingNegativeIds.length > 0 
                ? existingNegativeIds[0].nhlId - 1 
                : -1
            }

            dbPlayer = await tx.player.create({
              data: {
                nhlId: finalNhlId,
                fullName,
                firstName,
                lastName,
                position,
                team: teamAbbrev,
              },
            })
          } else {
            // Update existing player with latest info
            dbPlayer = await tx.player.update({
              where: { id: dbPlayer.id },
              data: {
                fullName,
                firstName,
                lastName,
                position,
                team: teamAbbrev,
                // Update NHL ID if we have one and it's missing
                ...(nhlId && nhlId > 0 && !dbPlayer.nhlId && { nhlId }),
              },
            })
          }

          rosterRecords.push({
            teamId: savedTeam.id,
            playerId: dbPlayer.id, // Use database ID, not nhlId
            slotPosition: (player.lineupSlot ?? 'BN').toString().toUpperCase(),
          })
          playerCount += 1
        })
      )

      if (rosterRecords.length > 0) {
        await tx.fantasyRoster.createMany({
          data: rosterRecords,
        })
      }
    }

    return {
      league,
      teamCount: teams.length,
      playerCount,
    }
  })

  return {
    ...fetchResult,
    league: transactionResult.league,
    teamCount: transactionResult.teamCount,
    playerCount: transactionResult.playerCount,
  }
}


