#!/bin/bash
# Start the persistent prediction server

cd "$(dirname "$0")"

# Activate virtual environment
source venv/bin/activate

# Install uvicorn if not present
pip install uvicorn fastapi pydantic --quiet

# Start the server
echo "Starting ML Prediction Server on port 8001..."
echo "Once started, predictions will be instant (no cold start)."
echo ""
python -m uvicorn prediction_server:app --host 0.0.0.0 --port 8001 --reload


