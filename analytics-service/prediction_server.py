"""
Persistent FastAPI server for ML predictions.

Keeps the model loaded in memory to eliminate cold start time.
Run with: uvicorn analytics-service.prediction_server:app --port 8001

Or use the start script: ./start_prediction_server.sh
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

app = FastAPI(title="NHL Player Prediction API")

# Global variables for cached model and data
_loaded_model = None
_cfg = None
_base = None
_ftables = None
_initialized = False


class PredictionRequest(BaseModel):
    player_id: int
    game_date: str  # YYYY-MM-DD
    opponent_team: str
    player_team: str
    is_home: bool


class BatchPredictionRequest(BaseModel):
    predictions: List[PredictionRequest]


class PredictionResult(BaseModel):
    player_id: int
    game_date: str
    opponent_team: str
    player_team: str
    is_home: bool
    stats: Dict[str, float]


class BatchPredictionResponse(BaseModel):
    predictions: List[PredictionResult]
    errors: List[Dict[str, Any]]


def initialize_model():
    """Initialize model and feature tables once at startup."""
    global _loaded_model, _cfg, _base, _ftables, _initialized
    
    if _initialized:
        return True
    
    try:
        print("[Prediction Server] Initializing model and feature tables...")
        
        from modeling.inference import default_experiment_config, load_latest_model
        from modeling.data_extraction import load_base_dataset
        from modeling.features import build_feature_tables
        
        _cfg = default_experiment_config()
        print("[Prediction Server] Loading model...")
        _loaded_model = load_latest_model(_cfg)
        
        print("[Prediction Server] Loading base dataset...")
        _base = load_base_dataset(_cfg.data)
        
        print("[Prediction Server] Building feature tables...")
        _ftables = build_feature_tables(_base, _cfg.data)
        
        _initialized = True
        print("[Prediction Server] ✓ Initialization complete!")
        return True
        
    except Exception as e:
        print(f"[Prediction Server] ✗ Initialization failed: {e}")
        import traceback
        traceback.print_exc()
        return False


@app.on_event("startup")
async def startup_event():
    """Initialize model on server startup."""
    initialize_model()


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy" if _initialized else "not_initialized",
        "model_loaded": _loaded_model is not None,
        "data_loaded": _base is not None,
    }


@app.post("/predict", response_model=BatchPredictionResponse)
async def batch_predict(request: BatchPredictionRequest):
    """Make batch predictions for multiple players."""
    if not _initialized:
        if not initialize_model():
            raise HTTPException(status_code=503, detail="Model not initialized")
    
    results = []
    errors = []
    
    from modeling.inference import predict_game_for_player_with_model
    
    for idx, pred in enumerate(request.predictions):
        try:
            # Parse game_date
            try:
                game_date = datetime.strptime(pred.game_date, "%Y-%m-%d")
            except ValueError:
                errors.append({
                    "index": idx,
                    "player_id": pred.player_id,
                    "error": f"Invalid game_date format: {pred.game_date}"
                })
                continue
            
            # Make prediction
            predicted_stats = predict_game_for_player_with_model(
                player_id=pred.player_id,
                game_date=game_date,
                opponent_team=pred.opponent_team,
                player_team=pred.player_team,
                is_home=pred.is_home,
                loaded_model=_loaded_model,
                cfg=_cfg,
                preloaded_base=_base,
                preloaded_ftables=_ftables
            )
            
            results.append(PredictionResult(
                player_id=pred.player_id,
                game_date=pred.game_date,
                opponent_team=pred.opponent_team,
                player_team=pred.player_team,
                is_home=pred.is_home,
                stats=predicted_stats
            ))
            
        except Exception as e:
            errors.append({
                "index": idx,
                "player_id": pred.player_id,
                "error": str(e)
            })
    
    return BatchPredictionResponse(predictions=results, errors=errors)


@app.post("/predict/single", response_model=PredictionResult)
async def single_predict(request: PredictionRequest):
    """Make a single prediction."""
    response = await batch_predict(BatchPredictionRequest(predictions=[request]))
    
    if response.errors:
        raise HTTPException(status_code=400, detail=response.errors[0]["error"])
    
    if not response.predictions:
        raise HTTPException(status_code=500, detail="No prediction generated")
    
    return response.predictions[0]


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)

