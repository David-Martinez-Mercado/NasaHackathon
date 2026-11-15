"""End-to-end checks of the evaluator on small synthetic tables (no project data needed)."""

from datetime import date

import numpy as np
import polars as pl
import pytest

from fieldshift_ml.datasets.base import Dataset
from fieldshift_ml.datasets.validation import validate
from fieldshift_ml.evaluation.runner import evaluate
from fieldshift_ml.models.tabular import ColumnBaseline, ConditionalFrequency


def _regression(n_years: int = 30, per_year: int = 20) -> Dataset:
    rng = np.random.default_rng(0)
    n = n_years * per_year
    x1, x2 = rng.normal(size=n), rng.normal(size=n)
    frame = pl.DataFrame({
        "year": np.repeat(np.arange(1990, 1990 + n_years), per_year), "x1": x1, "x2": x2,
        "group": rng.choice(["a", "b"], n), "y": 3 * x1 - 2 * x2 + rng.normal(scale=0.3, size=n),
    })
    return Dataset("t_reg", "regression", frame, target="y", features=["x1", "x2", "group"],
                   categorical=["group"], split="time", time_col="year")


def test_regression_models_beat_the_mean_on_a_learnable_signal():
    table = evaluate(_regression(), fast=True, models=["lineal", "lightgbm"], save=False)
    scores = dict(zip(table["model"], table["r2"], strict=True))
    assert scores["lineal"] > 0.95 and scores["lightgbm"] > 0.8
    assert scores["base_media"] < 0.05
    skill = dict(zip(table["model"], table["skill"], strict=True))
    assert skill["lineal"] > 0.5 and skill["base_media"] == pytest.approx(0.0)


def test_random_split_is_an_explicit_option():
    table = evaluate(_regression(), split="random", fast=True, models=["lineal"], save=False)
    assert set(table["split"]) == {"random"}


def test_classification_reports_probability_metrics():
    rng = np.random.default_rng(1)
    n = 600
    x = rng.normal(size=n)
    frame = pl.DataFrame({"year": np.repeat(np.arange(2000, 2030), 20), "x": x,
                          "label": (x + rng.normal(scale=0.5, size=n) > 0).astype(int)})
    dataset = Dataset("t_clf", "classification", frame, target="label", features=["x"], split="time",
                      time_col="year")
    table = evaluate(dataset, fast=True, models=["logistica"], save=False)
    row = table.filter(pl.col("model") == "logistica").row(0, named=True)
    assert row["roc_auc"] > 0.85 and 0 < row["brier"] < 0.2 and row["skill"] > 0


def test_forecast_rolls_the_origin_and_beats_seasonal_naive_on_a_trend():
    months = pl.date_range(date(2000, 1, 1), date(2019, 12, 1), "1mo", eager=True)
    t = np.arange(len(months))
    y = 50 + 0.5 * t + 10 * np.sin(2 * np.pi * t / 12)
    frame = pl.DataFrame({"unique_id": "a", "ds": months, "y": y})
    dataset = Dataset("t_fc", "forecast", frame, target="y", freq="MS", horizon=6, season_length=12)
    table = evaluate(dataset, models=["auto_ets"], save=False)
    mase = dict(zip(table["model"], table["mase"], strict=True))
    assert mase["auto_ets"] < mase["base_estacional"]
    assert table.filter(pl.col("model") == "auto_ets")["n_test"][0] == 48  # 20 % of 240 months
    quick = evaluate(dataset, fast=True, models=["auto_ets"], save=False)
    assert quick.filter(pl.col("model") == "auto_ets")["n_test"][0] == 36  # fast mode: 6 origins x 6 months


def test_validation_rejects_constant_and_infinite_features():
    frame = pl.DataFrame({"year": [1, 2, 3], "x": [1.0, 1.0, 1.0], "y": [1.0, 2.0, 3.0]})
    with pytest.raises(ValueError, match="constantes"):
        validate(Dataset("bad", "regression", frame, target="y", features=["x"], time_col="year"))
    frame = frame.with_columns(pl.Series("x", [1.0, float("inf"), 2.0]))
    with pytest.raises(Exception):  # noqa: B017 - pandera raises its own SchemaError
        validate(Dataset("bad", "regression", frame, target="y", features=["x"], time_col="year"))


def test_reference_baselines():
    import pandas as pd

    X = pd.DataFrame({"ref": [1.0, np.nan, 3.0], "prev": [0, 0, 1]})
    assert ColumnBaseline("ref").fit(X, np.array([1.0, 2.0, 3.0])).predict(X).tolist() == [1.0, 2.0, 3.0]
    markov = ConditionalFrequency("prev").fit(X, np.array(["a", "a", "b"]))
    assert markov.predict(pd.DataFrame({"prev": [0, 1, 9]})).tolist() == ["a", "b", "a"]
