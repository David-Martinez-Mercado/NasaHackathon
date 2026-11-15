"""Metrics per task. `PRIMARY` names the one used to rank models and whether higher is better."""

from __future__ import annotations

import numpy as np
from sklearn import metrics as skm

PRIMARY: dict[str, tuple[str, bool]] = {
    "regression": ("r2", True),
    "classification_binary": ("roc_auc", True),
    "classification_multi": ("f1_macro", True),
    "forecast": ("mase", False),
    "unsupervised": ("stability", True),
}


def regression_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    return {
        "r2": float(skm.r2_score(y_true, y_pred)),
        "rmse": float(np.sqrt(skm.mean_squared_error(y_true, y_pred))),
        "mae": float(skm.mean_absolute_error(y_true, y_pred)),
        "bias": float(np.mean(y_pred - y_true)),
    }


def classification_metrics(
    y_true: np.ndarray, y_pred: np.ndarray, proba: np.ndarray | None, n_classes: int
) -> dict[str, float]:
    out = {
        "accuracy": float(skm.accuracy_score(y_true, y_pred)),
        "balanced_accuracy": float(skm.balanced_accuracy_score(y_true, y_pred)),
        "f1_macro": float(skm.f1_score(y_true, y_pred, average="macro", zero_division=0)),
    }
    if proba is None:
        return out
    labels = np.arange(n_classes)
    try:
        if n_classes == 2:
            positive = proba[:, 1]
            out["roc_auc"] = float(skm.roc_auc_score(y_true, positive))
            out["pr_auc"] = float(skm.average_precision_score(y_true, positive))
            out["brier"] = float(skm.brier_score_loss(y_true, positive))
        else:
            present = np.unique(y_true)
            if present.size == n_classes:
                out["roc_auc"] = float(
                    skm.roc_auc_score(y_true, proba, multi_class="ovr", average="macro", labels=labels)
                )
        out["log_loss"] = float(skm.log_loss(y_true, np.clip(proba, 1e-7, 1 - 1e-7), labels=labels))
    except ValueError:
        pass  # a class missing in the test fold: probability metrics are undefined
    return out


def forecast_metrics(y_true: np.ndarray, y_pred: np.ndarray, scale: np.ndarray) -> dict[str, float]:
    """`scale` is the in-sample seasonal-naive MAE of each row's series (for MASE)."""
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    error = y_pred - y_true
    denom = (np.abs(y_true) + np.abs(y_pred)) / 2
    smape = np.where(denom > 0, np.abs(error) / np.where(denom > 0, denom, 1), 0.0)
    return {
        "mase": float(np.mean(np.abs(error) / scale)),
        "mae": float(np.mean(np.abs(error))),
        "rmse": float(np.sqrt(np.mean(error**2))),
        "smape": float(np.mean(smape) * 100),
        "r2": float(skm.r2_score(y_true, y_pred)),
        "bias": float(np.mean(error)),
    }


def clustering_metrics(features: np.ndarray, labels: np.ndarray) -> dict[str, float]:
    if np.unique(labels).size < 2:
        return {}
    sample = min(10_000, features.shape[0])
    return {
        "silhouette": float(skm.silhouette_score(features, labels, sample_size=sample, random_state=0)),
        "davies_bouldin": float(skm.davies_bouldin_score(features, labels)),
        "calinski_harabasz": float(skm.calinski_harabasz_score(features, labels)),
    }


def primary_metric(task: str, n_classes: int | None = None) -> tuple[str, bool]:
    if task == "classification":
        return PRIMARY["classification_binary" if n_classes == 2 else "classification_multi"]
    return PRIMARY[task]
