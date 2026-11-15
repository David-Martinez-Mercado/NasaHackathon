"""Load deployed models and predict with them, including the what-if sensitivity used by the sliders."""

from __future__ import annotations

import joblib
import numpy as np
import pandas as pd
import polars as pl

from fieldshift_ml.deploy import paths
from fieldshift_ml.deploy.manifest import ModelManifest, read_manifest


def load_bundle(concept: str, version: str | None = None) -> dict:
    version = version or paths.latest_version(concept)
    return joblib.load(paths.model_dir(concept, version) / "model.joblib")


def load_manifest(concept: str, version: str | None = None) -> ModelManifest:
    version = version or paths.latest_version(concept)
    return read_manifest(paths.model_dir(concept, version))


# ----------------------------------------------------------------------------- tabular
def _features(bundle: dict, frame: pl.DataFrame) -> pd.DataFrame:
    missing = [c for c in bundle["features"] if c not in frame.columns]
    if missing:
        raise ValueError(f"Faltan variables para predecir {bundle['concept']}: {missing}")
    X = frame.select(bundle["features"]).to_pandas()
    for column in bundle["categorical"]:
        X[column] = X[column].astype("object")
    return X


def predict_tabular(bundle: dict, frame: pl.DataFrame) -> np.ndarray:
    """Regression: the prediction. Binary classification: probability of the positive class (label 1).
    Multiclass: matrix of probabilities, columns in `bundle['classes']` order."""
    X = _features(bundle, frame)
    pipeline = bundle["pipeline"]
    if bundle["task"] == "regression":
        return np.asarray(pipeline.predict(X), dtype=float)
    proba = np.asarray(pipeline.predict_proba(X), dtype=float)
    classes = bundle["classes"]
    if len(classes) == 2:
        return proba[:, classes.index("1")] if "1" in classes else proba[:, 1]
    return proba


# ----------------------------------------------------------------------------- forecast
def predict_forecast(bundle: dict, history: pd.DataFrame, horizon: int | None = None) -> pd.DataFrame:
    """Forecast `horizon` periods after the end of each series in `history` (unique_id, ds, y)."""
    model = bundle["model"]
    return model.predict(history, int(horizon or bundle["horizon"]))


# ----------------------------------------------------------------------------- index
def index_scores(bundle: dict, frame: pl.DataFrame) -> np.ndarray:
    """0-100 vulnerability: percentile of each row against the training rows."""
    X = frame.select(bundle["features"]).to_numpy().astype(float)
    score = (((X - bundle["mean"]) / bundle["scale"]) * bundle["signs"]).mean(axis=1)
    ranks = np.searchsorted(bundle["train_scores"], score, side="right") / len(bundle["train_scores"])
    return ranks * 100


# ----------------------------------------------------------------------------- what-if scenarios
# Which input columns each concept's what-if touches. Only raw climate inputs are moved; derived counts such as
# `hot_days_7` or `gdd_season` are NOT recomputed, so the effect is a sensitivity of the model, not a climate
# projection (the export says so in every layer).
SCENARIO_COLUMNS: dict[str, dict[str, list[str]]] = {
    "c05b": {
        "temp": ["T2M_MAX", "T2M_MIN", "T2M", "tmax_minus_threshold", "tmax_mean_3", "tmax_mean_7", "tmax_max_7",
                 "tmin_mean_7"],
        "rain": ["rain_sum_14", "rain_sum_30"],
    },
    "c08a": {
        "temp": ["T2M", "T2M_MAX", "T2M_MIN", "T2MDEW", "T2MWET", "TS"],
        "rain": ["PRECTOTCORR", "rain_sum_3", "rain_sum_7", "rain_sum_30"],
    },
    "c01": {
        "temp": ["tmean_season", "tmax_jul_aug", "tmin_apr_may", "tmean_winter"],
        "rain": ["ppt_preseason", "ppt_apr_may", "ppt_jun_jul", "ppt_aug_sep", "ppt_season"],
    },
}


def scenario_applies(concept: str) -> bool:
    return concept in SCENARIO_COLUMNS


def apply_scenario(concept: str, frame: pl.DataFrame, rain_pct: float = 0.0, temp_delta: float = 0.0) -> pl.DataFrame:
    """Shift the climate inputs: precipitation by `rain_pct` % and temperatures by `temp_delta` °C."""
    if concept not in SCENARIO_COLUMNS:
        raise ValueError(f"{concept} no tiene escenarios ¿y si?")
    if not -100 <= rain_pct <= 100:
        raise ValueError("rain_pct debe estar entre -100 y 100")
    cols = SCENARIO_COLUMNS[concept]
    exprs = [(pl.col(c) * (1 + rain_pct / 100)).alias(c) for c in cols["rain"] if c in frame.columns]
    exprs += [(pl.col(c) + temp_delta).alias(c) for c in cols["temp"] if c in frame.columns]
    return frame.with_columns(exprs) if exprs else frame
