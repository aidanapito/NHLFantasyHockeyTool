"""
Standalone script to evaluate a trained model.

Usage:
    source analytics-service/venv/bin/activate
    python -m analytics-service.modeling.evaluate_model [--model-name player_perf_v1]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch

from .config import (
    ALL_TARGET_STATS,
    ExperimentConfig,
    artifact_paths,
    default_experiment_config,
    ensure_directories,
)
from .data_extraction import load_base_dataset
from .dataset import Encoders, PlayerGameDataset, fit_encoders
from .evaluation import evaluate_model
from .features import build_feature_tables
from .models import TabularModelConfig, TabularMultiTaskModel


def load_model_and_encoders(
    model_name: str, device: torch.device
) -> tuple[TabularMultiTaskModel, Encoders, TabularModelConfig]:
    """
    Load a trained model, its encoders, and config from disk.
    """
    paths = artifact_paths(model_name)

    # Load encoders
    with paths["encoders"].open() as f:
        encoders_data = json.load(f)
    encoders = Encoders(
        category_maps=encoders_data["category_maps"],
        numeric_means=encoders_data["numeric_means"],
        numeric_stds=encoders_data["numeric_stds"],
    )

    # Load metadata to get target list
    with paths["metadata"].open() as f:
        metadata = json.load(f)

    # We need to rebuild the model architecture, so we need to know the config
    # For now, we'll use a default config and infer dimensions from encoders
    cfg_model = TabularModelConfig(
        num_numeric_features=len(encoders.numeric_means),  # Approximate
        num_targets=len(metadata.get("targets", ALL_TARGET_STATS)),
        team_vocab_size=len(encoders.category_maps.get("team", {})),
        opponent_vocab_size=len(encoders.category_maps.get("opponent_team", {})),
        position_vocab_size=len(encoders.category_maps.get("position", {})),
        hidden_dims=[256, 256, 128],  # Default, should match training
        dropout=0.1,
    )

    model = TabularMultiTaskModel(cfg_model).to(device)
    model.load_state_dict(torch.load(paths["model_state"], map_location=device, weights_only=False))
    model.eval()

    return model, encoders, cfg_model


def main():
    parser = argparse.ArgumentParser(description="Evaluate a trained player performance model")
    parser.add_argument(
        "--model-name",
        type=str,
        default="player_perf_v1",
        help="Name of the model to evaluate",
    )
    parser.add_argument(
        "--split",
        type=str,
        choices=["train", "val", "test"],
        default="test",
        help="Which split to evaluate on",
    )
    args = parser.parse_args()

    ensure_directories()
    cfg = default_experiment_config()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    print(f"Loading model: {args.model_name}")
    print(f"Device: {device}")
    print(f"Evaluating on: {args.split} split")

    # Load model and encoders
    model, encoders, model_cfg = load_model_and_encoders(args.model_name, device)

    # Build datasets (same as training)
    print("Loading data and building features...")
    base = load_base_dataset(cfg.data)
    ftables = build_feature_tables(base, cfg.data)

    # We need to use the same split logic as training
    # For now, we'll use a simple random split (matching training script)
    # In production, you'd want to use the same time-based splits
    import numpy as np
    
    def train_val_test_split(features, targets, val_ratio: float = 0.1, test_ratio: float = 0.1):
        n = len(features)
        n_test = int(n * test_ratio)
        n_val = int(n * val_ratio)
        n_train = n - n_val - n_test
        indices = np.random.permutation(n)
        train_idx = indices[:n_train]
        val_idx = indices[n_train : n_train + n_val]
        test_idx = indices[n_train + n_val :]
        return (
            features.iloc[train_idx],
            targets.iloc[train_idx],
            features.iloc[val_idx],
            targets.iloc[val_idx],
            features.iloc[test_idx],
            targets.iloc[test_idx],
        )

    f_train, t_train, f_val, t_val, f_test, t_test = train_val_test_split(
        ftables.features, ftables.targets
    )

    # Select the requested split
    if args.split == "train":
        features, targets = f_train, t_train
    elif args.split == "val":
        features, targets = f_val, t_val
    else:
        features, targets = f_test, t_test

    dataset = PlayerGameDataset(features, targets, encoders, target_names=ALL_TARGET_STATS)
    dataloader = torch.utils.data.DataLoader(
        dataset,
        batch_size=512,
        shuffle=False,
        num_workers=4,
    )

    # Run evaluation
    results = evaluate_model(
        model=model,
        dataloader=dataloader,
        device=device,
        stat_names=ALL_TARGET_STATS,
        model_name=args.model_name,
    )

    print("\n" + "="*60)
    print("Evaluation complete!")
    print(f"Results saved to: {results['output_dir']}")
    print("="*60)


if __name__ == "__main__":
    main()

