import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Helper function to calculate z-score
function calculateZScore(value: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  return (value - mean) / stdDev;
}

// Helper function to calculate mean
function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

// Helper function to calculate standard deviation
function calculateStdDev(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

interface CategoryWeights {
  goals: number;
  assists: number;
  plusMinus: number;
  pim: number;
  powerPlayPoints: number;
  faceoffsWon: number;
  shotsOnGoal: number;
  hits: number;
  blockedShots: number;
  wins: number;
  shutouts: number;
  gaa: number;
  savePct: number;
}

const DEFAULT_WEIGHTS: CategoryWeights = {
  goals: 1.0,
  assists: 1.0,
  plusMinus: 0.5,
  pim: 0.3,
  powerPlayPoints: 0.8,
  faceoffsWon: 0.4,
  shotsOnGoal: 0.3,
  hits: 0.4,
  blockedShots: 0.5,
  wins: 1.2,
  shutouts: 1.5,
  gaa: 1.0,
  savePct: 1.2,
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const season = searchParams.get('season') || '20252026';
    const minGames = parseInt(searchParams.get('minGames') || '5');
    const position = searchParams.get('position') || 'all'; // 'all', 'skater', 'goalie'
    
    // Parse custom weights if provided
    const customWeights: Partial<CategoryWeights> = {};
    for (const key of Object.keys(DEFAULT_WEIGHTS)) {
      const weight = searchParams.get(key);
      if (weight !== null) {
        customWeights[key as keyof CategoryWeights] = parseFloat(weight);
      }
    }
    const weights = { ...DEFAULT_WEIGHTS, ...customWeights };

    // Fetch all players with stats for the season
    const players = await prisma.player.findMany({
      where: {
        isActive: true,
        stats: {
          some: {
            season: season,
            gameType: 'regular',
            gamesPlayed: { gte: minGames }
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
    });

    // Separate skaters and goalies
    const skaters = players.filter(p => p.position !== 'G');
    const goalies = players.filter(p => p.position === 'G');

    // Calculate statistics for normalization (skaters)
    const skaterStats = {
      goals: skaters.map(p => p.stats[0]?.goals || 0),
      assists: skaters.map(p => p.stats[0]?.assists || 0),
      plusMinus: skaters.map(p => p.stats[0]?.plusMinus || 0),
      pim: skaters.map(p => p.stats[0]?.pim || 0),
      powerPlayPoints: skaters.map(p => p.stats[0]?.powerPlayPoints || 0),
      faceoffsWon: skaters.map(p => p.stats[0]?.faceoffsWon || 0),
      shotsOnGoal: skaters.map(p => p.stats[0]?.shotsOnGoal || 0),
      hits: skaters.map(p => p.stats[0]?.hits || 0),
      blockedShots: skaters.map(p => p.stats[0]?.blockedShots || 0),
    };

    // Calculate means and standard deviations for skaters
    const skaterMeans = {
      goals: calculateMean(skaterStats.goals),
      assists: calculateMean(skaterStats.assists),
      plusMinus: calculateMean(skaterStats.plusMinus),
      pim: calculateMean(skaterStats.pim),
      powerPlayPoints: calculateMean(skaterStats.powerPlayPoints),
      faceoffsWon: calculateMean(skaterStats.faceoffsWon),
      shotsOnGoal: calculateMean(skaterStats.shotsOnGoal),
      hits: calculateMean(skaterStats.hits),
      blockedShots: calculateMean(skaterStats.blockedShots),
    };

    const skaterStdDevs = {
      goals: calculateStdDev(skaterStats.goals, skaterMeans.goals),
      assists: calculateStdDev(skaterStats.assists, skaterMeans.assists),
      plusMinus: calculateStdDev(skaterStats.plusMinus, skaterMeans.plusMinus),
      pim: calculateStdDev(skaterStats.pim, skaterMeans.pim),
      powerPlayPoints: calculateStdDev(skaterStats.powerPlayPoints, skaterMeans.powerPlayPoints),
      faceoffsWon: calculateStdDev(skaterStats.faceoffsWon, skaterMeans.faceoffsWon),
      shotsOnGoal: calculateStdDev(skaterStats.shotsOnGoal, skaterMeans.shotsOnGoal),
      hits: calculateStdDev(skaterStats.hits, skaterMeans.hits),
      blockedShots: calculateStdDev(skaterStats.blockedShots, skaterMeans.blockedShots),
    };

    // Calculate statistics for normalization (goalies)
    const goalieStats = {
      wins: goalies.map(p => p.stats[0]?.wins || 0),
      shutouts: goalies.map(p => p.stats[0]?.shutouts || 0),
      gaa: goalies.map(p => p.stats[0]?.gaa || 0),
      savePct: goalies.map(p => p.stats[0]?.savePct || 0),
    };

    const goalieMeans = {
      wins: calculateMean(goalieStats.wins),
      shutouts: calculateMean(goalieStats.shutouts),
      gaa: calculateMean(goalieStats.gaa),
      savePct: calculateMean(goalieStats.savePct),
    };

    const goalieStdDevs = {
      wins: calculateStdDev(goalieStats.wins, goalieMeans.wins),
      shutouts: calculateStdDev(goalieStats.shutouts, goalieMeans.shutouts),
      gaa: calculateStdDev(goalieStats.gaa, goalieMeans.gaa),
      savePct: calculateStdDev(goalieStats.savePct, goalieMeans.savePct),
    };

    // Calculate player values
    const rankedPlayers = players.map(player => {
      const stats = player.stats[0];
      if (!stats) return null;

      const isGoalie = player.position === 'G';
      let totalValue = 0;
      const categoryValues: { [key: string]: number } = {};

      if (isGoalie) {
        // Goalie value calculation
        const winsZ = calculateZScore(stats.wins || 0, goalieMeans.wins, goalieStdDevs.wins);
        const shutoutsZ = calculateZScore(stats.shutouts || 0, goalieMeans.shutouts, goalieStdDevs.shutouts);
        // For GAA, lower is better, so we invert the z-score
        const gaaZ = -calculateZScore(stats.gaa || 0, goalieMeans.gaa, goalieStdDevs.gaa);
        const savePctZ = calculateZScore(stats.savePct || 0, goalieMeans.savePct, goalieStdDevs.savePct);

        categoryValues.wins = winsZ * weights.wins;
        categoryValues.shutouts = shutoutsZ * weights.shutouts;
        categoryValues.gaa = gaaZ * weights.gaa;
        categoryValues.savePct = savePctZ * weights.savePct;

        totalValue = categoryValues.wins + categoryValues.shutouts + categoryValues.gaa + categoryValues.savePct;
      } else {
        // Skater value calculation
        const goalsZ = calculateZScore(stats.goals || 0, skaterMeans.goals, skaterStdDevs.goals);
        const assistsZ = calculateZScore(stats.assists || 0, skaterMeans.assists, skaterStdDevs.assists);
        const plusMinusZ = calculateZScore(stats.plusMinus || 0, skaterMeans.plusMinus, skaterStdDevs.plusMinus);
        const pimZ = calculateZScore(stats.pim || 0, skaterMeans.pim, skaterStdDevs.pim);
        const pppZ = calculateZScore(stats.powerPlayPoints || 0, skaterMeans.powerPlayPoints, skaterStdDevs.powerPlayPoints);
        const fowZ = calculateZScore(stats.faceoffsWon || 0, skaterMeans.faceoffsWon, skaterStdDevs.faceoffsWon);
        const sogZ = calculateZScore(stats.shotsOnGoal || 0, skaterMeans.shotsOnGoal, skaterStdDevs.shotsOnGoal);
        const hitsZ = calculateZScore(stats.hits || 0, skaterMeans.hits, skaterStdDevs.hits);
        const blksZ = calculateZScore(stats.blockedShots || 0, skaterMeans.blockedShots, skaterStdDevs.blockedShots);

        categoryValues.goals = goalsZ * weights.goals;
        categoryValues.assists = assistsZ * weights.assists;
        categoryValues.plusMinus = plusMinusZ * weights.plusMinus;
        categoryValues.pim = pimZ * weights.pim;
        categoryValues.powerPlayPoints = pppZ * weights.powerPlayPoints;
        categoryValues.faceoffsWon = fowZ * weights.faceoffsWon;
        categoryValues.shotsOnGoal = sogZ * weights.shotsOnGoal;
        categoryValues.hits = hitsZ * weights.hits;
        categoryValues.blockedShots = blksZ * weights.blockedShots;

        totalValue = Object.values(categoryValues).reduce((sum, val) => sum + val, 0);
      }

      return {
        id: player.id,
        name: `${player.firstName} ${player.lastName}`,
        team: player.team,
        position: player.position,
        jerseyNumber: player.jerseyNumber,
        gamesPlayed: stats.gamesPlayed,
        totalValue: parseFloat(totalValue.toFixed(2)),
        categoryValues: Object.fromEntries(
          Object.entries(categoryValues).map(([key, value]) => [key, parseFloat(value.toFixed(2))])
        ),
        stats: {
          goals: stats.goals || 0,
          assists: stats.assists || 0,
          points: stats.points || 0,
          plusMinus: stats.plusMinus || 0,
          pim: stats.pim || 0,
          powerPlayPoints: stats.powerPlayPoints || 0,
          faceoffsWon: stats.faceoffsWon || 0,
          shotsOnGoal: stats.shotsOnGoal || 0,
          hits: stats.hits || 0,
          blockedShots: stats.blockedShots || 0,
          wins: stats.wins || 0,
          shutouts: stats.shutouts || 0,
          gaa: stats.gaa || 0,
          savePct: stats.savePct || 0,
        }
      };
    }).filter(p => p !== null);

    // Filter by position if specified
    let filteredPlayers = rankedPlayers;
    if (position === 'skater') {
      filteredPlayers = rankedPlayers.filter(p => p!.position !== 'G');
    } else if (position === 'goalie') {
      filteredPlayers = rankedPlayers.filter(p => p!.position === 'G');
    }

    // Sort by total value
    filteredPlayers.sort((a, b) => b!.totalValue - a!.totalValue);

    return NextResponse.json({
      players: filteredPlayers,
      weights: weights,
      season: season,
      minGames: minGames,
      totalPlayers: filteredPlayers.length,
      normalizationStats: {
        skaters: {
          means: skaterMeans,
          stdDevs: skaterStdDevs
        },
        goalies: {
          means: goalieMeans,
          stdDevs: goalieStdDevs
        }
      }
    });
  } catch (error) {
    console.error('Error calculating player values:', error);
    return NextResponse.json(
      { error: 'Failed to calculate player values', details: (error as Error).message },
      { status: 500 }
    );
  }
}

