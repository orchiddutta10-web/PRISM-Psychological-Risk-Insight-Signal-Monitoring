"""
Feature engineering utilities — ports notebook cells 2,4,5 logic into
production-quality modules.

Provides:
  - TimeSeriesFeatureEngineer  (rolling windows, cyclical encoding, ratios)
  - cap_outliers_iqr           (IQR-based outlier capping)
  - prune_collinear_features   (correlation-based feature pruning)
  - select_features_mutual_info (mutual information ranking)
  - chrono_split               (chronological train/test split)

These are designed for MODEL TRAINING (in scripts/train_models.py),
not for real-time inference. The FeatureVectorBuilder in prism_ml_engine.py
handles inference-time feature extraction from the database.
"""

from __future__ import annotations

import logging
from typing import Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.feature_selection import mutual_info_classif, mutual_info_regression
from sklearn.preprocessing import StandardScaler

logger = logging.getLogger(__name__)

# ─── Time-Series Feature Engineer ────────────────────────────────────────


class TimeSeriesFeatureEngineer:
    """
    Port of notebook cells 4-5: rolling window features, cyclical encoding,
    and composite behavioral ratios.

    Usage (training):
        engineer = TimeSeriesFeatureEngineer()
        df = engineer.fit_transform(df)

    Usage (inference on a single window):
        # Not designed for single-row inference — use FeatureVectorBuilder for that.
        # This class operates on multi-row DataFrames for training.
    """

    CORE_METRICS = [
        "Sleep_Score",
        "Steps_Count",
        "Screen_Time_Hours",
        "Audio_Sentiment",
        "Vocal_Pitch_Variance",
        "Time_at_Home_Pct",
        "Typing_Speed_WPM",
        "Pulse_Rate_BPM",
    ]

    ROLLING_WINDOWS = [3, 7, 14]

    def fit_transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Apply all feature engineering steps to a DataFrame.
        Expects columns: Sleep_Score, Steps_Count, Screen_Time_Hours,
        Typing_Speed_WPM, Pulse_Rate_BPM, App_Activity, Audio_Sentiment,
        Vocal_Pitch_Variance, Selfie_Smile_Pct, Day_of_Week, Time_at_Home_Pct.
        """
        df = df.copy()

        df = self._add_cyclical_encoding(df)
        df = self._add_rolling_features(df)
        df = self._add_composite_ratios(df)
        df = self._one_hot_encode_categorical(df)

        return df

    @staticmethod
    def encode_cyclical(
        series: pd.Series, period: float
    ) -> Tuple[pd.Series, pd.Series]:
        """Encode a cyclical variable (day_of_week, hour, etc.) as sin/cos."""
        normalized = 2.0 * np.pi * series / period
        return pd.Series(np.sin(normalized), name=f"{series.name}_sin"), pd.Series(
            np.cos(normalized), name=f"{series.name}_cos"
        )

    def _add_cyclical_encoding(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add sin/cos encoding for Day_of_Week."""
        if "Day_of_Week" in df.columns:
            df["sin_Day_of_Week"], df["cos_Day_of_Week"] = self.encode_cyclical(
                df["Day_of_Week"].astype(float), period=7.0
            )
        return df

    def _add_rolling_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add rolling mean, std, and deviation-from-baseline for core metrics."""
        available_metrics = [c for c in self.CORE_METRICS if c in df.columns]

        for col in available_metrics:
            series = df[col].astype(float)
            for window in self.ROLLING_WINDOWS:
                # Rolling mean
                df[f"{col}_{window}d_mean"] = series.rolling(
                    window=window, min_periods=1
                ).mean()
                # Rolling standard deviation
                std_col = f"{col}_{window}d_std"
                df[std_col] = series.rolling(window=window, min_periods=1).std()
                df[std_col] = df[std_col].fillna(0.0)

            # Deviation from 7-day baseline (most interpretable)
            if "7d_mean" not in col:
                df[f"{col}_dev_from_7d"] = series - df.get(f"{col}_7d_mean", series)

        return df

    def _add_composite_ratios(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add derived behavioral ratios from notebook cell 5."""
        sleep = df.get("Sleep_Score", pd.Series([1.0] * len(df)))
        screen = df.get("Screen_Time_Hours", pd.Series([0.0] * len(df)))
        steps = df.get("Steps_Count", pd.Series([0.0] * len(df)))
        home_pct = df.get("Time_at_Home_Pct", pd.Series([0.0] * len(df)))
        sentiment = df.get("Audio_Sentiment", pd.Series([0.0] * len(df)))
        pitch_var = df.get("Vocal_Pitch_Variance", pd.Series([0.0] * len(df)))
        smile = df.get("Selfie_Smile_Pct", pd.Series([0.0] * len(df)))

        df["Digital_Fatigue_Ratio"] = screen / (sleep + 1.0)
        df["Isolation_Ratio"] = home_pct / (steps + 100.0)
        df["Affect_Collapse_Score"] = (sentiment + 1.0) * pitch_var * (smile + 1.0)

        return df

    @staticmethod
    def _one_hot_encode_categorical(df: pd.DataFrame) -> pd.DataFrame:
        """One-hot encode App_Activity if present, dropping first category."""
        if "App_Activity" in df.columns:
            df = pd.get_dummies(df, columns=["App_Activity"], drop_first=True)
        return df


# ─── IQR Outlier Capping ─────────────────────────────────────────────────


def cap_outliers_iqr(
    df: pd.DataFrame, columns: list[str] | None = None, multiplier: float = 1.5
) -> pd.DataFrame:
    """
    Cap numeric column values at Q1 - multiplier*IQR / Q3 + multiplier*IQR.
    Preserves time-series continuity (caps instead of dropping rows).
    """
    df_capped = df.copy()
    if columns is None:
        columns = df_capped.select_dtypes(include=[np.number]).columns.tolist()

    for col in columns:
        if col not in df_capped.columns:
            continue
        series = df_capped[col].astype(float)
        q1 = series.quantile(0.25)
        q3 = series.quantile(0.75)
        iqr = q3 - q1
        lower = q1 - multiplier * iqr
        upper = q3 + multiplier * iqr
        df_capped[col] = np.where(series > upper, upper, series)
        df_capped[col] = np.where(series < lower, lower, df_capped[col])

    return df_capped


# ─── Collinearity Pruning ────────────────────────────────────────────────


def prune_collinear_features(
    df: pd.DataFrame, exclude_cols: list[str] | None = None, threshold: float = 0.90
) -> tuple[pd.DataFrame, list[str]]:
    """
    Remove features with pairwise correlation above threshold.
    Returns (pruned_dataframe, list_of_dropped_columns).
    """
    if exclude_cols is None:
        exclude_cols = []
    candidate_cols = [
        c
        for c in df.columns
        if c not in exclude_cols
        and df[c].dtype in ["float64", "float32", "int64", "int32"]
    ]
    if len(candidate_cols) < 2:
        return df, []

    corr = df[candidate_cols].corr().abs()
    upper = corr.where(np.triu(np.ones(corr.shape, dtype=bool), k=1))
    to_drop = [col for col in upper.columns if any(upper[col] > threshold)]

    df_pruned = df.drop(columns=to_drop, errors="ignore")
    logger.info(
        "Pruned %d collinear features (threshold=%.2f): %s",
        len(to_drop),
        threshold,
        to_drop,
    )
    return df_pruned, to_drop


# ─── Mutual Information Feature Selection ────────────────────────────────


def select_features_mutual_info(
    X: pd.DataFrame,
    y_reg: np.ndarray | None = None,
    y_clf: np.ndarray | None = None,
    top_k: int | None = None,
) -> pd.DataFrame:
    """
    Rank features by mutual information for regression and/or classification.
    Returns DataFrame with columns: Feature, MI_Regression, MI_Classification,
    sorted by classification MI descending.
    """
    results = {"Feature": X.columns.tolist()}

    if y_reg is not None:
        mi_reg = mutual_info_regression(X.values, y_reg, random_state=42)
        results["MI_Regression"] = mi_reg
    else:
        results["MI_Regression"] = np.zeros(len(X.columns))

    if y_clf is not None:
        mi_clf = mutual_info_classif(X.values, y_clf, random_state=42)
        results["MI_Classification"] = mi_clf
    else:
        results["MI_Classification"] = np.zeros(len(X.columns))

    df_ranked = pd.DataFrame(results).sort_values(
        by="MI_Classification", ascending=False
    )

    if top_k is not None:
        return df_ranked.head(top_k)
    return df_ranked


# ─── Chronological Train/Test Split ──────────────────────────────────────


def chrono_split(
    X: pd.DataFrame,
    y_reg: np.ndarray,
    y_clf: np.ndarray,
    test_size: float = 0.2,
) -> tuple[pd.DataFrame, pd.DataFrame, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Split time-series data chronologically (past → train, future → test).
    No shuffling — critical to prevent time leakage.
    """
    split_idx = int(len(X) * (1.0 - test_size))

    X_train = X.iloc[:split_idx].reset_index(drop=True)
    X_test = X.iloc[split_idx:].reset_index(drop=True)

    y_reg_train = y_reg[:split_idx]
    y_reg_test = y_reg[split_idx:]

    y_clf_train = y_clf[:split_idx]
    y_clf_test = y_clf[split_idx:]

    logger.info(
        "Chrono split: train=%d, test=%d (test_size=%.2f)",
        len(X_train),
        len(X_test),
        test_size,
    )
    return X_train, X_test, y_reg_train, y_reg_test, y_clf_train, y_clf_test


# ─── Feature Scaling Wrapper ─────────────────────────────────────────────


def safe_scale(
    X_train: pd.DataFrame, X_test: pd.DataFrame
) -> tuple[pd.DataFrame, pd.DataFrame, StandardScaler]:
    """
    Fit StandardScaler on X_train, transform both train and test.
    Returns scaled DataFrames + the fitted scaler for saving.
    """
    scaler = StandardScaler()
    X_train_scaled = pd.DataFrame(
        scaler.fit_transform(X_train), columns=X_train.columns
    )
    X_test_scaled = pd.DataFrame(scaler.transform(X_test), columns=X_test.columns)
    return X_train_scaled, X_test_scaled, scaler
