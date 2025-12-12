import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import * as path from 'path';

/**
 * POST /api/ml-projections/matchup
 * 
 * Batch prediction endpoint for matchup projections.
 * 
 * Body:
 * {
 *   predictions: Array<{
 *     playerId: number;
 *     gameDate: string; // YYYY-MM-DD
 *     opponentTeam: string;
 *     playerTeam: string;
 *     isHome: boolean;
 *   }>
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { predictions } = body;

    if (!predictions || !Array.isArray(predictions) || predictions.length === 0) {
      return NextResponse.json(
        { error: 'predictions array is required and must not be empty' },
        { status: 400 }
      );
    }

    // Validate each prediction request
    for (const pred of predictions) {
      if (typeof pred.playerId !== 'number') {
        return NextResponse.json(
          { error: 'Each prediction must have a numeric playerId' },
          { status: 400 }
        );
      }
      if (!pred.gameDate || typeof pred.gameDate !== 'string') {
        return NextResponse.json(
          { error: 'Each prediction must have a gameDate string (YYYY-MM-DD)' },
          { status: 400 }
        );
      }
      if (!pred.opponentTeam || typeof pred.opponentTeam !== 'string') {
        return NextResponse.json(
          { error: 'Each prediction must have an opponentTeam string' },
          { status: 400 }
        );
      }
      if (!pred.playerTeam || typeof pred.playerTeam !== 'string') {
        return NextResponse.json(
          { error: 'Each prediction must have a playerTeam string' },
          { status: 400 }
        );
      }
      if (typeof pred.isHome !== 'boolean') {
        return NextResponse.json(
          { error: 'Each prediction must have a boolean isHome field' },
          { status: 400 }
        );
      }
    }

    // Convert TypeScript camelCase to Python snake_case
    const pythonInput = {
      predictions: predictions.map(p => ({
        player_id: p.playerId,
        game_date: p.gameDate,
        opponent_team: p.opponentTeam,
        player_team: p.playerTeam,
        is_home: p.isHome,
      })),
    };

    // Find Python executable
    const pythonCmd = process.env.PYTHON_CMD || 'python3';
    
    // Get the project root (3 levels up from this file: app/api/ml-projections/matchup)
    const projectRoot = path.resolve(process.cwd());
    
    // Path to the Python module
    const pythonModule = 'analytics-service.modeling.batch_predict';

    console.log(`[Batch Prediction API] Executing Python batch prediction for ${predictions.length} predictions`);

    // Spawn Python process
    const pythonProcess = spawn(pythonCmd, ['-m', pythonModule], {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONPATH: projectRoot,
      },
    });

    // Send input JSON to Python via stdin
    pythonProcess.stdin.write(JSON.stringify(pythonInput));
    pythonProcess.stdin.end();

    // Collect stdout and stderr
    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Wait for process to complete
    const exitCode = await new Promise<number>((resolve) => {
      pythonProcess.on('close', (code) => {
        resolve(code || 0);
      });
    });

    if (exitCode !== 0) {
      console.error(`[Batch Prediction API] Python process exited with code ${exitCode}`);
      console.error(`[Batch Prediction API] stderr: ${stderr}`);
      return NextResponse.json(
        {
          error: 'Prediction failed',
          details: stderr || 'Unknown error',
        },
        { status: 500 }
      );
    }

    // Parse Python output
    let pythonOutput;
    try {
      pythonOutput = JSON.parse(stdout);
    } catch (parseError: any) {
      console.error(`[Batch Prediction API] Failed to parse Python output: ${parseError.message}`);
      console.error(`[Batch Prediction API] stdout: ${stdout}`);
      return NextResponse.json(
        {
          error: 'Failed to parse prediction results',
          details: parseError.message,
        },
        { status: 500 }
      );
    }

    // Convert Python snake_case back to TypeScript camelCase
    const results = pythonOutput.predictions?.map((pred: any) => ({
      playerId: pred.player_id,
      gameDate: pred.game_date,
      opponentTeam: pred.opponent_team,
      playerTeam: pred.player_team,
      isHome: pred.is_home,
      stats: pred.stats,
    })) || [];

    // Log errors if any
    if (pythonOutput.errors && pythonOutput.errors.length > 0) {
      console.warn(`[Batch Prediction API] ${pythonOutput.errors.length} prediction errors:`, pythonOutput.errors);
    }

    return NextResponse.json({
      predictions: results,
      errors: pythonOutput.errors || [],
    });
  } catch (error: any) {
    console.error('[Batch Prediction API] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to process batch predictions',
        message: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

