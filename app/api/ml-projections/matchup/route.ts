import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

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

    // Try persistent prediction server first (much faster - no cold start)
    const PREDICTION_SERVER_URL = process.env.PREDICTION_SERVER_URL || 'http://localhost:8001';
    try {
      console.log(`[Batch Prediction API] Trying persistent prediction server at ${PREDICTION_SERVER_URL}...`);
      const serverResponse = await fetch(`${PREDICTION_SERVER_URL}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pythonInput),
        signal: AbortSignal.timeout(30000), // 30 second timeout for server
      });
      
      if (serverResponse.ok) {
        const result = await serverResponse.json();
        console.log(`[Batch Prediction API] ✓ Got ${result.predictions?.length || 0} predictions from server`);
        
        // Convert snake_case back to camelCase
        const formattedPredictions = result.predictions.map((p: any) => ({
          playerId: p.player_id,
          gameDate: p.game_date,
          opponentTeam: p.opponent_team,
          playerTeam: p.player_team,
          isHome: p.is_home,
          stats: p.stats,
        }));
        
        return NextResponse.json({
          predictions: formattedPredictions,
          errors: result.errors || [],
          source: 'persistent_server',
        });
      } else {
        console.log(`[Batch Prediction API] Server returned ${serverResponse.status}, falling back to spawn`);
      }
    } catch (serverError: any) {
      console.log(`[Batch Prediction API] Persistent server not available (${serverError.message}), falling back to spawn`);
    }

    // Fallback: Spawn Python process (slow cold start)
    console.log(`[Batch Prediction API] Using Python subprocess (cold start - this takes 30+ seconds)...`);

    // Find Python executable - use venv if it exists (has required packages)
    // The venv may have timeout issues, but it's the only option with packages installed
    const projectRoot = path.resolve(process.cwd());
    const venvPython = path.join(projectRoot, 'analytics-service', 'venv', 'bin', 'python3');
    let pythonCmd = process.env.PYTHON_CMD;
    
    if (!pythonCmd) {
      if (fs.existsSync(venvPython)) {
        pythonCmd = venvPython;
      } else {
        pythonCmd = 'python3';
      }
    }
    
    // Path to the Python module
    const pythonModule = 'analytics-service.modeling.batch_predict';

    console.log(`[Batch Prediction API] Executing Python batch prediction for ${predictions.length} predictions`);
    console.log(`[Batch Prediction API] Python command: ${pythonCmd}`);
    console.log(`[Batch Prediction API] Project root: ${projectRoot}`);
    console.log(`[Batch Prediction API] Python module: ${pythonModule}`);
    console.log(`[Batch Prediction API] Using venv: ${pythonCmd === venvPython}`);
    console.log(`[Batch Prediction API] PYTHONPATH will be: ${projectRoot}`);

    // Spawn Python process with timeout
    // Add analytics-service to PYTHONPATH so imports work
    const pythonPath = process.env.PYTHONPATH 
      ? `${process.env.PYTHONPATH}:${projectRoot}`
      : projectRoot;
    
    const pythonProcess = spawn(pythonCmd, ['-m', pythonModule], {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONPATH: pythonPath,
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
      const chunk = data.toString();
      stdout += chunk;
      // Log chunks as they come in for long-running processes
      if (stdout.length < 1000) {
        console.log(`[Batch Prediction API] Python stdout chunk: ${chunk.substring(0, 200)}`);
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      // Log stderr in real-time for debugging
      console.log(`[Batch Prediction API] Python stderr: ${chunk.substring(0, 500)}`);
    });

    // Wait for process to complete with timeout
    // Increased timeout to 120 seconds to handle slow imports
    const exitCode = await Promise.race<number>([
      new Promise<number>((resolve) => {
        pythonProcess.on('close', (code) => {
          resolve(code || 0);
        });
      }),
      new Promise<number>((resolve) => {
        setTimeout(() => {
          pythonProcess.kill('SIGKILL');
          resolve(-1); // Timeout exit code
        }, 300000); // 300 second timeout (5 minutes) - batch predictions can be slow
      }),
    ]);

    // Log stderr for debugging (contains warnings about missing players, etc.)
    if (stderr && stderr.trim().length > 0) {
      console.log(`[Batch Prediction API] Python stderr output (full):\n${stderr}`);
    } else {
      console.log(`[Batch Prediction API] No stderr output from Python process`);
    }

    // Check if we got any output at all
    console.log(`[Batch Prediction API] Python process completed. Exit code: ${exitCode}`);
    console.log(`[Batch Prediction API] stdout length: ${stdout.length}, stderr length: ${stderr.length}`);
    
    if (!stdout || stdout.trim().length === 0) {
      console.error(`[Batch Prediction API] No output from Python process`);
      console.error(`[Batch Prediction API] Exit code: ${exitCode}`);
      console.error(`[Batch Prediction API] stderr: ${stderr.substring(0, 2000)}`);
      return NextResponse.json(
        {
          error: 'No output from prediction script',
          details: stderr || 'Python process produced no output',
          exitCode,
        },
        { status: 500 }
      );
    }
    
    // Log first part of stdout to see what we got
    console.log(`[Batch Prediction API] stdout preview (first 500 chars): ${stdout.substring(0, 500)}`);

    if (exitCode === -1) {
      console.error(`[Batch Prediction API] Python process timed out after 120 seconds`);
      console.error(`[Batch Prediction API] This may indicate venv filesystem issues or slow imports`);
      console.error(`[Batch Prediction API] stdout so far: ${stdout.substring(0, 500)}`);
      console.error(`[Batch Prediction API] stderr so far: ${stderr.substring(0, 500)}`);
      return NextResponse.json(
        {
          error: 'Prediction timed out',
          details: 'The prediction process took too long to complete. This may indicate venv filesystem issues. Try recreating the venv or check system resources.',
          stdout: stdout.substring(0, 1000),
          stderr: stderr.substring(0, 1000),
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

