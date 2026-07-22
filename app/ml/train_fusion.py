#!/usr/bin/env python3
"""
train_fusion.py — Training script for SentinelFusionModel.

Generates realistic synthetic training data based on known physiological
and behavioural patterns for each mental-health class, then trains the
multi-modal fusion model and exports it as a TorchScript module for
production inference.

Run:
    python -m app.ml.train_fusion --epochs 100 --batch-size 32

Classes:
    0  REST                 — balanced daily patterns
    1  STRESSED             — high HR/GSR, erratic typing, scattered mobility
    2  EXCITED              — high typing speed, high app usage, high mobility
    3  DEPRESSIVE_ISOLATION — very low mobility, high home time, low activity
    4  ANXIOUS_PACING       — high backspace, frequent app switching,
                              high location variance but low net distance
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset

# Ensure the app package is importable
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.ml.behavioral_schema import (
    N_KEYSTROKE, N_APP, N_GPS, N_BIOMETRIC, N_CLASSES, CLASSES,
)
from app.ml.fusion_model import SentinelFusionModel, FocalLoss, compute_metrics
from app.ml.feature_extractor import compile_model_features


# ═══════════════════════════════════════════════════════════════════
# 1.  Synthetic data generator
# ═══════════════════════════════════════════════════════════════════

def _random_walk(n: int, scale: float = 0.05) -> np.ndarray:
    """Ornstein-Uhlenbeck-like smooth random walk."""
    x = np.zeros(n, dtype=np.float32)
    for i in range(1, n):
        x[i] = x[i-1] + np.random.normal(0, scale)
        x[i] = np.clip(x[i], -3.0, 3.0)
    return x


def _make_class_template(class_id: int) -> dict:
    """
    Return base pattern parameters for each class.
    These are then perturbed per-sample to create realistic variation.
    """
    tpls = {
        # ── REST ──────────────────────────────────────────────
        0: {
            "hr_base": 68, "gsr_base": 3.0,
            "flight_base": 200, "dwell_base": 85,
            "backspace_base": 0.04,
            "typing_speed": 5.5,
            "screen_time": 12,
            "social_usage": 4, "game_usage": 1,
            "distance_km": 3.0, "mobility_radius": 1.2,
            "home_ratio": 0.55,
            "late_night": 2.0,
            "app_switches": 12,
        },
        # ── STRESSED ──────────────────────────────────────────
        1: {
            "hr_base": 98, "gsr_base": 9.0,
            "flight_base": 310, "dwell_base": 160,  # erratic, long dwell
            "backspace_base": 0.18,
            "typing_speed": 3.2,                    # slowed by anxiety
            "screen_time": 22,
            "social_usage": 8, "game_usage": 4,
            "distance_km": 1.5, "mobility_radius": 0.6,
            "home_ratio": 0.75,
            "late_night": 15.0,
            "app_switches": 35,                      # high fragmentation
        },
        # ── EXCITED ───────────────────────────────────────────
        2: {
            "hr_base": 88, "gsr_base": 7.0,
            "flight_base": 140, "dwell_base": 65,   # fast typing
            "backspace_base": 0.06,
            "typing_speed": 7.8,
            "screen_time": 18,
            "social_usage": 14, "game_usage": 6,
            "distance_km": 8.0, "mobility_radius": 3.5,
            "home_ratio": 0.35,
            "late_night": 5.0,
            "app_switches": 25,
        },
        # ── DEPRESSIVE_ISOLATION ──────────────────────────────
        3: {
            "hr_base": 62, "gsr_base": 2.0,         # flattened
            "flight_base": 190, "dwell_base": 80,
            "backspace_base": 0.10,
            "typing_speed": 3.5,
            "screen_time": 8,
            "social_usage": 0.5, "game_usage": 2,
            "distance_km": 0.2, "mobility_radius": 0.05,
            "home_ratio": 0.98,
            "late_night": 35.0,                     # severe sleep disruption
            "app_switches": 5,
        },
        # ── ANXIOUS_PACING ────────────────────────────────────
        4: {
            "hr_base": 90, "gsr_base": 6.5,
            "flight_base": 280, "dwell_base": 145,
            "backspace_base": 0.28,                 # very high correction
            "typing_speed": 4.0,
            "screen_time": 20,
            "social_usage": 6, "game_usage": 3,
            "distance_km": 1.8, "mobility_radius": 2.2,  # high variance
            "home_ratio": 0.60,
            "late_night": 25.0,
            "app_switches": 40,                     # maximum fragmentation
        },
    }
    return tpls[class_id]


def generate_sample(class_id: int,
                    seed: int | None = None) -> tuple[dict[str, np.ndarray], np.ndarray]:
    """
    Generate one 24 h sample (288 time steps at 5 min resolution).

    Returns:
        inputs: dict of (288, *) arrays
        static_feat: (7,)  — bio feature vector from compile_model_features
    """
    if seed is not None:
        np.random.seed(seed)

    T = 288
    tmpl = _make_class_template(class_id)

    # ── Keystroke (288, 8) ──────────────────────────────────
    hr_day = tmpl["hr_base"] + 5 * np.sin(2 * np.pi * np.arange(T) / 288 * 2)
    # Simulate active vs idle periods
    active_mask = np.random.random(T) > 0.4
    active_mask[:int(T * 0.15)] = False      # "sleep" — first ~3 hours
    active_mask[int(T * 0.70):] = False      # late night taper

    flight = np.where(active_mask,
        tmpl["flight_base"] + 30 * _random_walk(T, 0.08) + np.random.normal(0, 25, T),
        0.0)
    dwell  = np.where(active_mask,
        tmpl["dwell_base"] + 20 * _random_walk(T, 0.06) + np.random.normal(0, 15, T),
        0.0)
    backspace = np.where(active_mask,
        tmpl["backspace_base"] + 0.03 * _random_walk(T, 0.1),
        0.0)
    speed = np.where(active_mask,
        tmpl["typing_speed"] + 1.5 * _random_walk(T, 0.05),
        0.0)
    pause_freq = np.where(active_mask,
        0.3 + 0.3 * np.random.random(T),
        0.0)
    keystrokes = np.where(active_mask,
        (speed * 300).astype(np.float32), 0.0)

    keystroke = np.stack([
        np.maximum(flight, 0), np.maximum(np.abs(_random_walk(T, 0.1)) * 40, 0),
        np.maximum(dwell, 0),  np.maximum(np.abs(_random_walk(T, 0.1)) * 20, 0),
        np.clip(backspace, 0, 0.5),
        np.maximum(speed, 0),
        np.clip(pause_freq, 0, 3.0),
        keystrokes,
    ], axis=-1).astype(np.float32)

    # ── App activity (288, 10) ──────────────────────────────
    social    = np.clip(tmpl["social_usage"] / 12 + 0.3 * _random_walk(T, 0.1), 0, None)
    product   = np.clip(4 / 12 + 0.2 * _random_walk(T, 0.05), 0, None)
    game      = np.clip(tmpl["game_usage"] / 12 + 0.1 * _random_walk(T, 0.1), 0, None)
    health    = np.clip(0.5 / 12 + 0.05 * _random_walk(T, 0.1), 0, None)
    comms     = np.clip(3 / 12 + 0.2 * _random_walk(T, 0.05), 0, None)
    entert    = np.clip(2 / 12 + 0.2 * _random_walk(T, 0.1), 0, None)
    screen_on = np.where(active_mask,
        tmpl["screen_time"] / 12 + 0.5 * _random_walk(T, 0.08), 0.0)
    late_night = np.where(np.arange(T) > 276,  # after 23:00
        tmpl["late_night"] / 12 + 0.2 * _random_walk(T, 0.1), 0.0)
    app_sw = np.where(active_mask,
        tmpl["app_switches"] / 12 + 2 * _random_walk(T, 0.1),
        0.0)

    app = np.stack([
        np.maximum(social, 0), np.maximum(product, 0),
        np.maximum(game, 0), np.maximum(health, 0),
        np.maximum(comms, 0), np.maximum(entert, 0),
        np.maximum(screen_on, 0), np.maximum(late_night, 0),
        np.maximum(app_sw, 0),
        np.full(T, tmpl["screen_time"] / 4),  # longest_session
    ], axis=-1).astype(np.float32)

    # ── GPS telemetry (288, 7) ──────────────────────────────
    distance = np.clip(tmpl["distance_km"] / 12 + 0.1 * _random_walk(T, 0.15), 0, None)
    variance = np.clip(0.3 * (tmpl["mobility_radius"] / 3.0)
                       + 0.05 * _random_walk(T, 0.1), 0, 1.0)
    radius   = np.clip(tmpl["mobility_radius"] / 12 + 0.05 * _random_walk(T, 0.1), 0, None)
    n_places = np.full(T, max(1, tmpl["n_unique_places"])) if "n_unique_places" in tmpl \
               else np.full(T, 3)
    home_r   = np.clip(tmpl["home_ratio"] + 0.05 * _random_walk(T, 0.05), 0, 1.0)
    entropy  = np.clip(1.2 * (1 - tmpl["home_ratio"]) + 0.2 * _random_walk(T, 0.1), 0, None)
    flight_m = np.clip(tmpl["distance_km"] * 200 / 12 + 10 * _random_walk(T, 0.1), 0, None)

    gps = np.stack([
        np.maximum(distance, 0), np.clip(variance, 0, 1),
        np.maximum(radius, 0), n_places.astype(np.float32),
        np.clip(home_r, 0, 1), np.maximum(entropy, 0),
        np.maximum(flight_m, 0),
    ], axis=-1).astype(np.float32)

    # ── Biometric time-series (288, 7) ──────────────────────
    hr = tmpl["hr_base"] + 10 * np.sin(2 * np.pi * np.arange(T) / (288 * 2))
    hr += 5 * _random_walk(T, 0.08)
    gsr = tmpl["gsr_base"] + 2 * _random_walk(T, 0.1)
    scl = gsr.copy()
    scr = np.maximum(0.1 * (np.random.random(T) > 0.97).astype(float) * _random_walk(T, 0.3), 0)
    sdnn = 45 - 15 * (tmpl["hr_base"] / 100) + 5 * _random_walk(T, 0.05)
    rmssd = 35 - 12 * (tmpl["hr_base"] / 100) + 4 * _random_walk(T, 0.05)

    bio_ts = np.stack([
        np.maximum(hr, 30), np.maximum(gsr, 0.1),
        np.maximum(scl, 0.1), np.maximum(scr, 0),
        np.maximum(sdnn, 5), np.maximum(rmssd, 5),
        np.zeros(T, dtype=np.float32),             # placeholder
    ], axis=-1).astype(np.float32)

    # ── Static feature vector (7,) ──────────────────────────
    from app.ml.feature_extractor import extract_gsr_features, extract_hrv_features, compile_model_features

    # Use the mean across the day
    ibi_ms = 60000.0 / np.maximum(np.mean(bio_ts[:, 0]), 30)
    gsr_feat = extract_gsr_features(bio_ts[:, 1])
    hrv_feat = extract_hrv_features(np.full(5, ibi_ms))
    static_feat_v = compile_model_features(gsr_feat, hrv_feat)
    static_feat = np.array([
        static_feat_v.get("mean_hr", 70.0),
        static_feat_v.get("mean_gsr", 3.0),
        static_feat_v.get("std_gsr", 0.5),
        static_feat_v.get("mean_scl", 3.0),
        static_feat_v.get("max_scr", 0.0),
        static_feat_v.get("sdnn", 45.0),
        static_feat_v.get("rmssd", 35.0),
    ], dtype=np.float32)
    static_feat[0] = np.mean(bio_ts[:, 0])  # actual mean HR

    inputs = {
        "keystroke":    keystroke,
        "app":          app,
        "gps":          gps,
        "biometric_ts": bio_ts,
    }

    return inputs, static_feat


def generate_dataset(n_samples: int, seed: int = 42) -> TensorDataset:
    """Generate a balanced dataset across all N_CLASSES classes."""
    rng = np.random.RandomState(seed)
    n_per_class = n_samples // N_CLASSES

    all_inputs = {k: [] for k in ["keystroke", "app", "gps", "biometric_ts"]}
    all_static = []
    all_labels = []

    for cid in range(N_CLASSES):
        for i in range(n_per_class):
            inp, static = generate_sample(cid, seed=rng.randint(0, 2**31))
            for k in all_inputs:
                all_inputs[k].append(inp[k])
            all_static.append(static)
            all_labels.append(cid)

    cat = {k: np.stack(v, axis=0) for k, v in all_inputs.items()}
    static_np = np.stack(all_static, axis=0)
    labels_np = np.array(all_labels, dtype=np.int64)

    return TensorDataset(
        torch.from_numpy(cat["keystroke"]),
        torch.from_numpy(cat["app"]),
        torch.from_numpy(cat["gps"]),
        torch.from_numpy(cat["biometric_ts"]),
        torch.from_numpy(static_np),
        torch.from_numpy(labels_np),
    )


# ═══════════════════════════════════════════════════════════════════
# 2.  Training loop
# ═══════════════════════════════════════════════════════════════════

def train(args: argparse.Namespace) -> None:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[Training] Device: {device}")
    print(f"[Training] Classes: {CLASSES}")
    print(f"[Training] Hidden size: {args.hidden_size}")
    print()

    # ── Data ─────────────────────────────────────────────────
    print(f"[Data] Generating {args.samples} synthetic samples...")
    dataset = generate_dataset(args.samples, seed=42)
    n_train = int(len(dataset) * 0.80)
    n_val   = len(dataset) - n_train
    train_ds, val_ds = torch.utils.data.random_split(
        dataset, [n_train, n_val],
        generator=torch.Generator().manual_seed(42),
    )
    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True)
    val_loader   = DataLoader(val_ds,   batch_size=args.batch_size, shuffle=False)

    print(f"  Train: {n_train} samples  |  Val: {n_val} samples")

    # ── Model ────────────────────────────────────────────────
    model = SentinelFusionModel(
        hidden_size = args.hidden_size,
        num_classes = N_CLASSES,
        dropout     = args.dropout,
    ).to(device)

    total_params = sum(p.numel() for p in model.parameters())
    print(f"\n[Model] {total_params:,} parameters")

    # ── Loss & Optimiser ─────────────────────────────────────
    if args.focal_gamma > 0:
        criterion = FocalLoss(gamma=args.focal_gamma)
        print(f"[Loss] FocalLoss (gamma={args.focal_gamma})")
    else:
        criterion = nn.CrossEntropyLoss()
        print(f"[Loss] CrossEntropyLoss")

    optimizer = optim.AdamW(
        model.parameters(),
        lr=args.lr,
        weight_decay=args.weight_decay,
    )
    scheduler = optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=args.epochs, eta_min=args.lr * 0.01,
    )

    # ── Training ─────────────────────────────────────────────
    best_val_acc = 0.0
    best_state = None

    for epoch in range(1, args.epochs + 1):
        model.train()
        train_losses = []

        for batch in train_loader:
            ks, ap, gs, bt, sf, labels = [x.to(device) for x in batch]
            inputs = {
                "keystroke":    ks,
                "app":          ap,
                "gps":          gs,
                "biometric_ts": bt,
                "biometric_feat": sf,
            }
            out = model(inputs)
            loss = criterion(out["logits"], labels)

            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), args.clip_norm)
            optimizer.step()

            train_losses.append(loss.item())

        scheduler.step()

        # ── Validation ───────────────────────────────────────
        if epoch % args.eval_every == 0 or epoch == args.epochs:
            model.eval()
            val_losses = []
            all_preds, all_targets = [], []

            with torch.no_grad():
                for batch in val_loader:
                    ks, ap, gs, bt, sf, labels = [x.to(device) for x in batch]
                    inputs = {
                        "keystroke":    ks,
                        "app":          ap,
                        "gps":          gs,
                        "biometric_ts": bt,
                        "biometric_feat": sf,
                    }
                    out = model(inputs)
                    loss = criterion(out["logits"], labels)
                    val_losses.append(loss.item())

                    preds = out["logits"].argmax(dim=-1)
                    all_preds.append(preds.cpu())
                    all_targets.append(labels.cpu())

            all_preds   = torch.cat(all_preds)
            all_targets = torch.cat(all_targets)
            metrics = compute_metrics(all_preds, all_targets)

            tr_loss = np.mean(train_losses[-len(val_loader):])
            val_loss = np.mean(val_losses)

            print(f"Epoch {epoch:3d}/{args.epochs}  "
                  f"tr_loss={tr_loss:.4f}  val_loss={val_loss:.4f}  "
                  f"acc={metrics['accuracy']:.4f}  "
                  f"F1_macro={metrics['f1_macro']:.4f}  "
                  f"F1_weighted={metrics['f1_weighted']:.4f}")

            if metrics["accuracy"] > best_val_acc:
                best_val_acc = metrics["accuracy"]
                best_state = model.state_dict().copy()
                print(f"  ★ New best accuracy: {best_val_acc:.4f}")

    # ── Save ─────────────────────────────────────────────────
    model_dir = Path(__file__).resolve().parents[2] / "app" / "ml" / "models"
    model_dir.mkdir(exist_ok=True)

    if best_state is not None:
        model.load_state_dict(best_state)

    # TorchScript export
    script_path = model_dir / "sentinel_fusion_v1.pt"
    model.eval()
    dummy = {
        "keystroke":      torch.randn(1, 288, N_KEYSTROKE).to(device),
        "app":            torch.randn(1, 288, N_APP).to(device),
        "gps":            torch.randn(1, 288, N_GPS).to(device),
        "biometric_ts":   torch.randn(1, 288, N_BIOMETRIC).to(device),
        "biometric_feat": torch.randn(1, 7).to(device),
    }
    script_module = torch.jit.trace(model, example_inputs=dummy)
    script_module.save(str(script_path))

    # Also save state dict for fine-tuning
    state_path = model_dir / "sentinel_fusion_v1_state.pt"
    torch.save(model.state_dict(), state_path)

    print(f"\n[Done] Best val accuracy: {best_val_acc:.4f}")
    print(f"       TorchScript:  {script_path}")
    print(f"       State dict:   {state_path}")


# ═══════════════════════════════════════════════════════════════════
# 3.  CLI
# ═══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Train SentinelMind fusion model on synthetic data."
    )
    parser.add_argument("--epochs",       type=int,   default=100)
    parser.add_argument("--batch-size",   type=int,   default=32)
    parser.add_argument("--hidden-size",  type=int,   default=64)
    parser.add_argument("--dropout",      type=float, default=0.3)
    parser.add_argument("--lr",           type=float, default=1e-3)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--clip-norm",    type=float, default=1.0)
    parser.add_argument("--samples",      type=int,   default=5000)
    parser.add_argument("--focal-gamma",  type=float, default=2.0,
                        help="Focal loss gamma (0 = standard CE)")
    parser.add_argument("--eval-every",   type=int,   default=5)
    args = parser.parse_args()

    train(args)
