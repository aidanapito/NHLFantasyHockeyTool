"""
PyTorch models for player game-by-game projections.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List

import torch
from torch import nn


@dataclass
class TabularModelConfig:
    num_numeric_features: int
    num_targets: int
    team_vocab_size: int
    opponent_vocab_size: int
    position_vocab_size: int
    hidden_dims: List[int]
    dropout: float = 0.1
    embedding_dim: int = 16


class TabularMultiTaskModel(nn.Module):
    """
    Simple MLP-based model for multi-target regression on tabular data.
    """

    def __init__(self, cfg: TabularModelConfig) -> None:
        super().__init__()
        self.cfg = cfg

        # Embeddings for categorical features
        self.team_emb = nn.Embedding(cfg.team_vocab_size + 1, cfg.embedding_dim)
        self.opp_emb = nn.Embedding(cfg.opponent_vocab_size + 1, cfg.embedding_dim)
        self.pos_emb = nn.Embedding(cfg.position_vocab_size + 1, cfg.embedding_dim)

        input_dim = (
            cfg.num_numeric_features + cfg.embedding_dim * 3
        )

        layers = []
        prev_dim = input_dim
        for h in cfg.hidden_dims:
            layers.append(nn.Linear(prev_dim, h))
            layers.append(nn.BatchNorm1d(h))
            layers.append(nn.ReLU())
            layers.append(nn.Dropout(cfg.dropout))
            prev_dim = h
        self.mlp = nn.Sequential(*layers)

        self.head = nn.Linear(prev_dim, cfg.num_targets)

    def forward(self, numeric: torch.Tensor, categorical: torch.Tensor) -> torch.Tensor:
        """
        numeric: (batch, num_numeric_features)
        categorical: (batch, 3) -> [team_idx, opponent_idx, position_idx]
        """
        team_idx = categorical[:, 0]
        opp_idx = categorical[:, 1]
        pos_idx = categorical[:, 2]

        team_e = self.team_emb(team_idx)
        opp_e = self.opp_emb(opp_idx)
        pos_e = self.pos_emb(pos_idx)

        x = torch.cat([numeric, team_e, opp_e, pos_e], dim=1)
        h = self.mlp(x)
        out = self.head(h)
        return out



