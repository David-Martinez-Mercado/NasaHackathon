"""Metrics per task. `PRIMARY` names the one used to rank models and whether higher is better."""

from __future__ import annotations

from collections.abc import Callable

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
        "f1_weighted": float(skm.f1_score(y_true, y_pred, average="weighted", zero_division=0)),
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


def per_class_report(y_true: np.ndarray, y_pred: np.ndarray, class_names: list[str]) -> dict[str, dict[str, float]]:
    """Precision, recall, F1 and support of every class (classes absent from the test fold get support 0)."""
    report = skm.classification_report(
        y_true, y_pred, labels=np.arange(len(class_names)), target_names=class_names, output_dict=True,
        zero_division=0,
    )
    return {
        name: {"precision": float(v["precision"]), "recall": float(v["recall"]), "f1": float(v["f1-score"]),
               "support": int(v["support"])}
        for name, v in report.items() if name in class_names
    }


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


def time_blocks(values: np.ndarray, min_blocks: int = 5) -> np.ndarray:
    """One block label per row: the year if the test period has at least `min_blocks` of them, else the month,
    else the week. Integer values (a year column) are already blocks."""
    values = np.asarray(values)
    if values.dtype.kind in "iu":
        return values
    for unit in ("Y", "M", "W"):
        blocks = values.astype(f"datetime64[{unit}]")
        if np.unique(blocks).size >= min_blocks or unit == "W":
            return blocks.astype("int64")
    raise AssertionError("unreachable")


def block_bootstrap_ci(metric: Callable[[np.ndarray], float], blocks: np.ndarray, n_boot: int = 200,
                       alpha: float = 0.05, seed: int = 0, min_blocks: int = 3) -> tuple[float, float]:
    """Confidence interval of a metric that respects time order: whole blocks (years, windows) are resampled with
    replacement, never single rows, because neighbouring days or cells are strongly correlated.

    `metric(rows)` receives the row indices of a resample (with repeats) and returns the metric, or NaN when it is
    undefined (e.g. a resample without one of the two classes). Returns (low, high) percentiles; (nan, nan) if there
    are fewer than `min_blocks` blocks or too few valid resamples.
    """
    blocks = np.asarray(blocks)
    labels, inverse = np.unique(blocks, return_inverse=True)
    if n_boot <= 0 or labels.size < min_blocks:
        return float("nan"), float("nan")
    order = np.argsort(inverse, kind="stable")
    bounds = np.searchsorted(inverse[order], np.arange(labels.size + 1))
    rows = [order[bounds[i]:bounds[i + 1]] for i in range(labels.size)]
    rng = np.random.default_rng(seed)
    values = []
    for _ in range(n_boot):
        pick = rng.integers(0, labels.size, labels.size)
        value = metric(np.concatenate([rows[i] for i in pick]))
        if np.isfinite(value):
            values.append(value)
    if len(values) < max(10, n_boot // 5):
        return float("nan"), float("nan")
    low, high = np.percentile(values, [100 * alpha / 2, 100 * (1 - alpha / 2)])
    return float(low), float(high)


def primary_metric_fn(task: str, y_true: np.ndarray, y_pred: np.ndarray, proba: np.ndarray | None = None,
                      scale: np.ndarray | None = None, n_classes: int | None = None) -> Callable[[np.ndarray], float]:
    """The primary metric of `task` as a function of row indices, ready for `block_bootstrap_ci`."""
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)
    if task == "regression":
        return lambda idx: float(skm.r2_score(y_true[idx], y_pred[idx]))
    if task == "forecast":
        error = np.abs(y_pred - y_true) / np.asarray(scale, dtype=float)
        return lambda idx: float(np.mean(error[idx]))
    if n_classes == 2:
        positive = np.asarray(proba)[:, 1] if proba is not None else None

        def auc(idx: np.ndarray) -> float:
            if positive is None or np.unique(y_true[idx]).size < 2:
                return float("nan")
            return float(skm.roc_auc_score(y_true[idx], positive[idx]))

        return auc
    return lambda idx: float(skm.f1_score(y_true[idx], y_pred[idx], average="macro", zero_division=0))


def primary_metric(task: str, n_classes: int | None = None) -> tuple[str, bool]:
    if task == "classification":
        return PRIMARY["classification_binary" if n_classes == 2 else "classification_multi"]
    return PRIMARY[task]
