import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import * as path from 'path';

// Ensure this route is only executed at runtime, not during build
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
    let body;
    try {
      body = await request.json();
    } catch (parseError: any) {
      console.error('[Batch Prediction API] Failed to parse request body:', parseError);
      return NextResponse.json(
        { error: 'Invalid JSON in request body', details: parseError.message },
        { status: 400 }
      );
    }
    
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
    
    // Get the project root
    const projectRoot = path.resolve(process.cwd());
    
    // Path to the Python module
    const pythonModule = 'analytics-service.modeling.batch_predict';

    console.log(`[Batch Prediction API] Executing Python batch prediction for ${predictions.length} predictions`);
    console.log(`[Batch Prediction API] Python command: ${pythonCmd}`);
    console.log(`[Batch Prediction API] Project root: ${projectRoot}`);
    console.log(`[Batch Prediction API] Python module: ${pythonModule}`);

    // Spawn Python process with timeout
    const pythonProcess = spawn(pythonCmd, ['-m', pythonModule], {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONPATH: projectRoot,
        PYTHONUNBUFFERED: '1', // Ensure output is not buffered
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

    // Wait for process to complete with timeout
    const exitCode = await Promise.race<number>([
      new Promise<number>((resolve) => {
        pythonProcess.on('close', (code) => {
          resolve(code || 0);
        });
      }),
      new Promise<number>((resolve) => {
        setTimeout(() => {
          pythonProcess.kill();
          resolve(-1); // Timeout exit code
        }, 60000); // 60 second timeout
      }),
    ]);

    // Check if we got any output at all
    if (!stdout || stdout.trim().length === 0) {
      console.error(`[Batch Prediction API] No output from Python process`);
      console.error(`[Batch Prediction API] Exit code: ${exitCode}`);
      console.error(`[Batch Prediction API] stderr: ${stderr}`);
      return NextResponse.json(
        {
          error: 'No output from prediction script',
          details: stderr || 'Python process produced no output',
        },
        { status: 500 }
      );
    }

    if (exitCode === -1) {
      console.error(`[Batch Prediction API] Python process timed out`);
      return NextResponse.json(
        {
          error: 'Prediction timed out',
          details: 'The prediction process took too long to complete',
        },
        { status: 500 }
      );
    }

    if (exitCode !== 0) {
      console.error(`[Batch Prediction API] Python process exited with code ${exitCode}`);
      console.error(`[Batch Prediction API] stderr: ${stderr}`);
      console.error(`[Batch Prediction API] stdout (first 1000 chars): ${stdout.substring(0, 1000)}`);
      
      // Try to parse stdout as JSON even if exit code is non-zero
      // (the script might have output JSON before failing)
      try {
        const errorOutput = JSON.parse(stdout);
        return NextResponse.json({
          predictions: errorOutput.predictions || [],
          errors: errorOutput.errors || [stderr || 'Unknown error'],
        });
      } catch (e) {
        // stdout is not JSON, return error
        return NextResponse.json(
          {
            error: 'Prediction failed',
            details: stderr || stdout.substring(0, 500) || 'Unknown error',
          },
          { status: 500 }
        );
      }
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

