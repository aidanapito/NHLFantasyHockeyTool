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

# Immediate output for debugging process spawning issues
import sys
print("[Batch Predict] Script starting - imports beginning...", file=sys.stderr)
sys.stderr.flush()

import json
from datetime import datetime
from typing import Dict, List, Any

print("[Batch Predict] Basic imports done, loading inference module...", file=sys.stderr)
sys.stderr.flush()

from .inference import predict_game_for_player, default_experiment_config

print("[Batch Predict] All imports complete", file=sys.stderr)
sys.stderr.flush()


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
        
        # Load model and config once (cached for efficiency)
        # Wrap in try-catch to handle import errors, missing files, etc.
        loaded_model = None
        cfg = None
        try:
            cfg = default_experiment_config()
            # Pre-load the model once for all predictions
            from .inference import load_latest_model
            loaded_model = load_latest_model(cfg)
            print(f"Model loaded successfully for batch prediction", file=sys.stderr)
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
        
        # Log sample of player IDs we're about to predict for
        sample_player_ids = [int(r["player_id"]) for r in predictions_requests[:5]]
        print(f"[Batch Predict] Processing {len(predictions_requests)} predictions", file=sys.stderr)
        print(f"[Batch Predict] Sample player IDs in request: {sample_player_ids}", file=sys.stderr)
        
        # Load base dataset and feature tables ONCE for all predictions (major performance optimization)
        base = None
        ftables = None
        if loaded_model:
            from .data_extraction import load_base_dataset
            from .features import build_feature_tables
            print(f"[Batch Predict] Loading dataset once for all {len(predictions_requests)} predictions...", file=sys.stderr)
            base = load_base_dataset(cfg.data)  # Pass cfg.data (DataConfig) not cfg (ExperimentConfig)
            print(f"[Batch Predict] Building feature tables once for all predictions...", file=sys.stderr)
            ftables = build_feature_tables(base, cfg.data)
            print(f"[Batch Predict] Dataset and features loaded successfully", file=sys.stderr)
            
            unique_player_ids_in_data = base.game_logs["player_id"].unique()
            print(f"[Batch Predict] Total unique player IDs in GameLog dataset: {len(unique_player_ids_in_data)}", file=sys.stderr)
            print(f"[Batch Predict] Sample player IDs in dataset: {unique_player_ids_in_data[:20].tolist()}", file=sys.stderr)
            print(f"[Batch Predict] Player ID range in dataset: min={unique_player_ids_in_data.min()}, max={unique_player_ids_in_data.max()}", file=sys.stderr)
            
            # Check if any of the requested player IDs have GameLog entries by NHL ID
            sample_request_ids = [int(r["player_id"]) for r in predictions_requests[:5]]
            for req_id in sample_request_ids:
                # Check if this ID exists as a database ID in GameLog
                has_game_logs_by_id = (base.game_logs["player_id"] == req_id).any()
                # Check if this ID exists as an NHL ID, and if so, find the database ID
                player_by_nhl = base.players[base.players["nhl_id"] == req_id]
                if not player_by_nhl.empty:
                    db_id = player_by_nhl["id"].iloc[0]
                    has_game_logs_by_nhl = (base.game_logs["player_id"] == db_id).any()
                    print(f"[Batch Predict] Player ID {req_id} (NHL ID) -> DB ID {db_id}: GameLog entries by DB ID: {has_game_logs_by_nhl}", file=sys.stderr)
                else:
                    # Check if it's a database ID
                    player_by_id = base.players[base.players["id"] == req_id]
                    if not player_by_id.empty:
                        print(f"[Batch Predict] Player ID {req_id} (DB ID): GameLog entries: {has_game_logs_by_id}", file=sys.stderr)
                    else:
                        print(f"[Batch Predict] Player ID {req_id}: Not found in Player table at all", file=sys.stderr)
        
        # Process predictions with progress logging
        total_predictions = len(predictions_requests)
        for idx, req in enumerate(predictions_requests):
            # Log progress every 10 predictions
            if (idx + 1) % 10 == 0 or idx == 0:
                print(f"[Batch Predict] Processing prediction {idx + 1}/{total_predictions}...", file=sys.stderr)
            
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
                
                # Make prediction (pass pre-loaded model and dataset if available)
                if loaded_model and base is not None and ftables is not None:
                    # Use the pre-loaded model and dataset for much faster batch predictions
                    from .inference import predict_game_for_player_with_model
                    try:
                        predicted_stats = predict_game_for_player_with_model(
                            player_id=player_id,
                            game_date=game_date,
                            opponent_team=opponent_team,
                            player_team=player_team,
                            is_home=is_home,
                            loaded_model=loaded_model,
                            cfg=cfg,
                            preloaded_base=base,
                            preloaded_ftables=ftables
                        )
                    except AttributeError:
                        # Fallback to regular function if new function doesn't exist
                        predicted_stats = predict_game_for_player(
                            player_id=player_id,
                            game_date=game_date,
                            opponent_team=opponent_team,
                            player_team=player_team,
                            is_home=is_home,
                            cfg=cfg
                        )
                elif loaded_model:
                    # Use the pre-loaded model but load dataset per prediction (slower)
                    from .inference import predict_game_for_player_with_model
                    try:
                        predicted_stats = predict_game_for_player_with_model(
                            player_id=player_id,
                            game_date=game_date,
                            opponent_team=opponent_team,
                            player_team=player_team,
                            is_home=is_home,
                            loaded_model=loaded_model,
                            cfg=cfg
                        )
                    except AttributeError:
                        # Fallback to regular function if new function doesn't exist
                        predicted_stats = predict_game_for_player(
                            player_id=player_id,
                            game_date=game_date,
                            opponent_team=opponent_team,
                            player_team=player_team,
                            is_home=is_home,
                            cfg=cfg
                        )
                else:
                    # Fallback: load model for each prediction (slow)
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

