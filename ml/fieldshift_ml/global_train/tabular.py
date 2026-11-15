"""Global c05b (heat waves) and c08a (rain tomorrow): train on cells of many climates, test where the model never trained.

Tests, all on the LAST 20 % of the years (never used for training):
  seen    cells of the training regions, future years (does it forecast well where it learned?)
  holdout whole regions that were kept out (Africa, South Asia): the real question, does it work in a new climate?
  weld    the two Weld cells (does the global model still match the Weld-only model that is deployed today?)
Southern-hemisphere dates are shifted by 182 days so "summer" is the same season everywhere (June–August in the builders).
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

import numpy as np
import pandas as pd
import polars as pl
from sklearn.preprocessing import LabelEncoder

from fieldshift_ml.config import get_settings
from fieldshift_ml.datasets.base import Dataset
from fieldshift_ml.deploy.predict import load_bundle, predict_tabular
from fieldshift_ml.deploy.registry import DEPLOY
from fieldshift_ml.deploy.train import tabular_spec
from fieldshift_ml.evaluation import metrics as M
from fieldshift_ml.global_train import download
from fieldshift_ml.global_train.cells import region_of
from fieldshift_ml.io import power
from fieldshift_ml.models.tabular import build_pipeline

log = logging.getLogger("fieldshift_ml")
SEASON_SHIFT_DAYS = 182
MAX_TRAIN_ROWS = {"c05b": 1_500_000, "c08a": 900_000}


def season_aligned(frame: pl.DataFrame) -> pl.DataFrame:
    """Add `lat` (of the cell) and shift southern dates half a year; the cell id is in the `site` column."""
    lat = pl.col("site").str.slice(0, 7).cast(pl.Float64)
    return frame.with_columns(lat.alias("lat")).with_columns(
        pl.when(pl.col("lat") < 0).then(pl.col("date") + pl.duration(days=SEASON_SHIFT_DAYS)).otherwise(pl.col("date")).alias("date"))


def build(concept: str) -> Dataset:
    """The usual dataset builder, run on all the downloaded cells, with `lat` instead of `site` as a feature."""
    from fieldshift_ml.datasets.power_concepts import build_heatwave, build_rain_probability

    cells = season_aligned(download.load_cells())
    # the two Weld cells come from the downloaded API files too (same source as every other cell)
    with power.use_daily_frame(cells):
        ds = build_heatwave() if concept == "c05b" else build_rain_probability()
    region = pl.DataFrame({"site": cells["site"].unique()}).with_columns(
        pl.col("site").map_elements(lambda s: region_of(float(s[:7]), float(s[8:])), return_dtype=pl.String).alias("region"))
    frame = ds.frame.join(region, on="site", how="left").join(cells.select("site", "lat").unique(), on="site", how="left", suffix="_c")
    features = [f for f in ds.features if f != "site"] + ["lat"]
    return Dataset(concept=concept, task=ds.task, frame=frame, target=ds.target, features=features, categorical=[],
                   split="time", time_col="year", baseline_feature=ds.baseline_feature, baseline_name=ds.baseline_name,
                   notes=ds.notes)


@dataclass
class Row:
    concept: str
    model: str
    test: str
    n_test: int
    auc: float
    lo: float
    hi: float
    auc_within: float  # mean AUC inside each cell: separates 'knows the climate of the place' from 'forecasts the day'


def _xy(ds: Dataset, frame: pl.DataFrame, features: list[str], categorical: list[str] | None = None):
    X = frame.select(features).to_pandas()
    for column in categorical or []:
        X[column] = X[column].astype("object")
    return X, frame[ds.target].to_numpy().astype(int)


def _auc(y: np.ndarray, p: np.ndarray, years: np.ndarray, n_boot: int) -> tuple[float, float, float]:
    from sklearn.metrics import roc_auc_score

    if np.unique(y).size < 2:
        return float("nan"), float("nan"), float("nan")
    value = float(roc_auc_score(y, p))

    def fn(idx: np.ndarray) -> float:
        return float(roc_auc_score(y[idx], p[idx])) if np.unique(y[idx]).size == 2 else float("nan")

    lo, hi = M.block_bootstrap_ci(fn, years, n_boot=n_boot, seed=0)
    return value, lo, hi


def _within(y: np.ndarray, p: np.ndarray, sites: np.ndarray) -> float:
    from sklearn.metrics import roc_auc_score

    values = []
    for site in np.unique(sites):
        m = sites == site
        if y[m].sum() >= 30 and (1 - y[m]).sum() >= 30:
            values.append(roc_auc_score(y[m], p[m]))
    return float(np.mean(values)) if values else float("nan")


def split_years(frame: pl.DataFrame) -> int:
    years = frame["year"].unique().sort()
    n_test = max(1, round(years.len() * get_settings().test_fraction))
    return int(years[years.len() - n_test - 1])  # last training year


def evaluate(concept: str, n_boot: int = 100, seed: int = 42, ds: Dataset | None = None) -> tuple[list[Row], dict]:
    ds = ds or build(concept)
    frame = ds.frame
    limit = split_years(frame)
    train_all = frame.filter((pl.col("year") <= limit) & (pl.col("region") == "train"))
    cap = MAX_TRAIN_ROWS[concept]
    train = train_all.sample(n=cap, seed=seed) if train_all.height > cap else train_all
    log.info("%s: %d filas de entrenamiento (de %d) en %d celdas; prueba desde %d", concept, train.height, train_all.height,
             train["site"].n_unique(), limit + 1)
    spec = DEPLOY[concept]
    mspec = tabular_spec(spec, ds)
    X, raw = _xy(ds, train, ds.features)
    enc = LabelEncoder().fit(raw)
    start = time.perf_counter()
    pipeline = build_pipeline(mspec, ds.features, [], spec.fast, seed)
    pipeline.fit(X, enc.transform(raw))
    seconds = round(time.perf_counter() - start, 1)
    weld_bundle = load_bundle(concept)
    base_col = ds.baseline_feature
    rate = {}
    if base_col:  # persistence: P(event | state now), learned in training
        rate = train.group_by(base_col).agg(pl.col(ds.target).mean().alias("p")).to_dicts()
        rate = {r[base_col]: r["p"] for r in rate}
    rows: list[Row] = []
    tests = {"seen": (frame["region"] == "train"), "holdout": frame["region"].is_in(["africa", "south_asia"]),
             "weld": (frame["region"] == "weld")}
    for name, mask in tests.items():
        test = frame.filter((pl.col("year") > limit) & mask)
        if test.is_empty():
            continue
        if test.height > 600_000:
            test = test.sample(n=600_000, seed=seed)
        Xt, y = _xy(ds, test, ds.features)
        years = test["year"].to_numpy()
        preds = {"global": pipeline.predict_proba(Xt)[:, 1]}
        wt = test.with_columns(pl.lit("greeley-riego").alias("site")) if "site" in weld_bundle["features"] else test
        preds["weld_only"] = predict_tabular(weld_bundle, wt)
        if base_col:
            preds["persistence" if concept == "c05b" else "baseline"] = np.array([rate.get(v, 0.5) for v in test[base_col].to_list()])
        elif concept == "c08a":
            preds["rained_today"] = (test["PRECTOTCORR"].to_numpy() >= 1.0).astype(float)
        for model, p in preds.items():
            auc, lo, hi = _auc(y, p, years, n_boot)
            within = _within(y, p, test["site"].to_numpy())
            rows.append(Row(concept, model, name, len(y), auc, lo, hi, within))
            log.info("%s %-12s %-8s n=%-8d AUC %.3f [%.3f–%.3f] dentro de cada celda %.3f", concept, model, name, len(y), auc, lo, hi, within)
    info = {"train_rows": train.height, "train_cells": train["site"].n_unique(), "last_train_year": limit, "fit_seconds": seconds,
            "pipeline": pipeline, "features": ds.features, "classes": [str(c) for c in enc.classes_]}
    return rows, info


def to_frame(rows: list[Row]) -> pd.DataFrame:
    return pd.DataFrame([r.__dict__ for r in rows])
