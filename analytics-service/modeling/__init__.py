"""
Modeling package for player game-by-game performance projections.

This package is intentionally framework-agnostic with a clean separation between:
- Data extraction from Postgres
- Feature engineering
- Torch datasets/models/training
- Inference utilities

All configuration should flow through `config.py`.
"""


