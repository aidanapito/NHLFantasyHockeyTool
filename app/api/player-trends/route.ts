import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const playerId = searchParams.get('playerId');
    const nhlId = searchParams.get('nhlId');
    const gameType = searchParams.get('gameType') || 'regular';

    if (!playerId && !nhlId) {
      return NextResponse.json({ error: 'Player ID or NHL ID is required' }, { status: 400 });
    }

    // Find the player
    let player;
    if (playerId) {
      player = await prisma.player.findUnique({ where: { id: parseInt(playerId) } });
    } else if (nhlId) {
      player = await prisma.player.findUnique({ where: { nhlId: parseInt(nhlId) } });
    }

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // Get all player stats across seasons
    const historicalStats = await prisma.playerStats.findMany({
      where: {
        playerId: player.id,
        gameType,
      },
      orderBy: {
        season: 'asc',
      },
    });

    if (historicalStats.length === 0) {
      return NextResponse.json({
        player,
        trends: [],
        zScores: [],
        message: 'No historical data available for this player',
      });
    }

    // Calculate z-scores for each stat category across all seasons
    const calculateZScore = (value: number, mean: number, stdDev: number): number => {
      if (stdDev === 0) return 0;
      return (value - mean) / stdDev;
    };

    const calculateStats = (values: number[]) => {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);
      return { mean, stdDev };
    };

    // Prepare data for each season
    const trends = historicalStats.map(stat => {
      const pointsPerGame = stat.gamesPlayed > 0 ? stat.points / stat.gamesPlayed : 0;
      const goalsPerGame = stat.gamesPlayed > 0 ? stat.goals / stat.gamesPlayed : 0;
      const assistsPerGame = stat.gamesPlayed > 0 ? stat.assists / stat.gamesPlayed : 0;
      const shotsPerGame = stat.gamesPlayed > 0 ? stat.shotsOnGoal / stat.gamesPlayed : 0;

      return {
        season: stat.season,
        gamesPlayed: stat.gamesPlayed,
        goals: stat.goals,
        assists: stat.assists,
        points: stat.points,
        plusMinus: stat.plusMinus,
        pim: stat.pim,
        powerPlayGoals: stat.powerPlayGoals,
        powerPlayPoints: stat.powerPlayPoints,
        shotsOnGoal: stat.shotsOnGoal,
        shootingPct: stat.shootingPct,
        pointsPerGame,
        goalsPerGame,
        assistsPerGame,
        shotsPerGame,
        hits: stat.hits,
        blockedShots: stat.blockedShots,
        takeaways: stat.takeaways,
        giveaways: stat.giveaways,
      };
    });

    // Calculate z-scores for key metrics
    const allGoals = trends.map(t => t.goals);
    const allAssists = trends.map(t => t.assists);
    const allPoints = trends.map(t => t.points);
    const allPPG = trends.map(t => t.pointsPerGame);
    const allPlusMinus = trends.map(t => t.plusMinus);
    const allShots = trends.map(t => t.shotsOnGoal);

    const goalsStats = calculateStats(allGoals);
    const assistsStats = calculateStats(allAssists);
    const pointsStats = calculateStats(allPoints);
    const ppgStats = calculateStats(allPPG);
    const plusMinusStats = calculateStats(allPlusMinus);
    const shotsStats = calculateStats(allShots);

    const zScores = trends.map(stat => ({
      season: stat.season,
      goalsZ: calculateZScore(stat.goals, goalsStats.mean, goalsStats.stdDev),
      assistsZ: calculateZScore(stat.assists, assistsStats.mean, assistsStats.stdDev),
      pointsZ: calculateZScore(stat.points, pointsStats.mean, pointsStats.stdDev),
      ppgZ: calculateZScore(stat.pointsPerGame, ppgStats.mean, ppgStats.stdDev),
      plusMinusZ: calculateZScore(stat.plusMinus, plusMinusStats.mean, plusMinusStats.stdDev),
      shotsZ: calculateZScore(stat.shotsOnGoal, shotsStats.mean, shotsStats.stdDev),
      // Overall composite z-score (average of key metrics)
      overallZ: (
        calculateZScore(stat.points, pointsStats.mean, pointsStats.stdDev) +
        calculateZScore(stat.pointsPerGame, ppgStats.mean, ppgStats.stdDev) +
        calculateZScore(stat.plusMinus, plusMinusStats.mean, plusMinusStats.stdDev)
      ) / 3,
    }));

    // Calculate career summary
    const totalGames = trends.reduce((sum, t) => sum + t.gamesPlayed, 0);
    const totalGoals = trends.reduce((sum, t) => sum + t.goals, 0);
    const totalAssists = trends.reduce((sum, t) => sum + t.assists, 0);
    const totalPoints = trends.reduce((sum, t) => sum + t.points, 0);
    const careerPPG = totalGames > 0 ? totalPoints / totalGames : 0;

    const summary = {
      totalSeasons: trends.length,
      totalGames,
      totalGoals,
      totalAssists,
      totalPoints,
      careerPPG: parseFloat(careerPPG.toFixed(3)),
      bestSeason: trends.reduce((best, current) => 
        current.points > best.points ? current : best, trends[0]
      ),
      peakPerformance: zScores.reduce((peak, current) =>
        current.overallZ > peak.overallZ ? current : peak, zScores[0]
      ),
    };

    return NextResponse.json({
      player: {
        id: player.id,
        nhlId: player.nhlId,
        firstName: player.firstName,
        lastName: player.lastName,
        position: player.position,
        team: player.team,
        headshot: player.headshot,
      },
      trends,
      zScores,
      summary,
    });
  } catch (error: any) {
    console.error('Error fetching player trends:', error);
    return NextResponse.json({ error: 'Failed to fetch player trends', details: error.message }, { status: 500 });
  }
}

