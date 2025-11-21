import { NextRequest, NextResponse } from "next/server";

interface HistoricalStat {
  season: string;
  games_played: number;
  goals: number;
  assists: number;
  points: number;
}

interface FeatureImportanceRequest {
  player_id: number;
  historical_stats: HistoricalStat[];
}

// Calculate correlation coefficient
function correlation(x: number[], y: number[]): number {
  const n = x.length;
  if (n === 0) return 0;
  
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumXX = x.reduce((acc, xi) => acc + xi * xi, 0);
  const sumYY = y.reduce((acc, yi) => acc + yi * yi, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
  
  return denominator === 0 ? 0 : numerator / denominator;
}

// Calculate variance
function variance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
}

// Calculate trend strength
function trendStrength(values: number[]): number {
  if (values.length < 2) return 0;
  const x = values.map((_, i) => i);
  const corr = Math.abs(correlation(x, values));
  return corr;
}

// Calculate feature importance based on various metrics
function calculateFeatureImportance(stats: HistoricalStat[]): {
  [key: string]: {
    importance: number;
    description: string;
    metrics: {
      correlation_with_points?: number;
      variance?: number;
      trend_strength?: number;
      predictive_power?: number;
    };
  };
} {
  if (stats.length === 0) {
    return {};
  }

  // Extract features
  const goals = stats.map(s => s.goals);
  const assists = stats.map(s => s.assists);
  const points = stats.map(s => s.points);
  const gamesPlayed = stats.map(s => s.games_played);
  const seasons = stats.map((_, i) => i);

  // Calculate per-game rates
  const goalsPerGame = goals.map((g, i) => g / Math.max(gamesPlayed[i], 1));
  const assistsPerGame = assists.map((a, i) => a / Math.max(gamesPlayed[i], 1));
  const pointsPerGame = points.map((p, i) => p / Math.max(gamesPlayed[i], 1));

  // Calculate shooting percentage (simplified)
  const avgShotsPerGoal = 10; // Assume average
  const shootingPercentage = goals.map(g => g > 0 ? g / (g * avgShotsPerGoal) * 100 : 0);

  // Calculate consistency (inverse of coefficient of variation)
  const goalsConsistency = goals.length > 1 ? 1 / (Math.sqrt(variance(goals)) / (goals.reduce((a, b) => a + b, 0) / goals.length || 1)) : 0;
  const assistsConsistency = assists.length > 1 ? 1 / (Math.sqrt(variance(assists)) / (assists.reduce((a, b) => a + b, 0) / assists.length || 1)) : 0;

  // Feature importance calculations
  const features = {
    goals: {
      importance: 0.25,
      description: "Raw goal scoring ability - direct fantasy impact",
      metrics: {
        correlation_with_points: correlation(goals, points),
        variance: variance(goals),
        trend_strength: trendStrength(goals),
        predictive_power: Math.abs(correlation(goals, points)) * 0.4 + (1 - Math.min(1, Math.sqrt(variance(goals)) / 10)) * 0.3 + trendStrength(goals) * 0.3
      }
    },
    assists: {
      importance: 0.25,
      description: "Playmaking ability - consistent fantasy contributor",
      metrics: {
        correlation_with_points: correlation(assists, points),
        variance: variance(assists),
        trend_strength: trendStrength(assists),
        predictive_power: Math.abs(correlation(assists, points)) * 0.4 + (1 - Math.min(1, Math.sqrt(variance(assists)) / 15)) * 0.3 + trendStrength(assists) * 0.3
      }
    },
    goals_per_game: {
      importance: 0.15,
      description: "Goal scoring rate - accounts for games played",
      metrics: {
        correlation_with_points: correlation(goalsPerGame, pointsPerGame),
        variance: variance(goalsPerGame),
        trend_strength: trendStrength(goalsPerGame),
        predictive_power: Math.abs(correlation(goalsPerGame, pointsPerGame)) * 0.5 + (1 - Math.min(1, Math.sqrt(variance(goalsPerGame)) * 10)) * 0.5
      }
    },
    assists_per_game: {
      importance: 0.15,
      description: "Assist rate - normalized for ice time",
      metrics: {
        correlation_with_points: correlation(assistsPerGame, pointsPerGame),
        variance: variance(assistsPerGame),
        trend_strength: trendStrength(assistsPerGame),
        predictive_power: Math.abs(correlation(assistsPerGame, pointsPerGame)) * 0.5 + (1 - Math.min(1, Math.sqrt(variance(assistsPerGame)) * 10)) * 0.5
      }
    },
    games_played: {
      importance: 0.08,
      description: "Durability and availability - affects total production",
      metrics: {
        correlation_with_points: correlation(gamesPlayed, points),
        variance: variance(gamesPlayed),
        trend_strength: trendStrength(gamesPlayed),
        predictive_power: Math.abs(correlation(gamesPlayed, points)) * 0.6 + (1 - Math.min(1, Math.sqrt(variance(gamesPlayed)) / 20)) * 0.4
      }
    },
    consistency_goals: {
      importance: 0.05,
      description: "Goal scoring consistency - reliability factor",
      metrics: {
        predictive_power: Math.min(1, goalsConsistency)
      }
    },
    consistency_assists: {
      importance: 0.05,
      description: "Assist consistency - playmaking reliability",
      metrics: {
        predictive_power: Math.min(1, assistsConsistency)
      }
    },
    career_trend: {
      importance: 0.02,
      description: "Overall career trajectory - aging curve consideration",
      metrics: {
        trend_strength: (trendStrength(goals) + trendStrength(assists)) / 2,
        predictive_power: (trendStrength(goals) + trendStrength(assists)) / 2
      }
    }
  };

  // Normalize importance scores to sum to 1
  const totalImportance = Object.values(features).reduce((sum, feature) => sum + feature.importance, 0);
  Object.values(features).forEach(feature => {
    feature.importance = feature.importance / totalImportance;
  });

  // Round values for readability
  Object.values(features).forEach(feature => {
    feature.importance = Math.round(feature.importance * 1000) / 1000;
    Object.keys(feature.metrics).forEach(key => {
      if (typeof feature.metrics[key] === 'number') {
        feature.metrics[key] = Math.round(feature.metrics[key] * 1000) / 1000;
      }
    });
  });

  return features;
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/ml-projections/features",
    method: "POST", 
    description: "Analyze feature importance for ML model predictions",
    required_fields: {
      player_id: "number",
      historical_stats: "array of {season, games_played, goals, assists, points}"
    },
    example: {
      player_id: 1,
      historical_stats: [
        {"season": "20222023", "games_played": 82, "goals": 30, "assists": 40, "points": 70},
        {"season": "20232024", "games_played": 80, "goals": 35, "assists": 45, "points": 80}
      ]
    },
    features_analyzed: [
      "goals", "assists", "goals_per_game", "assists_per_game", 
      "games_played", "consistency_goals", "consistency_assists", "career_trend"
    ]
  });
}

export async function POST(request: NextRequest) {
  try {
    const body: FeatureImportanceRequest = await request.json();
    
    if (!body.player_id || !Array.isArray(body.historical_stats)) {
      return NextResponse.json(
        { error: "Invalid request format" },
        { status: 400 }
      );
    }

    const features = calculateFeatureImportance(body.historical_stats);
    
    // Sort features by importance
    const sortedFeatures = Object.entries(features)
      .sort(([, a], [, b]) => b.importance - a.importance)
      .reduce((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {} as typeof features);

    // Calculate summary statistics
    const stats = body.historical_stats;
    const summary = {
      total_seasons: stats.length,
      avg_goals: stats.reduce((sum, s) => sum + s.goals, 0) / stats.length || 0,
      avg_assists: stats.reduce((sum, s) => sum + s.assists, 0) / stats.length || 0,
      avg_points: stats.reduce((sum, s) => sum + s.points, 0) / stats.length || 0,
      avg_games: stats.reduce((sum, s) => sum + s.games_played, 0) / stats.length || 0,
      goal_variance: variance(stats.map(s => s.goals)),
      assist_variance: variance(stats.map(s => s.assists)),
      most_important_feature: Object.keys(sortedFeatures)[0] || "unknown"
    };

    // Round summary values
    Object.keys(summary).forEach(key => {
      if (typeof summary[key] === 'number') {
        summary[key] = Math.round(summary[key] * 100) / 100;
      }
    });

    const response = {
      player_id: body.player_id,
      feature_importance: sortedFeatures,
      summary_statistics: summary,
      interpretation: {
        high_importance: "Features with importance > 0.15 are primary drivers of performance",
        medium_importance: "Features with importance 0.05-0.15 provide valuable context",
        low_importance: "Features with importance < 0.05 are minor factors",
        recommendation: summary.most_important_feature === 'goals' 
          ? "Focus on goal-scoring trends for this player"
          : summary.most_important_feature === 'assists'
          ? "Focus on playmaking ability for this player"
          : "Consider multiple factors for balanced projection"
      }
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error in feature importance calculation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
