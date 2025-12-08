"""
Torch Dataset / DataLoader wrappers for player game-by-game modeling.

This module assumes that feature and target tables have already been built
using `features.build_feature_tables`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset

from .config import ALL_TARGET_STATS


@dataclass
class Encoders:
    """
    Stores mappings for categorical variables and numeric scalers.
    """

    category_maps: Dict[str, Dict[str, int]]
    numeric_means: Dict[str, float]
    numeric_stds: Dict[str, float]


class PlayerGameDataset(Dataset):
    """
    Simple tabular dataset for player-game rows.
    """

    def __init__(
        self,
        features: pd.DataFrame,
        targets: pd.DataFrame,
        encoders: Encoders,
        target_names: List[str] | None = None,
    ) -> None:
        self.features = features.reset_index(drop=True)
        self.targets = targets.reset_index(drop=True)
        self.encoders = encoders
        self.target_names = target_names or ALL_TARGET_STATS

        # Pre-encode categorical columns and scale numeric columns
        self.cat_cols = ["team", "opponent_team", "position"]
        # Exclude categorical, ID columns, and datetime columns from numeric processing
        excluded_cols = self.cat_cols + ["player_id", "game_id", "season", "game_type", "game_date"]
        self.num_cols = [
            c
            for c in self.features.columns
            if c not in excluded_cols
            and not isinstance(self.features[c].dtype, pd.CategoricalDtype)
            and not pd.api.types.is_datetime64_any_dtype(self.features[c])
        ]

        self._encoded_cats = self._encode_categoricals(self.features[self.cat_cols])
        self._numeric = self._scale_numerics(self.features[self.num_cols])

        target_array = self.targets[self.target_names].fillna(0.0).to_numpy(
            dtype=np.float32
        )
        self._targets = torch.from_numpy(target_array)

    def _encode_categoricals(self, cats: pd.DataFrame) -> torch.Tensor:
        arrays = []
        for col in self.cat_cols:
            mapping = self.encoders.category_maps.get(col, {})
            unk_idx = len(mapping)  # unknowns get last index
            arrays.append(
                cats[col]
                    .astype(str)
                    .map(mapping)
                    .fillna(unk_idx)
                    .astype(np.int64)
                    .to_numpy()
            )
        stacked = np.stack(arrays, axis=1)
        return torch.from_numpy(stacked)

    def _scale_numerics(self, nums: pd.DataFrame) -> torch.Tensor:
        arr = nums.fillna(0.0).to_numpy(dtype=np.float32)
        for i, col in enumerate(self.num_cols):
            mean = self.encoders.numeric_means.get(col, 0.0)
            std = self.encoders.numeric_stds.get(col, 1.0)
            if std == 0:
                continue
            arr[:, i] = (arr[:, i] - mean) / std
        return torch.from_numpy(arr)

    def __len__(self) -> int:
        return len(self.features)

    def __getitem__(self, idx: int) -> Dict[str, torch.Tensor]:
        return {
            "numeric": self._numeric[idx],
            "categorical": self._encoded_cats[idx],
            "targets": self._targets[idx],
        }


def fit_encoders(features: pd.DataFrame) -> Encoders:
    """
    Fit categorical mappings and numeric scalers on the training split.
    """
    cat_cols = ["team", "opponent_team", "position"]
    category_maps: Dict[str, Dict[str, int]] = {}
    for col in cat_cols:
        uniques = sorted(features[col].astype(str).dropna().unique())
        category_maps[col] = {v: i for i, v in enumerate(uniques)}

    numeric_means: Dict[str, float] = {}
    numeric_stds: Dict[str, float] = {}
    # Exclude categorical, ID columns, and datetime columns
    excluded_cols = cat_cols + ["player_id", "game_id", "season", "game_type", "game_date"]
    num_cols = [
        c
        for c in features.columns
        if c not in excluded_cols
        and not pd.api.types.is_datetime64_any_dtype(features[c])
    ]
    for col in num_cols:
        # Skip if column is datetime or not numeric
        if pd.api.types.is_datetime64_any_dtype(features[col]):
            continue
        try:
            series = features[col].astype(float)
            numeric_means[col] = float(series.mean())
            numeric_stds[col] = float(series.std(ddof=0) or 1.0)
        except (TypeError, ValueError):
            # Skip columns that can't be converted to float
            continue

    return Encoders(
        category_maps=category_maps,
        numeric_means=numeric_means,
        numeric_stds=numeric_stds,
    )



