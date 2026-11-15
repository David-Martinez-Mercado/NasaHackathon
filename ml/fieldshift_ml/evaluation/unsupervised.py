"""Unsupervised concepts (risk indices). With no labels the comparison rests on three questions:
is the result stable when the data change, are the groups well separated, and does it agree with
an index built from agronomic judgement?"""

from __future__ import annotations

import time

import numpy as np
import polars as pl
from scipy import stats
from sklearn import metrics as skm
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.ensemble import IsolationForest
from sklearn.mixture import GaussianMixture
from sklearn.preprocessing import StandardScaler

from fieldshift_ml.datasets.base import Dataset
from fieldshift_ml.evaluation import metrics as M


def _oriented(dataset: Dataset) -> np.ndarray:
    """Standardized features, flipped so that higher always means more vulnerable."""
    from fieldshift_ml.datasets.vulnerability import RISK_DIRECTION

    values = StandardScaler().fit_transform(dataset.frame.select(dataset.features).to_numpy().astype(float))
    signs = np.array([RISK_DIRECTION.get(name, 1) for name in dataset.features])
    return values * signs


def _to_100(score: np.ndarray) -> np.ndarray:
    return stats.rankdata(score) / len(score) * 100


def _expert(X: np.ndarray, seed: int) -> np.ndarray:
    return X.mean(axis=1)


def _pca(X: np.ndarray, seed: int) -> np.ndarray:
    component = PCA(n_components=1, random_state=seed).fit(X)
    score = component.transform(X)[:, 0]
    return score if component.components_[0].sum() >= 0 else -score


def _isolation(X: np.ndarray, seed: int) -> np.ndarray:
    return -IsolationForest(n_estimators=200, random_state=seed).fit(X).score_samples(X)


def _kmeans(X: np.ndarray, seed: int, k: int = 4) -> np.ndarray:
    return KMeans(n_clusters=k, n_init=10, random_state=seed).fit_predict(X)


def _gmm(X: np.ndarray, seed: int, k: int = 4) -> np.ndarray:
    return GaussianMixture(n_components=k, covariance_type="full", random_state=seed).fit_predict(X)


SCORE_MODELS = {"indice_experto": _expert, "pca": _pca, "isolation_forest": _isolation}
CLUSTER_MODELS = {"kmeans": _kmeans, "gmm": _gmm}


def run_unsupervised(dataset: Dataset, fast: bool, only: set[str] | None, seed: int):
    from fieldshift_ml.evaluation.runner import Result

    X = _oriented(dataset)
    rng = np.random.default_rng(seed)
    if fast and len(X) > 4000:
        keep = np.sort(rng.choice(len(X), 4000, replace=False))
        X, rows = X[keep], keep
    else:
        rows = np.arange(len(X))
    expert = _expert(X, seed)
    half_a = np.sort(rng.choice(len(X), int(len(X) * 0.8), replace=False))
    half_b = np.sort(rng.choice(len(X), int(len(X) * 0.8), replace=False))
    shared = np.intersect1d(half_a, half_b)
    results, predictions = [], []

    def add(name: str, family: str, values: np.ndarray, labels: np.ndarray, stability: float, seconds: float,
            baseline: bool = False) -> None:
        result = Result(dataset.concept, "unsupervised", name, family, "none", len(X), len(X),
                        primary="stability", is_baseline=baseline, fit_seconds=round(seconds, 2))
        result.metrics = {"stability": float(stability), **M.clustering_metrics(X, labels)}
        result.metrics["agreement_expert"] = float(stats.spearmanr(values, expert).statistic)
        results.append(result)
        predictions.append(pl.DataFrame({"model": name, "row": rows, "score": values.astype(float),
                                         "label": labels.astype(np.int64)}))

    for name, function in SCORE_MODELS.items():
        if only and name not in only and name != "indice_experto":
            continue
        start = time.perf_counter()
        score = function(X, seed)
        a, b = function(X[half_a], seed), function(X[half_b], seed + 1)
        stability = stats.spearmanr(a[np.searchsorted(half_a, shared)], b[np.searchsorted(half_b, shared)]).statistic
        terciles = np.digitize(score, np.quantile(score, [1 / 3, 2 / 3]))
        add(name, "indice", _to_100(score), terciles, stability, time.perf_counter() - start,
            baseline=name == "indice_experto")
    for name, function in CLUSTER_MODELS.items():
        if only and name not in only:
            continue
        start = time.perf_counter()
        labels = function(X, seed)
        a, b = function(X[half_a], seed), function(X[half_b], seed + 1)
        stability = skm.adjusted_rand_score(a[np.searchsorted(half_a, shared)], b[np.searchsorted(half_b, shared)])
        # order clusters by their mean expert index so that label 0 is the least vulnerable group
        unique = np.unique(labels)
        means = {k: float(expert[labels == k].mean()) for k in unique}
        rank_of = {k: rank for rank, k in enumerate(sorted(unique, key=means.get))}
        ranked = np.array([rank_of[k] for k in labels])
        cluster_score = np.array([means[k] for k in labels])
        add(name, "agrupamiento", _to_100(cluster_score), ranked, stability, time.perf_counter() - start)
    return results, pl.concat(predictions), {"fitted": {}, "skill_metric": None}
