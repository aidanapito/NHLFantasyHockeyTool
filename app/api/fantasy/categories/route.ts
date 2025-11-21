import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  return NextResponse.json({ message: 'Coming soon' })
}
S = [
  'goals', 'assists', 'plusMinus', 'pim', 'powerPlayPoints', 
  'faceoffsWon', 'shotsOnGoal', 'hits', 'blockedShots', 
  'wins', 'shutouts', 'gaa', 'savePct'
];

interface CategoryScore {
  category: string;
  total: number;
  average: number;
  rank: number;
}

interface TeamAnalysis {
  teamId: number;
  teamName: string;
  ownerName: string;
  categories: CategoryScore[];
  totalScore: number;
  players: Array<{
    name: string;
    position: string;
    team: string;
    stats: any;
    categoryContributions: Record<string, number>;
  }>;
}

// GET - Calculate category scores for fantasy teams
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const season = searchParams.get('season') || '20252026';
    const teamId = searchParams.get('teamId');

    // Get all fantasy teams with their rosters and player stats
    const teams = await prisma.fantasyTeam.findMany({
      where: teamId ? { id: parseInt(teamId) } : undefined,
      include: {
        roster: {
          include: {
            player: {
              include: {
                stats: {
                  where: { season, gameType: 'regular' },
                  take: 1
                }
              }
            }
          }
        }
      }
    });

    const teamAnalyses: TeamAnalysis[] = [];

    for (const team of teams) {
      const teamAnalysis: TeamAnalysis = {
        teamId: team.id,
        teamName: team.name,
        ownerName: team.ownerName,
        categories: [],
        totalScore: 0,
        players: []
      };

      // Calculate totals for each category
      const categoryTotals: Record<string, number> = {};
      FANTASY_CATEGORIES.forEach(cat => categoryTotals[cat] = 0);

      for (const rosterEntry of team.roster) {
        const player = rosterEntry.player;
        const stats = player.stats[0];
        
        if (!stats) continue;

        const playerContributions: Record<string, number> = {};

        // Calculate category contributions
        playerContributions.goals = stats.goals || 0;
        playerContributions.assists = stats.assists || 0;
        playerContributions.plusMinus = stats.plusMinus || 0;
        playerContributions.pim = stats.pim || 0;
        playerContributions.powerPlayPoints = stats.powerPlayPoints || 0;
        playerContributions.faceoffsWon = stats.faceoffsWon || 0;
        playerContributions.shotsOnGoal = stats.shotsOnGoal || 0;
        playerContributions.hits = stats.hits || 0;
        playerContributions.blockedShots = stats.blockedShots || 0;
        
        // Goalie stats (only count for goalies)
        if (player.position === 'G') {
          playerContributions.wins = stats.wins || 0;
          playerContributions.shutouts = stats.shutouts || 0;
          playerContributions.gaa = stats.gaa || 0;
          playerContributions.savePct = stats.savePct || 0;
        } else {
          playerContributions.wins = 0;
          playerContributions.shutouts = 0;
          playerContributions.gaa = 0;
          playerContributions.savePct = 0;
        }

        // Add to team totals
        Object.keys(playerContributions).forEach(cat => {
          categoryTotals[cat] += playerContributions[cat];
        });

        teamAnalysis.players.push({
          name: `${player.firstName} ${player.lastName}`,
          position: player.position,
          team: player.team,
          stats,
          categoryContributions: playerContributions
        });
      }

      // Create category scores
      FANTASY_CATEGORIES.forEach(category => {
        teamAnalysis.categories.push({
          category,
          total: categoryTotals[category],
          average: 0, // Will calculate after getting all teams
          rank: 0 // Will calculate after getting all teams
        });
      });

      teamAnalyses.push(teamAnalysis);
    }

    // Calculate averages and rankings across all teams
    FANTASY_CATEGORIES.forEach((category, index) => {
      const categoryValues = teamAnalyses.map(team => team.categories[index].total);
      const avg = categoryValues.reduce((sum, val) => sum + val, 0) / categoryValues.length;
      
      // Sort teams by this category (descending for most, ascending for GAA)
      const sortedTeams = teamAnalyses.sort((a, b) => {
        const aVal = a.categories[index].total;
        const bVal = b.categories[index].total;
        
        // GAA is better when lower, so reverse sort
        if (category === 'gaa') {
          return aVal - bVal;
        }
        return bVal - aVal;
      });

      // Assign ranks and update averages
      sortedTeams.forEach((team, rank) => {
        const catIndex = team.categories.findIndex(c => c.category === category);
        team.categories[catIndex].average = avg;
        team.categories[catIndex].rank = rank + 1;
        
        // Calculate total score (sum of category ranks, lower is better)
        team.totalScore += rank + 1;
      });
    });

    // Sort teams by total score (lower is better)
    teamAnalyses.sort((a, b) => a.totalScore - b.totalScore);

    return NextResponse.json({
      teams: teamAnalyses,
      categories: FANTASY_CATEGORIES,
      season
    });

  } catch (error) {
    console.error('Error calculating category scores:', error);
    return NextResponse.json(
      { error: 'Failed to calculate category scores' },
      { status: 500 }
    );
  }
}
