/**
 * Bulk manual roster import from raw text
 *
 * POST /api/fantasy/manual-import
 * Body: {
 *   leagueName: string,
 *   season: string,
 *   rawText: string
 * }
 *
 * Heuristics:
 * - Detect team blocks by matching lines to existing team names in the league
 * - For all other lines, try to resolve as Player.fullName (case-insensitive)
 * - Ignore known labels (SLOT/PLAYER/ACQ/Empty/etc.)
 * - Insert as BN if no slot info provided
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const IGNORED_LINES = new Set([
  'slot', 'player', 'acq', 'draft', 'free agency', 'view team', 'propose trade', 'ir', 'empty'
]);

function normalizeLine(line: string): string {
  return line
    .replace(/\(.*?\)/g, '') // remove parentheticals
    .replace(/\b(C|LW|RW|D|G|UTIL|IR|BN|DTD|O)\b/gi, '') // remove slot/flags when standalone
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { leagueName, season, rawText } = body as {
      leagueName: string;
      season: string;
      rawText: string;
    };

    if (!leagueName || !season || !rawText) {
      return NextResponse.json(
        { error: 'leagueName, season, and rawText are required' },
        { status: 400 }
      );
    }

    const league = await prisma.fantasyLeague.findFirst({
      where: { platform: 'manual', leagueName, season }
    });

    if (!league) {
      return NextResponse.json(
        { error: `Manual league not found: ${leagueName} (${season})` },
        { status: 404 }
      );
    }

    const teams = await prisma.fantasyTeam.findMany({
      where: { leagueId: league.id },
      select: { id: true, teamName: true }
    });

    const nameToTeam = new Map<string, { id: string; teamName: string }>();
    for (const t of teams) nameToTeam.set(t.teamName.toLowerCase(), t);

    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    let currentTeam: { id: string; teamName: string } | null = null;
    const summary: Record<string, { added: number; notFound: string[] }> = {};

    for (const raw of lines) {
      const lower = raw.toLowerCase();
      if (nameToTeam.has(lower)) {
        currentTeam = nameToTeam.get(lower)!;
        if (!summary[currentTeam.teamName]) summary[currentTeam.teamName] = { added: 0, notFound: [] };
        continue;
      }

      if (!currentTeam) continue; // skip until a team header is found

      if (IGNORED_LINES.has(lower)) continue;
      if (/^(c|lw|rw|d|g|util|bench|ir)$/i.test(raw)) continue;
      if (/^[A-Z]{2,3}$/.test(raw)) continue; // team abbrev
      if (/^\d{1,2}-\d{1,2}-\d{1,2}$/.test(raw)) continue; // record line

      const name = normalizeLine(raw);
      if (!name || name.split(' ').length < 2) continue;

      // Try exact fullName match first
      let player = await prisma.player.findFirst({
        where: { fullName: { equals: name, mode: 'insensitive' } },
        select: { nhlId: true }
      });

      // Heuristic for duplicated names like "Leon DraisaitlLeon Draisaitl"
      if (!player && /(\b\w+\s+\w+).*(\1)/.test(name)) {
        const dedup = name.replace(/(\b\w+\s+\w+).*\1.*/i, '$1');
        player = await prisma.player.findFirst({
          where: { fullName: { equals: dedup, mode: 'insensitive' } },
          select: { nhlId: true }
        });
      }

      // Loose contains as last resort (may overmatch; acceptable for manual pass)
      if (!player) {
        const token = name.split(' ').slice(0, 2).join(' ');
        player = await prisma.player.findFirst({
          where: { fullName: { contains: token, mode: 'insensitive' } },
          select: { nhlId: true }
        });
      }

      if (!player) {
        summary[currentTeam.teamName].notFound.push(name);
        continue;
      }

      await prisma.fantasyRoster.upsert({
        where: { teamId_playerId: { teamId: currentTeam.id, playerId: player.nhlId } },
        update: { slotPosition: 'BN' },
        create: { teamId: currentTeam.id, playerId: player.nhlId, slotPosition: 'BN' }
      });

      summary[currentTeam.teamName].added += 1;
    }

    return NextResponse.json({ success: true, summary });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to bulk import manual rosters' },
      { status: 500 }
    );
  }
}


