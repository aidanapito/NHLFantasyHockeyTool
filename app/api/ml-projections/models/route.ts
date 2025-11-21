import { NextRequest, NextResponse } from "next/server";

interface HistoricalStat {
  season: string;
  games_played: number;
  goals: number;
  assists: number;
  points: number;
}

interface ModelComparisonRequest {
  player_id: number;
  historical_stats: HistoricalStat[];
}

// Simple Linear Regression
function linearRegression(x: number[], y: number[]): { slope: number; intercept: number; r2: number } {
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumXX = x.reduce((acc, xi) => acc + xi * xi, 0);
  const sumYY = y.reduce((acc, yi) => acc + yi * yi, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  // Calculate R-squared
  const yMean = sumY / n;
  const ssRes = y.reduce((acc, yi, i) => {
    const predicted = slope * x[i] + intercept;
    return acc + Math.pow(yi - predicted, 2);
  }, 0);
  const ssTot = y.reduce((acc, yi) => acc + Math.pow(yi - yMean, 2), 0);
  const r2 = ssTot === 0 ? 1 : 1 - (ssRes / ssTot);

  return { slope, intercept, r2: Math.max(0, r2) };
}

// Exponential Smoothing
function exponentialSmoothing(values: number[], alpha: number = 0.3): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];
  
  let smoothed = values[0];
  for (let i = 1; i < values.length; i++) {
    smoothed = alpha * values[i] + (1 - alpha) * smoothed;
  }
  return smoothed;
}

// Weighted Moving Average
function weightedMovingAverage(values: number[], weights: number[]): number {
  if (values.length === 0) return 0;
  const weightedSum = values.reduce((acc, val, i) => acc + val * (weights[i] || 1), 0);
  const totalWeight = weights.slice(0, values.length).reduce((a, b) => a + b, 0) || values.length;
  return weightedSum / totalWeight;
}

// Polynomial Regression (2nd degree)
function polynomialRegression(x: number[], y: number[]): { a: number; b: number; c: number; r2: number } {
  const n = x.length;
  if (n < 3) {
    // Fall back to linear if not enough points
    const linear = linearRegression(x, y);
    return { a: 0, b: linear.slope, c: linear.intercept, r2: linear.r2 };
  }

  // Create matrices for polynomial regression y = ax² + bx + c
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);
  const sumX3 = x.reduce((acc, xi) => acc + xi * xi * xi, 0);
  const sumX4 = x.reduce((acc, xi) => acc + xi * xi * xi * xi, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumX2Y = x.reduce((acc, xi, i) => acc + xi * xi * y[i], 0);

  // Solve system of equations using Cramer's rule (simplified)
  const det = n * (sumX2 * sumX4 - sumX3 * sumX3) - sumX * (sumX * sumX4 - sumX2 * sumX3) + sumX2 * (sumX * sumX3 - sumX2 * sumX2);
  
  if (Math.abs(det) < 1e-10) {
    // Matrix is singular, fall back to linear
    const linear = linearRegression(x, y);
    return { a: 0, b: linear.slope, c: linear.intercept, r2: linear.r2 };
  }

  const detA = sumY * (sumX2 * sumX4 - sumX3 * sumX3) - sumXY * (sumX * sumX4 - sumX2 * sumX3) + sumX2Y * (sumX * sumX3 - sumX2 * sumX2);
  const detB = n * (sumXY * sumX4 - sumX2Y * sumX3) - sumY * (sumX * sumX4 - sumX2 * sumX3) + sumX2 * (sumX * sumX2Y - sumXY * sumX2);
  const detC = n * (sumX2 * sumX2Y - sumXY * sumX3) - sumX * (sumX * sumX2Y - sumXY * sumX2) + sumY * (sumX * sumX3 - sumX2 * sumX2);

  const a = detA / det;
  const b = detB / det;
  const c = detC / det;

  // Calculate R-squared
  const yMean = sumY / n;
  const ssRes = y.reduce((acc, yi, i) => {
    const predicted = a * x[i] * x[i] + b * x[i] + c;
    return acc + Math.pow(yi - predicted, 2);
  }, 0);
  const ssTot = y.reduce((acc, yi) => acc + Math.pow(yi - yMean, 2), 0);
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - (ssRes / ssTot));

  return { a, b, c, r2 };
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/ml-projections/models",
    method: "POST",
    description: "Compare predictions from different ML models",
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
    models_available: [
      "simple_average",
      "linear_regression", 
      "exponential_smoothing",
      "weighted_moving_average",
      "polynomial_regression",
      "ensemble"
    ]
  });
}

export async function POST(request: NextRequest) {
  try {
    const body: ModelComparisonRequest = await request.json();
    
    if (!body.player_id || !Array.isArray(body.historical_stats)) {
      return NextResponse.json(
        { error: "Invalid request format" },
        { status: 400 }
      );
    }

    const stats = body.historical_stats;
    const seasons = stats.map((_, i) => i);
    const goals = stats.map(s => s.goals);
    const assists = stats.map(s => s.assists);
    const points = stats.map(s => s.points);

    // Model 1: Simple Average
    const simpleAvg = {
      goals: goals.reduce((a, b) => a + b, 0) / goals.length || 0,
      assists: assists.reduce((a, b) => a + b, 0) / assists.length || 0,
      points: points.reduce((a, b) => a + b, 0) / points.length || 0
    };

    // Model 2: Linear Regression
    const goalsLinear = linearRegression(seasons, goals);
    const assistsLinear = linearRegression(seasons, assists);
    const nextSeason = seasons.length;
    const linearReg = {
      goals: Math.max(0, goalsLinear.slope * nextSeason + goalsLinear.intercept),
      assists: Math.max(0, assistsLinear.slope * nextSeason + assistsLinear.intercept),
      points: 0,
      r2_goals: goalsLinear.r2,
      r2_assists: assistsLinear.r2
    };
    linearReg.points = linearReg.goals + linearReg.assists;

    // Model 3: Exponential Smoothing
    const expSmooth = {
      goals: exponentialSmoothing(goals, 0.3),
      assists: exponentialSmoothing(assists, 0.3),
      points: exponentialSmoothing(points, 0.3)
    };

    // Model 4: Weighted Moving Average (recent seasons weighted more)
    const weights = stats.map((_, i) => Math.pow(1.5, i)); // Exponentially increasing weights
    const weightedMA = {
      goals: weightedMovingAverage(goals, weights),
      assists: weightedMovingAverage(assists, weights),
      points: weightedMovingAverage(points, weights)
    };

    // Model 5: Polynomial Regression (2nd degree)
    const goalsPoly = polynomialRegression(seasons, goals);
    const assistsPoly = polynomialRegression(seasons, assists);
    const polyReg = {
      goals: Math.max(0, goalsPoly.a * nextSeason * nextSeason + goalsPoly.b * nextSeason + goalsPoly.c),
      assists: Math.max(0, assistsPoly.a * nextSeason * nextSeason + assistsPoly.b * nextSeason + assistsPoly.c),
      points: 0,
      r2_goals: goalsPoly.r2,
      r2_assists: assistsPoly.r2
    };
    polyReg.points = polyReg.goals + polyReg.assists;

    // Model 6: Ensemble (average of all models)
    const ensemble = {
      goals: (simpleAvg.goals + linearReg.goals + expSmooth.goals + weightedMA.goals + polyReg.goals) / 5,
      assists: (simpleAvg.assists + linearReg.assists + expSmooth.assists + weightedMA.assists + polyReg.assists) / 5,
      points: 0
    };
    ensemble.points = ensemble.goals + ensemble.assists;

    // Round all values
    const roundValue = (val: number) => Math.round(val * 10) / 10;

    const response = {
      player_id: body.player_id,
      models: {
        simple_average: {
          name: "Simple Average",
          description: "Average of all historical seasons",
          predictions: {
            goals: roundValue(simpleAvg.goals),
            assists: roundValue(simpleAvg.assists),
            points: roundValue(simpleAvg.points)
          },
          confidence: Math.min(0.8, 0.3 + stats.length * 0.1)
        },
        linear_regression: {
          name: "Linear Regression",
          description: "Linear trend projection",
          predictions: {
            goals: roundValue(linearReg.goals),
            assists: roundValue(linearReg.assists),
            points: roundValue(linearReg.points)
          },
          confidence: (linearReg.r2_goals + linearReg.r2_assists) / 2,
          r2_scores: {
            goals: roundValue(linearReg.r2_goals),
            assists: roundValue(linearReg.r2_assists)
          }
        },
        exponential_smoothing: {
          name: "Exponential Smoothing",
          description: "Weighted average favoring recent performance",
          predictions: {
            goals: roundValue(expSmooth.goals),
            assists: roundValue(expSmooth.assists),
            points: roundValue(expSmooth.points)
          },
          confidence: Math.min(0.85, 0.4 + stats.length * 0.08)
        },
        weighted_moving_average: {
          name: "Weighted Moving Average",
          description: "Recent seasons weighted more heavily",
          predictions: {
            goals: roundValue(weightedMA.goals),
            assists: roundValue(weightedMA.assists),
            points: roundValue(weightedMA.points)
          },
          confidence: Math.min(0.9, 0.5 + stats.length * 0.07)
        },
        polynomial_regression: {
          name: "Polynomial Regression",
          description: "2nd degree polynomial trend fitting",
          predictions: {
            goals: roundValue(polyReg.goals),
            assists: roundValue(polyReg.assists),
            points: roundValue(polyReg.points)
          },
          confidence: (polyReg.r2_goals + polyReg.r2_assists) / 2,
          r2_scores: {
            goals: roundValue(polyReg.r2_goals),
            assists: roundValue(polyReg.r2_assists)
          }
        },
        ensemble: {
          name: "Ensemble Average",
          description: "Average of all model predictions",
          predictions: {
            goals: roundValue(ensemble.goals),
            assists: roundValue(ensemble.assists),
            points: roundValue(ensemble.points)
          },
          confidence: 0.85
        }
      },
      recommended_model: "ensemble",
      data_quality: {
        seasons_available: stats.length,
        completeness: stats.filter(s => s.games_played > 50).length / stats.length,
        consistency: 1 - (Math.max(...goals) - Math.min(...goals)) / (Math.max(...goals) || 1)
      }
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error in model comparison:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
