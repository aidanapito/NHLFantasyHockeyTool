import { NextRequest, NextResponse } from 'next/server';
import {
  getTeamDefensiveRankings,
  getRosSosRankings,
  getOpponentQualityFeatures,
  getPlayerSosBoost,
  TeamSeasonStats,
  TeamScheduleStats,
} from '@/lib/strength-of-schedule';

/**
 * GET /api/strength-of-schedule
 * 
 * Get team strength of schedule rankings and opponent quality metrics.
 * 
 * Query params:
 * - type: 'defensive' | 'ros' | 'opponent' | 'player' (default: 'defensive')
 * - season: Season identifier (default: '20242025')
 * - team: Team abbreviation (required for type='opponent' or 'player')
 * - opponent: Opponent team (required for type='opponent' or 'player')
 * - asOfDate: Date to calculate stats up to (YYYY-MM-DD format, optional)
 * 
 * Response types:
 * - defensive: Team defensive rankings sorted by boom factor (easiest matchups first)
 * - ros: Rest-of-season strength of schedule rankings
 * - opponent: Opponent quality features for a specific matchup
 * - player: Complete SoS features for a player's upcoming game
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'defensive';
    const season = searchParams.get('season') || '20242025';
    const team = searchParams.get('team');
    const opponent = searchParams.get('opponent');
    const asOfDateStr = searchParams.get('asOfDate');

    const asOfDate = asOfDateStr ? new Date(asOfDateStr) : undefined;

    switch (type) {
      case 'defensive': {
        // Get team defensive rankings (boom factor order)
        const rankings = await getTeamDefensiveRankings(season, asOfDate);
        
        return NextResponse.json({
          success: true,
          type: 'defensive',
          season,
          asOfDate: asOfDate?.toISOString().split('T')[0] || 'current',
          description: 'Team defensive rankings sorted by boom factor (easiest matchups for opposing players first)',
          count: rankings.length,
          rankings: rankings.map((r, index) => ({
            rank: index + 1,
            team: r.team,
            gamesPlayed: r.defensive.gamesPlayed,
            goalsAgainstPerGame: r.defensive.goalsAgainstPerGame.toFixed(2),
            shotsAgainstPerGame: r.defensive.shotsAgainstPerGame.toFixed(2),
            defensiveRating: r.defensive.defensiveRating.toFixed(1),
            opponentBoomFactor: r.opponentBoomFactor.toFixed(1),
            goalsAgainstRank: r.defensive.goalsAgainstRank,
            // Friendly labels
            matchupDifficulty: r.opponentBoomFactor >= 70 
              ? 'Easy' 
              : r.opponentBoomFactor >= 40 
                ? 'Average' 
                : 'Hard',
          })),
        });
      }

      case 'ros': {
        // Get rest-of-season strength of schedule
        const rankings = await getRosSosRankings(season, asOfDate);
        
        return NextResponse.json({
          success: true,
          type: 'ros',
          season,
          asOfDate: asOfDate?.toISOString().split('T')[0] || 'current',
          description: 'Rest-of-season strength of schedule rankings (easiest remaining schedules first)',
          count: rankings.length,
          rankings: rankings.map(r => ({
            sosRank: r.sosRank,
            team: r.team,
            gamesRemaining: r.gamesRemaining,
            avgOppGoalsAgainst: r.avgOppGoalsAgainst.toFixed(2),
            avgOppBoomFactor: r.avgOppBoomFactor.toFixed(1),
            sosRating: r.sosRating.toFixed(1),
            easyGames: r.easyGamesCount,
            hardGames: r.hardGamesCount,
            // Schedule assessment
            scheduleAssessment: r.sosRating >= 60 
              ? 'Favorable' 
              : r.sosRating >= 40 
                ? 'Average' 
                : 'Difficult',
          })),
        });
      }

      case 'opponent': {
        // Get opponent quality for a specific matchup
        if (!opponent) {
          return NextResponse.json(
            { error: 'opponent parameter is required for type=opponent' },
            { status: 400 }
          );
        }

        const features = await getOpponentQualityFeatures(opponent, season, asOfDate);
        
        return NextResponse.json({
          success: true,
          type: 'opponent',
          season,
          opponent,
          asOfDate: asOfDate?.toISOString().split('T')[0] || 'current',
          features: {
            ...features,
            oppGoalsAgainstPerGame: features.oppGoalsAgainstPerGame.toFixed(2),
            oppShotsAgainstPerGame: features.oppShotsAgainstPerGame.toFixed(2),
            oppDefensiveRating: features.oppDefensiveRating.toFixed(1),
            oppBoomFactor: features.oppBoomFactor.toFixed(1),
          },
          analysis: {
            matchupQuality: features.oppIsWeakDefense 
              ? 'Favorable (weak defense)' 
              : features.oppIsStrongDefense 
                ? 'Difficult (strong defense)'
                : 'Average',
            boomPotential: features.oppBoomFactor >= 70 
              ? 'High - good chance for big games'
              : features.oppBoomFactor >= 40 
                ? 'Moderate'
                : 'Low - tough matchup',
            recommendation: features.oppBoomFactor >= 60
              ? 'Consider starting players against this team'
              : features.oppBoomFactor <= 30
                ? 'Consider sitting borderline players against this team'
                : 'Standard start/sit decisions apply',
          },
        });
      }

      case 'player': {
        // Get full SoS features for a player's upcoming game
        if (!team || !opponent) {
          return NextResponse.json(
            { error: 'team and opponent parameters are required for type=player' },
            { status: 400 }
          );
        }

        const features = await getPlayerSosBoost(team, opponent, season, asOfDate);
        
        return NextResponse.json({
          success: true,
          type: 'player',
          season,
          playerTeam: team,
          opponent,
          asOfDate: asOfDate?.toISOString().split('T')[0] || 'current',
          immediateGame: {
            opponent,
            ...features.opponent,
            oppGoalsAgainstPerGame: features.opponent.oppGoalsAgainstPerGame.toFixed(2),
            oppBoomFactor: features.opponent.oppBoomFactor.toFixed(1),
            matchupQuality: features.opponent.oppIsWeakDefense 
              ? 'Easy' 
              : features.opponent.oppIsStrongDefense 
                ? 'Hard'
                : 'Average',
          },
          restOfSeason: features.rosSchedule ? {
            sosRank: features.rosSchedule.sosRank,
            sosRating: features.rosSchedule.sosRating.toFixed(1),
            gamesRemaining: features.rosSchedule.gamesRemaining,
            easyGames: features.rosSchedule.easyGamesCount,
            hardGames: features.rosSchedule.hardGamesCount,
            avgOppBoomFactor: features.rosSchedule.avgOppBoomFactor.toFixed(1),
            scheduleOutlook: features.rosSchedule.sosRating >= 60 
              ? 'Favorable remaining schedule'
              : features.rosSchedule.sosRating >= 40 
                ? 'Average remaining schedule'
                : 'Difficult remaining schedule',
          } : null,
          recommendation: getPlayerRecommendation(features.opponent, features.rosSchedule),
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown type: ${type}. Valid types: defensive, ros, opponent, player` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('Error in strength-of-schedule API:', error);
    return NextResponse.json(
      { error: 'Failed to compute strength of schedule', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Generate a recommendation based on opponent quality and ROS schedule.
 */
function getPlayerRecommendation(
  opponent: { oppBoomFactor: number; oppIsWeakDefense: boolean; oppIsStrongDefense: boolean },
  rosSchedule: TeamScheduleStats | null
): string {
  const parts: string[] = [];

  // Immediate game analysis
  if (opponent.oppIsWeakDefense) {
    parts.push('🔥 Great matchup this game - opponent has weak defense, high boom potential');
  } else if (opponent.oppIsStrongDefense) {
    parts.push('⚠️ Tough matchup this game - opponent has strong defense');
  } else if (opponent.oppBoomFactor >= 60) {
    parts.push('✅ Good matchup this game - above-average boom potential');
  } else {
    parts.push('📊 Average matchup this game');
  }

  // ROS analysis
  if (rosSchedule) {
    if (rosSchedule.sosRating >= 65) {
      parts.push(`📈 Favorable ROS schedule (rank #${rosSchedule.sosRank}) with ${rosSchedule.easyGamesCount} easy games remaining`);
    } else if (rosSchedule.sosRating <= 35) {
      parts.push(`📉 Difficult ROS schedule (rank #${rosSchedule.sosRank}) with ${rosSchedule.hardGamesCount} hard games remaining`);
    }
  }

  return parts.join('. ') || 'No specific recommendation';
}


