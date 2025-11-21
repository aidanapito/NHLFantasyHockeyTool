/**
 * Manual Roster Insertion API
 *
 * POST /api/fantasy/manual-roster
 * Body: {
 *   leagueName: string,
 *   season: string,
 *   teamName: string,
 *   players: Array<{ playerName: string, slotPosition: 'C'|'LW'|'RW'|'D'|'G'|'UTIL'|'BN'|'IR' }>
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type Slot = 'C'|'LW'|'RW'|'D'|'G'|'UTIL'|'BN'|'IR';

interface PlayerInput {
  playerName: string;
  slotPosition?: Slot;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { leagueName, season, teamName, players, playerNames } = body as {
      leagueName: string;
      season: string;
      teamName: string;
      players?: PlayerInput[];
      playerNames?: string[];
    };

    if (!leagueName || !season || !teamName || (!Array.isArray(players) && !Array.isArray(playerNames))) {
      return NextResponse.json(
        { error: 'leagueName, season, teamName, and players or playerNames are required' },
        { status: 400 }
      );
    }

    // Find league
    const league = await prisma.fantasyLeague.findFirst({
      where: { platform: 'manual', leagueName, season }
    });

    if (!league) {
      return NextResponse.json(
        { error: `Manual league not found: ${leagueName} (${season})` },
        { status: 404 }
      );
    }

    // Find team
    const team = await prisma.fantasyTeam.findFirst({
      where: { leagueId: league.id, teamName: { equals: teamName, mode: 'insensitive' } }
    });

    if (!team) {
      return NextResponse.json(
        { error: `Team not found in league: ${teamName}` },
        { status: 404 }
      );
    }

    let added = 0;
    const notFound: string[] = [];

    const normalized: PlayerInput[] = Array.isArray(players)
      ? players
      : (playerNames || []).map((n) => ({ playerName: n, slotPosition: 'BN' }));

    for (const p of normalized) {
      const name = (p.playerName || '').trim();
      if (!name) continue;

      // Try to find player by fullName
      const dbPlayer = await prisma.player.findFirst({
        where: {
          fullName: {
            equals: name,
            mode: 'insensitive',
          }
        }
      });

      if (!dbPlayer) {
        // fallback: try contains to handle minor formatting differences
        const dbPlayerLoose = await prisma.player.findFirst({
          where: {
            fullName: {
              contains: name.split(' ')[0],
              mode: 'insensitive',
            }
          }
        });

        if (!dbPlayerLoose) {
          notFound.push(name);
          continue;
        }

        await prisma.fantasyRoster.upsert({
          where: {
            teamId_playerId: { teamId: team.id, playerId: dbPlayerLoose.nhlId }
          },
          update: { slotPosition: normalizeSlot(p.slotPosition) },
          create: { teamId: team.id, playerId: dbPlayerLoose.nhlId, slotPosition: normalizeSlot(p.slotPosition) }
        });
        added++;
        continue;
      }

      await prisma.fantasyRoster.upsert({
        where: {
          teamId_playerId: { teamId: team.id, playerId: dbPlayer.nhlId }
        },
        update: { slotPosition: normalizeSlot(p.slotPosition) },
        create: { teamId: team.id, playerId: dbPlayer.nhlId, slotPosition: normalizeSlot(p.slotPosition) }
      });
      added++;
    }

    return NextResponse.json({
      success: true,
      team: { id: team.id, name: team.teamName },
      added,
      notFound,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to add roster' },
      { status: 500 }
    );
  }
}

function normalizeSlot(slot: Slot): Slot {
  const s = String(slot || '').toUpperCase();
  if (s === 'IR') return 'IR';
  if (s === 'BN' || s === 'BENCH') return 'BN';
  if (s === 'UTIL' || s === 'FLEX') return 'UTIL';
  if (s === 'G') return 'G';
  if (s === 'D') return 'D';
  if (s === 'RW') return 'RW';
  if (s === 'LW') return 'LW';
  return 'C';
}


