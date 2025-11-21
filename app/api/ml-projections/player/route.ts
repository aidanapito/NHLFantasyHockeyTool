import { NextRequest, NextResponse } from "next/server";

interface HistoricalStat {
  season: string;
  games_played: number;
  goals: number;
  assists: number;
  points: number;
}

interface ProjectionRequest {
  player_id: number;
  historical_stats: HistoricalStat[];
}

interface ProjectionResponse {
  player_id: number;
  projected_goals: number;
  projected_assists: number;
  projected_points: number;
  confidence: number;
  model_used: string;
  individual_predictions: {
    [key: string]: {
      goals: number;
      assists: number;
      points: number;
    };
  };
}

// Simple Linear Regression implementation
function linearRegression(x: number[], y: number[]): { slope: number; intercept: number } {
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumXX = x.reduce((acc, xi) => acc + xi * xi, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

// Weighted moving average
function weightedAverage(values: number[], weights: number[]): number {
  const weightedSum = values.reduce((acc, val, i) => acc + val * weights[i], 0);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  return weightedSum / totalWeight;
}

// Calculate trend
function calculateTrend(values: number[]): number {
  if (values.length < 2) return 0;
  const x = values.map((_, i) => i);
  const { slope } = linearRegression(x, values);
  return slope;
}

// Calculate volatility (standard deviation)
function calculateVolatility(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

// Enhanced projection algorithm
function enhancedProjection(stats: HistoricalStat[]): {
  goals: number;
  assists: number;
  points: number;
  confidence: number;
} {
  if (stats.length === 0) {
    return { goals: 0, assists: 0, points: 0, confidence: 0 };
  }

  // Extract data
  const goals = stats.map(s => s.goals);
  const assists = stats.map(s => s.assists);
  const points = stats.map(s => s.points);
  const gamesPlayed = stats.map(s => s.games_played);

  // Calculate per-game rates
  const goalsPerGame = goals.map((g, i) => g / Math.max(gamesPlayed[i], 1));
  const assistsPerGame = assists.map((a, i) => a / Math.max(gamesPlayed[i], 1));

  // Create weights (more recent seasons get higher weight)
  const weights = stats.map((_, i) => Math.pow(1.2, i));

  // Weighted averages
  const avgGoalsPerGame = weightedAverage(goalsPerGame, weights);
  const avgAssistsPerGame = weightedAverage(assistsPerGame, weights);

  // Trend analysis
  const goalsTrend = calculateTrend(goals);
  const assistsTrend = calculateTrend(assists);

  // Volatility analysis
  const goalsVolatility = calculateVolatility(goals);
  const assistsVolatility = calculateVolatility(assists);

  // Project for 82 games (full season)
  const projectedGames = 82;
  
  // Apply trend adjustment (small influence)
  const trendAdjustment = 0.1;
  let projectedGoals = (avgGoalsPerGame * projectedGames) + (goalsTrend * trendAdjustment);
  let projectedAssists = (avgAssistsPerGame * projectedGames) + (assistsTrend * trendAdjustment);

  // Ensure non-negative
  projectedGoals = Math.max(0, projectedGoals);
  projectedAssists = Math.max(0, projectedAssists);
  
  const projectedPoints = projectedGoals + projectedAssists;

  // Calculate confidence
  let confidence = 0.5; // Base confidence
  
  // More data = higher confidence
  confidence += Math.min(0.3, stats.length * 0.1);
  
  // Lower volatility = higher confidence
  const avgVolatility = (goalsVolatility + assistsVolatility) / 2;
  confidence += Math.max(0, 0.2 - avgVolatility / 20);
  
  // Recent performance consistency
  if (stats.length >= 2) {
    const recentGoals = goals.slice(-2);
    const recentConsistency = 1 - (Math.abs(recentGoals[1] - recentGoals[0]) / Math.max(recentGoals[0], 1));
    confidence += recentConsistency * 0.1;
  }

  confidence = Math.min(0.95, Math.max(0.1, confidence));

  return {
    goals: Math.round(projectedGoals * 10) / 10,
    assists: Math.round(projectedAssists * 10) / 10,
    points: Math.round(projectedPoints * 10) / 10,
    confidence: Math.round(confidence * 100) / 100
  };
}

// Simple average projection
function simpleProjection(stats: HistoricalStat[]): {
  goals: number;
  assists: number;
  points: number;
} {
  if (stats.length === 0) {
    return { goals: 0, assists: 0, points: 0 };
  }

  const avgGoals = stats.reduce((sum, s) => sum + s.goals, 0) / stats.length;
  const avgAssists = stats.reduce((sum, s) => sum + s.assists, 0) / stats.length;
  const avgPoints = stats.reduce((sum, s) => sum + s.points, 0) / stats.length;

  return {
    goals: Math.round(avgGoals * 10) / 10,
    assists: Math.round(avgAssists * 10) / 10,
    points: Math.round(avgPoints * 10) / 10
  };
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/ml-projections/player",
    method: "POST",
    description: "Generate ML-powered player projections using ensemble methods",
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
    features: [
      "Enhanced statistical modeling",
      "Weighted averages with trend analysis", 
      "Confidence scoring",
      "Multiple model predictions"
    ]
  });
}

export async function POST(request: NextRequest) {
  try {
    const body: ProjectionRequest = await request.json();
    
    if (!body.player_id || !Array.isArray(body.historical_stats)) {
      return NextResponse.json(
        { error: "Invalid request format" },
        { status: 400 }
      );
    }

    // Enhanced projection (main algorithm)
    const enhanced = enhancedProjection(body.historical_stats);
    
    // Simple average (baseline)
    const simple = simpleProjection(body.historical_stats);

    // Regression-based projection
    const seasons = body.historical_stats.map((_, i) => i);
    const goals = body.historical_stats.map(s => s.goals);
    const assists = body.historical_stats.map(s => s.assists);
    
    let regressionGoals = simple.goals;
    let regressionAssists = simple.assists;
    
    if (goals.length >= 2) {
      const goalsRegression = linearRegression(seasons, goals);
      const assistsRegression = linearRegression(seasons, assists);
      
      // Project next season
      const nextSeason = seasons.length;
      regressionGoals = Math.max(0, goalsRegression.slope * nextSeason + goalsRegression.intercept);
      regressionAssists = Math.max(0, assistsRegression.slope * nextSeason + assistsRegression.intercept);
    }

    const regression = {
      goals: Math.round(regressionGoals * 10) / 10,
      assists: Math.round(regressionAssists * 10) / 10,
      points: Math.round((regressionGoals + regressionAssists) * 10) / 10
    };

    const response: ProjectionResponse = {
      player_id: body.player_id,
      projected_goals: enhanced.goals,
      projected_assists: enhanced.assists,
      projected_points: enhanced.points,
      confidence: enhanced.confidence,
      model_used: "enhanced_statistical",
      individual_predictions: {
        enhanced_statistical: {
          goals: enhanced.goals,
          assists: enhanced.assists,
          points: enhanced.points
        },
        simple_average: simple,
        linear_regression: regression
      }
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error in ML projections:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
