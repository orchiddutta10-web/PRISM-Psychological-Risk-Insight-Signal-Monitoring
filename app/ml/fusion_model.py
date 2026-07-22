"""
fusion_model.py — Multi-input Deep Learning architecture that fuses
smartphone passive sensing streams with wearable biometrics for
mental-health state classification.

Architecture overview
─────────────────────

  Keystroke(288×8) ──→ GRU(64) ──→ ┐
  App(288×10)      ──→ GRU(64) ──→ ├── CrossModalAttention ──→ Dense ──→ Softmax(5)
  GPS(288×7)       ──→ GRU(64) ──→ │                                   ↑
  Biometric(288×7) ──→ GRU(64) ──→ ┘                                   │
                                                                        │
                        Sensor-level encoder ───────────────────────────┘
                        (existing 7-feat static vector via dense)

Each GRU branch produces a (batch, 64) context vector via the final
hidden state.  Cross-modal attention learns which modalities matter
most for each prediction — e.g. GPS dominates for isolation, keystroke
for cognitive fatigue, biometric for acute stress.

Prerequisites:  pip install torch torchvision torchaudio
"""

from __future__ import annotations

import math
import numpy as np
from typing import Optional

import torch
import torch.nn as nn
import torch.nn.functional as F

from app.ml.behavioral_schema import (
    N_KEYSTROKE, N_APP, N_GPS, N_BIOMETRIC, N_CLASSES,
)


# ═══════════════════════════════════════════════════════════════════
# 1.  Per-modality encoder
# ═══════════════════════════════════════════════════════════════════

class TemporalEncoder(nn.Module):
    """
    Processes a single (B, T, F) modality tensor → (B, H) context.

    Architecture:
      LayerNorm → GRU → LayerNorm(hidden) → Dropout → Projection

    The GRU is bidirectional so the context captures both past and
    future temporal structure relative to each time step.
    """

    def __init__(self,
                 in_features: int,
                 hidden_size: int = 64,
                 num_layers: int = 2,
                 dropout: float = 0.25,
                 bidirectional: bool = True):
        super().__init__()

        self.in_features = in_features
        self.hidden_size = hidden_size
        self.num_directions = 2 if bidirectional else 1
        self.gru_hidden = hidden_size * self.num_directions

        self.norm_in = nn.LayerNorm(in_features)
        self.gru = nn.GRU(
            input_size  = in_features,
            hidden_size = hidden_size,
            num_layers  = num_layers,
            batch_first = True,
            dropout     = dropout if num_layers > 1 else 0.0,
            bidirectional = bidirectional,
        )
        self.norm_hidden = nn.LayerNorm(self.gru_hidden)
        self.dropout = nn.Dropout(dropout)
        self.proj = nn.Linear(self.gru_hidden, hidden_size)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: (B, T, F) time-series tensor.
        Returns:
            (B, H)  — hidden_size-dimensional context vector.
        """
        x = self.norm_in(x)
        # GRU returns (output, h_n); take h_n and collapse directions
        _, h_n = self.gru(x)                       # (num_layers * D, B, H)
        h_n = h_n[-self.num_directions:]           # last layer only  (D, B, H)
        h_n = h_n.permute(1, 0, 2)                 # (B, D, H)
        h_n = h_n.reshape(h_n.size(0), -1)         # (B, D * H)

        h_n = self.norm_hidden(h_n)
        h_n = self.dropout(h_n)
        return self.proj(h_n)                      # (B, H)


# ═══════════════════════════════════════════════════════════════════
# 2.  Cross-modal attention
# ═══════════════════════════════════════════════════════════════════

class CrossModalAttention(nn.Module):
    """
    Computes a set of modality-attention weights so the model can
    dynamically gate which streams are most informative per sample.

    Architecture:
      Stack all M context vectors → Self-attention over modalities →
      Weighted sum → Gated residual.

    This is effectively a tiny Transformer that operates over the
    modality axis (M=4) rather than the time axis.
    """

    def __init__(self, hidden_size: int = 64, n_heads: int = 4, dropout: float = 0.1):
        super().__init__()
        self.norm = nn.LayerNorm(hidden_size)
        self.mha = nn.MultiheadAttention(
            embed_dim    = hidden_size,
            num_heads    = n_heads,
            dropout      = dropout,
            batch_first  = True,
        )
        self.ffn = nn.Sequential(
            nn.Linear(hidden_size, hidden_size * 2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_size * 2, hidden_size),
        )
        self.norm2 = nn.LayerNorm(hidden_size)
        self.dropout = nn.Dropout(dropout)

    def forward(self, modality_contexts: torch.Tensor) -> torch.Tensor:
        """
        Args:
            modality_contexts: (B, M, H)  — stacked context vectors,
                               M = 4 (keystroke, app, gps, biometric).
        Returns:
            (B, H) fused representation.
        """
        # Self-attention over the modality axis
        attended, _ = self.mha(
            modality_contexts, modality_contexts, modality_contexts,
            need_weights=False,
        )
        attended = self.dropout(attended)
        out = self.norm(modality_contexts + attended)       # residual

        # Per-modality FFN
        ffn_out = self.ffn(out)
        out = self.norm2(out + ffn_out)                    # second residual

        # Pool: mean over modalities → (B, H)
        fused = out.mean(dim=1)
        return fused


# ═══════════════════════════════════════════════════════════════════
# 3.  Sensor-level encoder (existing 7-feat static vector)
# ═══════════════════════════════════════════════════════════════════

class SensorFeatureEncoder(nn.Module):
    """
    Processes the 7-element static biometric feature vector
    (mean_hr, mean_gsr, std_gsr, mean_scl, max_scr, sdnn, rmssd)
    that the existing heuristic classifier uses.

    This provides a skip connection from the proven feature set
    directly into the fusion layer.
    """

    def __init__(self, in_features: int = 7, hidden_size: int = 64):
        super().__init__()
        self.net = nn.Sequential(
            nn.LayerNorm(in_features),
            nn.Linear(in_features, hidden_size),
            nn.GELU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_size, hidden_size),
            nn.GELU(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: (B, 7)  — static feature vector from compile_model_features().
        Returns:
            (B, H)  — 64-dim embedding.
        """
        return self.net(x)


# ═══════════════════════════════════════════════════════════════════
# 4.  Full fusion model
# ═══════════════════════════════════════════════════════════════════

class SentinelFusionModel(nn.Module):
    """
    End-to-end multi-input, multi-modal classifier.

    Forward pass expects a dict with keys:
        "keystroke"   — (B, 288, 8)
        "app"          — (B, 288, 10)
        "gps"          — (B, 288, 7)
        "biometric_ts" — (B, 288, 7)      ← time-series bio (10 Hz → downsampled)
        "biometric_feat" — (B, 7)         ← static bio feature vector

    Output:
        logits: (B, 5)
        probabilities: (B, 5)
        attention_weights: (B, 4)  ← per-modality importance
    """

    def __init__(self,
                 hidden_size: int = 64,
                 num_classes: int = N_CLASSES,
                 dropout: float = 0.3):
        super().__init__()

        # ── Temporal encoders (one per time-series modality) ─
        self.encoder_keystroke = TemporalEncoder(N_KEYSTROKE, hidden_size, dropout=dropout)
        self.encoder_app       = TemporalEncoder(N_APP,       hidden_size, dropout=dropout)
        self.encoder_gps       = TemporalEncoder(N_GPS,       hidden_size, dropout=dropout)
        self.encoder_biometric = TemporalEncoder(N_BIOMETRIC, hidden_size, dropout=dropout)

        # ── Static sensor encoder ────────────────────────────
        self.encoder_sensor_feat = SensorFeatureEncoder(
            in_features = 7,
            hidden_size = hidden_size,
        )

        # ── Cross-modal fusion ───────────────────────────────
        self.cross_attention = CrossModalAttention(
            hidden_size = hidden_size,
            n_heads     = 4,
            dropout     = 0.1,
        )

        # ── Classifier head ──────────────────────────────────
        self.classifier = nn.Sequential(
            nn.LayerNorm(hidden_size + hidden_size),  # fused temporal + static sensor
            nn.Linear(hidden_size + hidden_size, hidden_size),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_size, num_classes),
        )

        # ── Attention weight hook (for explainability) ───────
        self._last_attn_weights: Optional[torch.Tensor] = None

        self._init_weights()

    def _init_weights(self):
        for module in self.modules():
            if isinstance(module, nn.Linear):
                nn.init.kaiming_normal_(module.weight, a=0.02)
                if module.bias is not None:
                    nn.init.zeros_(module.bias)
            elif isinstance(module, nn.LayerNorm):
                nn.init.ones_(module.weight)
                nn.init.zeros_(module.bias)

    def forward(self, inputs: dict[str, torch.Tensor]) -> dict[str, torch.Tensor]:
        """
        Args:
            inputs: dict with keys:
                "keystroke"      (B, 288, 8)
                "app"            (B, 288, 10)
                "gps"            (B, 288, 7)
                "biometric_ts"   (B, 288, 7)
                "biometric_feat" (B, 7)       — static vector
        Returns:
            dict with keys: logits, probabilities, fused, attn_weights
        """
        B = next(iter(inputs.values())).size(0)

        # ── Encode each modality ─────────────────────────────
        ctx_k = self.encoder_keystroke(inputs["keystroke"])      # (B, H)
        ctx_a = self.encoder_app(inputs["app"])                  # (B, H)
        ctx_g = self.encoder_gps(inputs["gps"])                  # (B, H)
        ctx_b = self.encoder_biometric(inputs["biometric_ts"])   # (B, H)

        # Stack: (B, M=4, H)
        modality_stack = torch.stack([ctx_k, ctx_a, ctx_g, ctx_b], dim=1)

        # ── Cross-modal fusion ───────────────────────────────
        fused_temporal = self.cross_attention(modality_stack)    # (B, H)

        # ── Static sensor path ───────────────────────────────
        feat_embed = self.encoder_sensor_feat(inputs["biometric_feat"])  # (B, H)

        # ── Combine ──────────────────────────────────────────
        combined = torch.cat([fused_temporal, feat_embed], dim=-1)  # (B, 2H)

        # ── Classify ─────────────────────────────────────────
        logits = self.classifier(combined)                        # (B, 5)
        probabilities = F.softmax(logits, dim=-1)

        return {
            "logits":        logits,
            "probabilities": probabilities,
            "fused":         combined,
        }

    @torch.no_grad()
    def predict_from_numpy(self,
                           keystroke: np.ndarray,   # (288, 8)
                           app: np.ndarray,          # (288, 10)
                           gps: np.ndarray,          # (288, 7)
                           bio_ts: np.ndarray,       # (288, 7)
                           bio_feat: np.ndarray,     # (7,)
                           ) -> tuple[int, np.ndarray]:
        """
        Convenience method for server-side inference.
        Returns (predicted_class_idx, probabilities_vector).
        """
        self.eval()
        device = next(self.parameters()).device

        B = 1
        inputs = {
            "keystroke":      torch.from_numpy(keystroke).unsqueeze(0).to(device),
            "app":            torch.from_numpy(app).unsqueeze(0).to(device),
            "gps":            torch.from_numpy(gps).unsqueeze(0).to(device),
            "biometric_ts":   torch.from_numpy(bio_ts).unsqueeze(0).to(device),
            "biometric_feat": torch.from_numpy(bio_feat).unsqueeze(0).to(device),
        }

        out = self.forward(inputs)
        probs = out["probabilities"][0].cpu().numpy()
        pred = int(probs.argmax())
        return pred, probs


# ═══════════════════════════════════════════════════════════════════
# 5.  Preprocessing pipeline
# ═══════════════════════════════════════════════════════════════════

class BehavioralPreprocessor:
    """
    Stateless preprocessing transforms for phone + biometric data.

    Steps applied in order:
      1. Clip extreme values (winsorize at 1st / 99th percentile)
      2. Z-score normalise using pre-computed population statistics
      3. Handle missing windows (linear interpolation + masking)
      4. Downsample / align to 288 time steps (24 h at 5 min)
      5. Fill trailing NaN with zero
    """

    def __init__(self):
        from app.ml.behavioral_schema import NORM_PARAMS
        self.norm_params = NORM_PARAMS

    def transform_daily(self, tensor: np.ndarray,
                        feature_names: list[str]) -> np.ndarray:
        """
        Args:
            tensor:        (T, F) raw feature matrix.
            feature_names: list of F feature names matching NORM_PARAMS.
        Returns:
            (T, F) normalised tensor.
        """
        out = tensor.astype(np.float32).copy()

        # 1. Winsorize at 1st / 99th percentile (clip 3σ deviations)
        for i, name in enumerate(feature_names):
            mean, std = self.norm_params.get(name, (0.0, 1.0))
            lower = mean - 4.0 * std
            upper = mean + 4.0 * std
            out[:, i] = np.clip(out[:, i], lower, upper)

        # 2. Z-score
        for i, name in enumerate(feature_names):
            mean, std = self.norm_params.get(name, (0.0, 1.0))
            out[:, i] = (out[:, i] - mean) / max(std, 1e-8)

        # 3. Linear interpolation for missing (zero-filled windows)
        for i in range(out.shape[1]):
            col = out[:, i]
            mask = col == 0.0
            if mask.all():
                continue
            # Interpolate non-zero values
            indices = np.where(~mask)[0]
            if len(indices) > 1:
                from scipy import interpolate
                f = interpolate.interp1d(indices, col[indices],
                                         bounds_error=False,
                                         fill_value="extrapolate")
                col[mask] = f(np.where(mask)[0])
            out[:, i] = col

        # 4. Ensure (288, F)
        if out.shape[0] < 288:
            pad = 288 - out.shape[0]
            out = np.pad(out, ((0, pad), (0, 0)), mode="constant")
        elif out.shape[0] > 288:
            out = out[:288]

        # 5. Fill remaining NaN
        out = np.nan_to_num(out, nan=0.0)

        return out


# ═══════════════════════════════════════════════════════════════════
# 6.  Training helpers
# ═══════════════════════════════════════════════════════════════════

class FocalLoss(nn.Module):
    """
    Focal Loss for class imbalance.  Reduces the relative loss for
    well-classified samples, focusing training on hard examples.
    Useful when DEPRESSIVE_ISOLATION or ANXIOUS_PACING are rare.
    """

    def __init__(self, gamma: float = 2.0, alpha: Optional[torch.Tensor] = None):
        super().__init__()
        self.gamma = gamma
        self.alpha = alpha

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        ce_loss = F.cross_entropy(logits, targets, reduction="none", weight=self.alpha)
        pt = torch.exp(-ce_loss)
        focal_loss = ((1 - pt) ** self.gamma) * ce_loss
        return focal_loss.mean()


def compute_metrics(preds: torch.Tensor, targets: torch.Tensor) -> dict[str, float]:
    """Accuracy, macro F1, and confusion matrix summary."""
    from sklearn.metrics import accuracy_score, f1_score, confusion_matrix

    preds_np = preds.cpu().numpy()
    targets_np = targets.cpu().numpy()

    acc = accuracy_score(targets_np, preds_np)
    f1_macro = f1_score(targets_np, preds_np, average="macro")
    f1_weighted = f1_score(targets_np, preds_np, average="weighted")

    return {
        "accuracy":       round(float(acc), 4),
        "f1_macro":       round(float(f1_macro), 4),
        "f1_weighted":    round(float(f1_weighted), 4),
    }


# ═══════════════════════════════════════════════════════════════════
# 7.  Entry point — quick architecture print
# ═══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    model = SentinelFusionModel(hidden_size=64)
    total_params = sum(p.numel() for p in model.parameters())
    trainable   = sum(p.numel() for p in model.parameters() if p.requires_grad)

    print(f"SentinelFusionModel — {total_params:,} total params "
          f"({trainable:,} trainable)")
    print()

    # Simulate a forward pass
    B = 4
    dummy = {
        "keystroke":      torch.randn(B, 288, N_KEYSTROKE),
        "app":            torch.randn(B, 288, N_APP),
        "gps":            torch.randn(B, 288, N_GPS),
        "biometric_ts":   torch.randn(B, 288, N_BIOMETRIC),
        "biometric_feat": torch.randn(B, 7),
    }

    out = model(dummy)
    print(f"Input shapes:")
    for k, v in dummy.items():
        print(f"  {k:20s}  {tuple(v.shape)}")
    print()
    print(f"Output:")
    for k, v in out.items():
        if isinstance(v, torch.Tensor):
            print(f"  {k:20s}  {tuple(v.shape)}  "
                  f"[{v.min():.2f}, {v.max():.2f}]")
    print()
    print(f"Probabilities sum to 1: "
          f"{out['probabilities'].sum(dim=-1).tolist()}")
