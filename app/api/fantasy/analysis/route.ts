import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Close Prisma connection on server shutdown to prevent memory leaks
process.on('beforeExit', async () => {
  memoryMonitor.stopMonitoring();
  await prisma.$disconnect();
});

// Draft results data
const draftResults = {
  "On the Hutson": [
    { player: "Connor Hellebuyck", team: "Wpg", position: "G", round: 1, pick: 3 },
    { player: "Kyle Connor", team: "Wpg", position: "LW", round: 2, pick: 18 },
    { player: "Artemi Panarin", team: "NYR", position: "LW", round: 3, pick: 23 },
    { player: "Adrian Kempe", team: "LA", position: "RW", round: 4, pick: 38 },
    { player: "Dustin Wolf", team: "Cgy", position: "G", round: 5, pick: 43 },
    { player: "Zach Werenski", team: "CBJ", position: "D", round: 6, pick: 58 },
    { player: "Dylan Larkin", team: "Det", position: "C", round: 7, pick: 63 },
    { player: "Bo Horvat", team: "NYI", position: "C", round: 8, pick: 78 },
    { player: "Alex Tuch", team: "Buf", position: "RW", round: 9, pick: 83 },
    { player: "Lane Hutson", team: "Mon", position: "D", round: 10, pick: 98 },
    { player: "Tomas Hertl", team: "VGK", position: "C", round: 11, pick: 103 },
    { player: "Nikolaj Ehlers", team: "Car", position: "LW", round: 12, pick: 118 },
    { player: "Dylan Strome", team: "Wsh", position: "C", round: 13, pick: 123 },
    { player: "Drake Batherson", team: "Ott", position: "RW", round: 14, pick: 138 },
    { player: "Ryan O'Reilly", team: "Nsh", position: "C", round: 15, pick: 143 },
    { player: "Radko Gudas", team: "Ana", position: "D", round: 16, pick: 158 },
    { player: "Evander Kane", team: "Van", position: "LW", round: 17, pick: 163 },
    { player: "Devon Toews", team: "Col", position: "D", round: 18, pick: 178 }
  ],
  // Add other teams here if needed
};

interface PlayerAnalysis {
  player: string;
  team: string;
  position: string;
  draftRound: number;
  draftPick: number;
  expectedValue: number;
  actualZScore: number;
  valueDifference: number;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  stats?: {
    gamesPlayed: number;
    goals: number;
    assists: number;
    points: number;
    plusMinus: number;
    hits: number;
    blockedShots: number;
    wins?: number;
    gaa?: number;
    savePct?: number;
  };
}

interface TeamAnalysis {
  teamName: string;
  players: PlayerAnalysis[];
  avgExpectedValue: number;
  avgActualValue: number;
  teamStrength: number;
  summary: string;
}

function calculatePlayerZScore(stats: any, position: string): number {
  if (position === 'G') {
    // Goalie metrics: save percentage, GAA, wins
    const savePctZ = (stats.savePct - 0.91) / 0.03; // Assuming 91% average
    const gaaZ = (2.5 - stats.gaa) / 0.5; // Lower GAA is better
    const winsZ = (stats.wins - 15) / 10; // Assuming 15 wins average
    return (savePctZ + gaaZ + winsZ) / 3;
  } else {
    // Skater metrics: points, plus/minus, hits, blocks
    const pointsZ = (stats.points - 40) / 20; // Assuming 40 points average
    const plusMinusZ = stats.plusMinus / 10; // Plus/minus
    const hitsZ = (stats.hits - 50) / 30; // Assuming 50 hits average
    const blocksZ = (stats.blockedShots - 30) / 20; // Assuming 30 blocks average
    return (pointsZ * 2 + plusMinusZ + hitsZ + blocksZ) / 5;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const teamName = searchParams.get('team') || 'On the Hutson';
    
    console.log(`🔍 Starting analysis for team: ${teamName}`);

    const draftData = draftResults[teamName as keyof typeof draftResults];
    if (!draftData) {
      return NextResponse.json(
        { error: `No draft data found for team: ${teamName}` },
        { status: 404 }
      );
    }

    const analysis: PlayerAnalysis[] = [];

    for (const draftPlayer of draftData) {
      // Find the player in the database with optimized query
      const player = await prisma.player.findFirst({
        where: {
          OR: [
            {
              firstName: {
                contains: draftPlayer.player.split(' ')[0]
              },
              lastName: {
                contains: draftPlayer.player.split(' ').slice(1).join(' ')
              }
            },
            {
              firstName: {
                contains: draftPlayer.player
              }
            },
            {
              lastName: {
                contains: draftPlayer.player
              }
            }
          ]
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          position: true,
          stats: {
            where: { season: '20252026', gameType: 'regular' },
            take: 1,
            select: {
              gamesPlayed: true,
              goals: true,
              assists: true,
              points: true,
              plusMinus: true,
              hits: true,
              blockedShots: true,
              wins: true,
              gaa: true,
              savePct: true
            }
          }
        }
      });

      if (player && player.stats[0]) {
        const stats = player.stats[0];
        
        // Calculate expected value based on draft position (1-180 scale)
        // Early picks should have higher expected value
        const expectedValue = (181 - draftPlayer.pick) / 180 * 2 - 1; // Scale to -1 to 1
        
        // Calculate actual z-score based on performance
        let actualZScore = calculatePlayerZScore(stats, draftPlayer.position);
        
        // Cap z-scores between -2 and 2
        actualZScore = Math.max(-2, Math.min(2, actualZScore));
        
        const valueDifference = actualZScore - expectedValue;
        
        let recommendation: 'BUY' | 'SELL' | 'HOLD';
        if (valueDifference > 0.3) {
          recommendation = 'BUY';
        } else if (valueDifference < -0.3) {
          recommendation = 'SELL';
        } else {
          recommendation = 'HOLD';
        }
        
        analysis.push({
          player: draftPlayer.player,
          team: draftPlayer.team,
          position: draftPlayer.position,
          draftRound: draftPlayer.round,
          draftPick: draftPlayer.pick,
          expectedValue,
          actualZScore,
          valueDifference,
          recommendation,
          stats: {
            gamesPlayed: stats.gamesPlayed,
            goals: stats.goals,
            assists: stats.assists,
            points: stats.points,
            plusMinus: stats.plusMinus,
            hits: stats.hits,
            blockedShots: stats.blockedShots,
            wins: stats.wins || undefined,
            gaa: stats.gaa || undefined,
            savePct: stats.savePct || undefined
          }
        });
      }
    }

    // Sort by value difference (most undervalued first)
    analysis.sort((a, b) => b.valueDifference - a.valueDifference);

    // Calculate team metrics with safe division
    const avgExpectedValue = analysis.length > 0 ? analysis.reduce((sum, p) => sum + p.expectedValue, 0) / analysis.length : 0;
    const avgActualValue = analysis.length > 0 ? analysis.reduce((sum, p) => sum + p.actualZScore, 0) / analysis.length : 0;
    const teamStrength = avgActualValue - avgExpectedValue;
    
    let summary = '';
    if (analysis.length === 0) {
      summary = 'No players found for this team.';
    } else if (teamStrength > 0.1) {
      summary = 'Your team is performing ABOVE expectations!';
    } else if (teamStrength < -0.1) {
      summary = 'Your team is performing BELOW expectations. Consider trades.';
    } else {
      summary = 'Your team is performing as expected.';
    }

    const teamAnalysis: TeamAnalysis = {
      teamName,
      players: analysis,
      avgExpectedValue,
      avgActualValue,
      teamStrength,
      summary
    };

    console.log(`✅ Analysis completed for team: ${teamName}`);
    return NextResponse.json(teamAnalysis);
  } catch (error) {
    console.error('❌ Error analyzing fantasy team:', error);
    return NextResponse.json(
      { error: 'Failed to analyze fantasy team' },
      { status: 500 }
    );
  }
}
