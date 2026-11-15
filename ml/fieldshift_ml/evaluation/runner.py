"""Train every candidate model of a concept on 80 % of the data and score it on the other 20 %."""

from __future__ import annotations

import json
import logging
import time
import warnings
from dataclasses import asdict, dataclass, field
from datetime import datetime

import joblib
import numpy as np
import pandas as pd
import polars as pl
from sklearn.preprocessing import LabelEncoder

from fieldshift_ml.config import get_settings
from fieldshift_ml.datasets.base import Dataset
from fieldshift_ml.evaluation import metrics as M
from fieldshift_ml.evaluation.splits import split_dataset
from fieldshift_ml.evaluation.tracking import log_run
from fieldshift_ml.models.forecast import DS, ID, YHAT, Forecaster, Y, forecast_models
from fieldshift_ml.models.tabular import (
    ModelSpec,
    build_pipeline,
    reference_spec,
    sequence_specs,
    tabular_models,
)

log = logging.getLogger("fieldshift_ml")


@dataclass
class Result:
    concept: str
    task: str
    model: str
    family: str
    split: str
    n_train: int
    n_test: int
    metrics: dict[str, float] = field(default_factory=dict)
    primary: str = ""
    skill: float | None = None  # relative error reduction vs. the baseline (>0 beats it)
    fit_seconds: float = 0.0
    is_baseline: bool = False
    note: str = ""
    error: str = ""


def _set_skill(results: list[Result], metric: str) -> None:
    """skill = 1 - error / error of the best baseline. Positive means the model beats every baseline."""
    errors = [r.metrics[metric] for r in results if r.is_baseline and metric in r.metrics]
    if not errors or min(errors) <= 0:
        return
    best = min(errors)
    for result in results:
        if metric in result.metrics:
            result.skill = round(1 - result.metrics[metric] / best, 4)


# ------------------------------------------------------------------ tabular
def _skill_metric(task: str, n_classes: int | None) -> str:
    if task == "regression":
        return "rmse"
    return "brier" if n_classes == 2 else "log_loss"


def _add_ci(result: Result, metric, blocks: np.ndarray | None, n_boot: int, seed: int) -> None:
    """Add `<primary>_lo` / `<primary>_hi` (95 % block-bootstrap interval) to the result's metrics."""
    if blocks is None or n_boot <= 0:
        return
    low, high = M.block_bootstrap_ci(metric, blocks, n_boot=n_boot, seed=seed)
    result.metrics[f"{result.primary}_lo"] = low
    result.metrics[f"{result.primary}_hi"] = high


def _run_tabular(dataset: Dataset, split: str, fast: bool, only: set[str] | None, tune: int,
                 seed: int, test_fraction: float, n_boot: int = 0) -> tuple[list[Result], pl.DataFrame, dict]:
    frame = dataset.frame
    train_idx, test_idx = split_dataset(dataset, split, test_fraction, seed)
    columns = dataset.features
    numeric = [c for c in columns if c not in dataset.categorical]
    X = frame.select(columns).to_pandas()
    for column in dataset.categorical:
        X[column] = X[column].astype("object")
    y_raw = frame.get_column(dataset.target).to_numpy()
    n_classes = None
    if dataset.task == "classification":
        encoder = LabelEncoder().fit(y_raw[train_idx])
        seen = np.isin(y_raw[test_idx], encoder.classes_)
        test_idx = test_idx[seen]  # classes never seen in training cannot be scored
        y = np.full(y_raw.shape[0], -1)
        known = np.isin(y_raw, encoder.classes_)
        y[known] = encoder.transform(y_raw[known])
        n_classes = len(encoder.classes_)
    else:
        y = y_raw.astype(float)
    X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
    y_train, y_test = y[train_idx], y[test_idx]
    blocks = None
    ci_note = ""
    if dataset.time_col:  # whole years (or months/weeks when the test period is short) are resampled together
        blocks = M.time_blocks(frame.get_column(dataset.time_col).to_numpy()[test_idx])
    if (blocks is None or np.unique(blocks).size < 3) and dataset.group_col:
        # fewer than 3 test periods (e.g. 2 test years): time blocks cannot give an interval, so resample the spatial
        # blocks instead. That captures location-to-location noise only, not year-to-year variation.
        blocks = frame.get_column(dataset.group_col).to_numpy()[test_idx]
        ci_note = "intervalo por bloques espaciales (la prueba cubre menos de 3 periodos)"

    specs: list[ModelSpec] = [s for s in tabular_models(dataset.task) if not (fast and s.slow)]
    references = []
    if dataset.baseline_feature:
        references.append(reference_spec(dataset.baseline_feature, dataset.task, dataset.baseline_name))
    references += [reference_spec(column, dataset.task, name) for name, column in dataset.extra_baselines.items()]
    for offset, reference in enumerate(references):
        specs.insert(1 + offset, reference)
    if dataset.sequence_cols and dataset.task == "classification":
        specs += sequence_specs(dataset.sequence_cols)
    if only:
        specs = [s for s in specs if s.name in only or s.baseline]
    if tune:
        from fieldshift_ml.evaluation.tuning import tuned_specs

        specs += tuned_specs(dataset.task, X_train, y_train, numeric, dataset.categorical, tune, seed,
                             only=only)

    results: list[Result] = []
    predictions: list[pl.DataFrame] = []
    fitted: dict[str, object] = {}
    per_class: dict[str, dict] = {}
    class_names = [str(c) for c in encoder.classes_] if dataset.task == "classification" else []
    skill_metric = _skill_metric(dataset.task, n_classes)
    primary, _ = M.primary_metric(dataset.task, n_classes)
    for spec in specs:
        result = Result(dataset.concept, dataset.task, spec.name, spec.family, split,
                        len(train_idx), len(test_idx), primary=primary, is_baseline=spec.baseline)
        try:
            fit_X, fit_y = X_train, y_train
            if spec.max_rows and len(fit_X) > spec.max_rows:
                pick = np.random.default_rng(seed).choice(len(fit_X), spec.max_rows, replace=False)
                fit_X, fit_y = fit_X.iloc[pick], fit_y[pick]
                result.note = f"entrenado con una muestra de {spec.max_rows:,} filas"
            pipeline = build_pipeline(spec, numeric, dataset.categorical, fast, seed)
            start = time.perf_counter()
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                pipeline.fit(fit_X, fit_y)
                result.fit_seconds = round(time.perf_counter() - start, 2)
                y_pred = pipeline.predict(X_test)
                proba = None
                if dataset.task == "classification" and hasattr(pipeline, "predict_proba"):
                    proba = pipeline.predict_proba(X_test)
            if dataset.task == "regression":
                result.metrics = M.regression_metrics(y_test, y_pred)
            else:
                result.metrics = M.classification_metrics(y_test, np.asarray(y_pred).ravel(), proba, n_classes)
                per_class[spec.name] = M.per_class_report(y_test, np.asarray(y_pred).ravel(), class_names)
            _add_ci(result, M.primary_metric_fn(dataset.task, y_test, y_pred, proba, n_classes=n_classes),
                    blocks, n_boot, seed)
            if ci_note and n_boot > 0:
                result.note = "; ".join(filter(None, [result.note, ci_note]))
            pred_frame = pl.DataFrame({
                "model": spec.name, "row": test_idx,
                "y_true": y_test.astype(float), "y_pred": np.asarray(y_pred, dtype=float).ravel(),
            })
            if proba is not None and n_classes == 2:
                pred_frame = pred_frame.with_columns(pl.Series("proba", np.asarray(proba[:, 1], dtype=float)))
            predictions.append(pred_frame)
            fitted[spec.name] = pipeline
        except Exception as exc:  # one model failing must not stop the comparison
            result.error = f"{type(exc).__name__}: {exc}"[:300]
            log.warning("%s / %s falló: %s", dataset.concept, spec.name, result.error)
        results.append(result)
        log.info("%s | %-18s %s=%s (%.1fs)", dataset.concept, spec.name, primary,
                 result.metrics.get(primary), result.fit_seconds)
    _set_skill(results, skill_metric)
    extra = {"n_classes": n_classes, "skill_metric": skill_metric,
             "classes": encoder.classes_.tolist() if dataset.task == "classification" else None,
             "per_class": per_class}
    all_preds = pl.concat(predictions, how="diagonal_relaxed") if predictions else pl.DataFrame()
    return results, all_preds, {"fitted": fitted, **extra}


# ----------------------------------------------------------------- forecast
def _seasonal_scale(train: pd.DataFrame, season: int) -> dict[str, float]:
    scale = {}
    for uid, group in train.groupby(ID, sort=False):
        values = group.sort_values(DS)[Y].to_numpy()
        lag = season if values.size > season else 1
        scale[uid] = float(np.mean(np.abs(values[lag:] - values[:-lag]))) or 1.0
    return scale


def _run_forecast(dataset: Dataset, fast: bool, only: set[str] | None, seed: int,
                  test_fraction: float, n_boot: int = 0) -> tuple[list[Result], pl.DataFrame, dict]:
    frame = dataset.frame.select(ID, DS, Y, *dataset.exog_cols).to_pandas()
    frame[DS] = pd.to_datetime(frame[DS])
    dates = np.sort(frame[DS].unique())
    h, season = int(dataset.horizon), int(dataset.season_length)
    n_test = int(round(len(dates) * test_fraction))
    first = len(dates) - n_test
    starts = list(range(first, len(dates) - h + 1, h))
    if fast and len(starts) > 6:
        starts = [starts[i] for i in np.linspace(0, len(starts) - 1, 6).astype(int)]
    train = frame[frame[DS] < dates[first]]
    scale = _seasonal_scale(train, season)

    models: list[Forecaster] = forecast_models(dataset.freq, season, h, fast, seed, dataset.exog_cols)
    models = [m for m in models if not (fast and m.slow)]
    if only:
        models = [m for m in models if m.name in only or m.baseline]

    results: list[Result] = []
    predictions: list[pl.DataFrame] = []
    for model in models:
        result = Result(dataset.concept, "forecast", model.name, model.family, "time",
                        len(train), 0, primary="mase", is_baseline=model.baseline)
        try:
            start = time.perf_counter()
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                model.fit(train)
                parts = []
                for origin in starts:
                    history = frame[frame[DS] < dates[origin]]
                    forecast = model.predict(history, h)
                    forecast["cutoff"] = dates[origin - 1]
                    parts.append(forecast)
            result.fit_seconds = round(time.perf_counter() - start, 2)
            merged = pd.concat(parts, ignore_index=True).merge(frame, on=[ID, DS], how="inner")
            merged = merged.dropna(subset=[Y, YHAT])
            result.n_test = len(merged)
            row_scale = merged[ID].map(scale).to_numpy()
            result.metrics = M.forecast_metrics(merged[Y].to_numpy(), merged[YHAT].to_numpy(), row_scale)
            per_series = [M.regression_metrics(g[Y].to_numpy(), g[YHAT].to_numpy())["r2"]
                          for _, g in merged.groupby(ID) if len(g) > 1]
            result.metrics["r2"] = float(np.mean(per_series))  # mean of each series' own R²
            _add_ci(result, M.primary_metric_fn("forecast", merged[Y].to_numpy(), merged[YHAT].to_numpy(),
                                                scale=row_scale),
                    M.time_blocks(merged["cutoff"].to_numpy()), n_boot, seed)  # each forecast origin is a block
            merged["model"] = model.name
            predictions.append(pl.from_pandas(merged[["model", ID, DS, "cutoff", Y, YHAT]]).with_columns(
                pl.col(DS).cast(pl.Datetime("ms")), pl.col("cutoff").cast(pl.Datetime("ms")),
                pl.col(YHAT).cast(pl.Float64)))
        except Exception as exc:
            result.error = f"{type(exc).__name__}: {exc}"[:300]
            log.warning("%s / %s falló: %s", dataset.concept, model.name, result.error)
        results.append(result)
        log.info("%s | %-18s mase=%s (%.1fs)", dataset.concept, model.name,
                 result.metrics.get("mase"), result.fit_seconds)
    _set_skill(results, "mae")
    all_preds = pl.concat(predictions) if predictions else pl.DataFrame()
    return results, all_preds, {"windows": len(starts), "horizon": h, "fitted": {}, "skill_metric": "mae"}


# ------------------------------------------------------------------- public
def results_frame(results: list[Result]) -> pl.DataFrame:
    rows = []
    for r in results:
        row = {k: v for k, v in asdict(r).items() if k != "metrics"}
        row.update(r.metrics)
        rows.append(row)
    return pl.DataFrame(rows, infer_schema_length=None)


def evaluate(dataset: Dataset, *, split: str | None = None, fast: bool = False,
             models: list[str] | None = None, tune: int = 0, save: bool = True,
             n_boot: int | None = None) -> pl.DataFrame:
    """Run the comparison for one concept and return one row per model, best first.

    `n_boot` = resamples for the 95 % interval of the primary metric (`<metric>_lo`, `<metric>_hi`); the default is
    200 (50 with `fast`) and 0 turns it off.
    """
    settings = get_settings()
    n_boot = (50 if fast else 200) if n_boot is None else n_boot
    only = set(models) if models else None
    split_kind = split or dataset.split
    if dataset.task == "forecast":
        results, predictions, extra = _run_forecast(dataset, fast, only, settings.seed, settings.test_fraction,
                                                    n_boot)
    elif dataset.task == "unsupervised":
        from fieldshift_ml.evaluation.unsupervised import run_unsupervised

        results, predictions, extra = run_unsupervised(dataset, fast, only, settings.seed)
    else:
        results, predictions, extra = _run_tabular(dataset, split_kind, fast, only, tune, settings.seed,
                                                   settings.test_fraction, n_boot)

    table = results_frame(results)
    primary = results[0].primary if results else ""
    _, higher = M.primary_metric(dataset.task, extra.get("n_classes"))
    if primary in table.columns:
        table = table.sort(primary, descending=higher, nulls_last=True)

    if save:
        tag = dataset.concept if split_kind == dataset.split else f"{dataset.concept}__{split_kind}"
        out = settings.subdir("results")
        table.write_csv(out / f"{tag}.csv")
        if predictions.height:
            predictions.write_parquet(out / f"{tag}__predicciones.parquet")
        meta = {
            "concept": dataset.concept, "task": dataset.task, "split": split_kind, "fast": fast,
            "rows": dataset.n_rows, "features": dataset.features, "target": dataset.target,
            "primary": primary, "notes": dataset.notes, "run_at": datetime.now().isoformat(timespec="seconds"),
            **{k: v for k, v in extra.items() if k != "fitted"},
        }
        (out / f"{tag}.json").write_text(json.dumps(meta, indent=2, default=str, ensure_ascii=False),
                                         encoding="utf-8")
        best = next((r for r in table.iter_rows(named=True) if not r["error"] and not r["is_baseline"]), None)
        if best and best["model"] in extra.get("fitted", {}):
            joblib.dump(extra["fitted"][best["model"]], settings.subdir("models") / f"{tag}__{best['model']}.joblib")
        for result in results:
            log_run(result, fast)
    return table
