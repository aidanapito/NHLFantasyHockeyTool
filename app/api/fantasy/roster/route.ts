import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// POST - Add player to fantasy team roster
export async function POST(request: NextRequest) {
  try {
    const { teamId, playerId, position } = await request.json();

    if (!teamId || !playerId || !position) {
      return NextResponse.json(
        { error: 'Team ID, player ID, and position are required' },
        { status: 400 }
      );
    }

    // Check if player is already on the team
    const existingRoster = await prisma.fantasyRoster.findUnique({
      where: {
        teamId_playerId: {
          teamId: String(teamId),
          playerId: parseInt(playerId)
        }
      }
    });

    if (existingRoster) {
      return NextResponse.json(
        { error: 'Player is already on this team' },
        { status: 400 }
      );
    }

    const rosterEntry = await prisma.fantasyRoster.create({
      data: {
        teamId: String(teamId),
        playerId: parseInt(playerId),
        position
      },
      include: {
        player: {
          include: {
            stats: {
              where: { season: '20252026', gameType: 'regular' },
              take: 1
            }
          }
        }
      }
    });

    return NextResponse.json(rosterEntry);
  } catch (error) {
    console.error('Error adding player to roster:', error);
    return NextResponse.json(
      { error: 'Failed to add player to roster' },
      { status: 500 }
    );
  }
}

// DELETE - Remove player from fantasy team roster
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');
    const playerId = searchParams.get('playerId');

    if (!teamId || !playerId) {
      return NextResponse.json(
        { error: 'Team ID and player ID are required' },
        { status: 400 }
      );
    }

    await prisma.fantasyRoster.delete({
      where: {
        teamId_playerId: {
          teamId: String(teamId),
          playerId: parseInt(playerId)
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing player from roster:', error);
    return NextResponse.json(
      { error: 'Failed to remove player from roster' },
      { status: 500 }
    );
  }
}
