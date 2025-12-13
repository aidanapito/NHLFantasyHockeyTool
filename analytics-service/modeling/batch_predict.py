"""
Batch prediction script for player game projections.

Accepts JSON input via stdin with structure:
{
  "predictions": [
    {
      "player_id": 8471214,
      "game_date": "2025-01-15",
      "opponent_team": "TOR",
      "player_team": "EDM",
      "is_home": true
    }
  ]
}

Outputs JSON to stdout with predictions:
{
  "predictions": [
    {
      "player_id": 8471214,
      "game_date": "2025-01-15",
      "stats": {
        "goals": 0.5,
        "assists": 0.8,
        ...
      }
    }
  ],
  "errors": []
}
"""

from __future__ import annotations

import json
import sys
from datetime import datetime
from typing import Dict, List, Any

from .inference import predict_game_for_player, default_experiment_config


def main():
    """Main entry point for batch prediction."""
    try:
        # Read JSON input from stdin
        input_data = json.load(sys.stdin)
        predictions_requests = input_data.get("predictions", [])
        
        if not predictions_requests:
            output = {"predictions": [], "errors": ["No prediction requests provided"]}
            print(json.dumps(output))
            sys.exit(0)  # Exit with 0, return empty results
        
        results = []
        errors = []
        
        # Load model once (cached for efficiency)
        # Wrap in try-catch to handle import errors, missing files, etc.
        try:
            cfg = default_experiment_config()
        except ImportError as e:
            output = {
                "predictions": [],
                "errors": [f"Import error - missing dependency: {str(e)}"]
            }
            print(json.dumps(output))
            sys.stdout.flush()
            sys.exit(0)
        except FileNotFoundError as e:
            output = {
                "predictions": [],
                "errors": [f"Model file not found: {str(e)}. Please train the model first."]
            }
            print(json.dumps(output))
            sys.stdout.flush()
            sys.exit(0)
        except Exception as e:
            import traceback
            output = {
                "predictions": [],
                "errors": [f"Failed to initialize model/config: {str(e)}"]
            }
            print(json.dumps(output))
            print(f"Traceback: {traceback.format_exc()}", file=sys.stderr)
            sys.stdout.flush()
            sys.exit(0)
        
        for idx, req in enumerate(predictions_requests):
            try:
                # Extract request parameters
                player_id = int(req["player_id"])
                game_date_str = req["game_date"]
                opponent_team = str(req["opponent_team"])
                player_team = str(req["player_team"])
                is_home = bool(req.get("is_home", False))
                
                # Parse game_date
                try:
                    game_date = datetime.fromisoformat(game_date_str.replace("Z", "+00:00"))
                    # Remove timezone if present for comparison
                    if game_date.tzinfo is not None:
                        game_date = game_date.replace(tzinfo=None)
                except ValueError:
                    # Try alternative formats
                    try:
                        game_date = datetime.strptime(game_date_str, "%Y-%m-%d")
                    except ValueError:
                        errors.append({
                            "index": idx,
                            "player_id": player_id,
                            "error": f"Invalid game_date format: {game_date_str}"
                        })
                        continue
                
                # Make prediction
                predicted_stats = predict_game_for_player(
                    player_id=player_id,
                    game_date=game_date,
                    opponent_team=opponent_team,
                    player_team=player_team,
                    is_home=is_home,
                    cfg=cfg
                )
                
                # Format result
                results.append({
                    "player_id": player_id,
                    "game_date": game_date_str,
                    "opponent_team": opponent_team,
                    "player_team": player_team,
                    "is_home": is_home,
                    "stats": predicted_stats
                })
                
            except KeyError as e:
                errors.append({
                    "index": idx,
                    "player_id": req.get("player_id", "unknown"),
                    "error": f"Missing required field: {e}"
                })
            except ValueError as e:
                errors.append({
                    "index": idx,
                    "player_id": req.get("player_id", "unknown"),
                    "error": str(e)
                })
            except Exception as e:
                import traceback
                error_msg = f"Prediction failed: {str(e)}"
                errors.append({
                    "index": idx,
                    "player_id": req.get("player_id", "unknown"),
                    "error": error_msg
                })
                # Print traceback to stderr for debugging
                print(f"Error for player {req.get('player_id', 'unknown')}: {traceback.format_exc()}", file=sys.stderr)
        
        # Output results (always valid JSON)
        output = {
            "predictions": results,
            "errors": errors
        }
        
        print(json.dumps(output))
        sys.stdout.flush()  # Ensure output is flushed
        
    except json.JSONDecodeError as e:
        output = {
            "predictions": [],
            "errors": [f"Invalid JSON input: {str(e)}"]
        }
        print(json.dumps(output))
        sys.stdout.flush()
        sys.exit(0)  # Exit with 0, return error in JSON
    except Exception as e:
        import traceback
        output = {
            "predictions": [],
            "errors": [f"Unexpected error: {str(e)}"]
        }
        print(json.dumps(output))
        print(f"Traceback: {traceback.format_exc()}", file=sys.stderr)
        sys.stdout.flush()
        sys.exit(0)  # Exit with 0, return error in JSON


if __name__ == "__main__":
    main()

