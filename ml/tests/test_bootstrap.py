"""Block-bootstrap confidence intervals of the primary metric."""

from datetime import date

import numpy as np
import pandas as pd
import polars as pl
import pytest

from fieldshift_ml.datasets.base import Dataset
from fieldshift_ml.evaluation import metrics as M
from fieldshift_ml.evaluation.runner import evaluate


def test_time_blocks_picks_the_coarsest_unit_with_enough_blocks():
    years = np.arange(2000, 2020).repeat(3)
    assert M.time_blocks(years).tolist() == years.tolist()  # already integer blocks

    long = np.array([date(2000 + i // 12, 1 + i % 12, 1) for i in range(120)], dtype="datetime64[D]")
    assert np.unique(M.time_blocks(long)).size == 10  # years

    short = np.array([date(2025, 1 + i // 28, 1 + i % 28) for i in range(28 * 8)], dtype="datetime64[D]")
    assert np.unique(M.time_blocks(short)).size == 8  # months: only one year, so years would give a single block

    one_month = np.array([date(2025, 3, 1 + i) for i in range(20)], dtype="datetime64[D]")
    assert np.unique(M.time_blocks(one_month)).size >= 3  # weeks


def test_ci_is_reproducible_and_brackets_the_point_estimate():
    rng = np.random.default_rng(0)
    blocks = np.repeat(np.arange(20), 50)
    values = rng.normal(loc=2.0, size=blocks.size)

    def mean(idx):
        return float(values[idx].mean())

    a = M.block_bootstrap_ci(mean, blocks, n_boot=300, seed=1)
    b = M.block_bootstrap_ci(mean, blocks, n_boot=300, seed=1)
    assert a == b
    assert a[0] < values.mean() < a[1]


def test_block_ci_is_wider_than_a_row_ci_when_rows_in_a_block_are_correlated():
    rng = np.random.default_rng(2)
    n_blocks, per = 15, 80
    blocks = np.repeat(np.arange(n_blocks), per)
    values = rng.normal(scale=1.0, size=n_blocks).repeat(per) + rng.normal(scale=0.1, size=n_blocks * per)

    def mean(idx):
        return float(values[idx].mean())

    block_low, block_high = M.block_bootstrap_ci(mean, blocks, n_boot=400, seed=3)
    row_low, row_high = M.block_bootstrap_ci(mean, np.arange(blocks.size), n_boot=400, seed=3)  # every row a block
    assert (block_high - block_low) > 3 * (row_high - row_low)


def test_ci_is_undefined_with_too_few_blocks_or_when_turned_off():
    blocks = np.repeat([1, 2], 10)
    lo, hi = M.block_bootstrap_ci(lambda idx: 1.0, blocks, n_boot=50)
    assert np.isnan(lo) and np.isnan(hi)
    lo, hi = M.block_bootstrap_ci(lambda idx: 1.0, np.arange(30), n_boot=0)
    assert np.isnan(lo) and np.isnan(hi)


def test_resamples_without_both_classes_are_skipped_for_roc_auc():
    y = np.array([0] * 30 + [1] * 30)
    positive = np.r_[np.zeros(30) + 0.2, np.zeros(30) + 0.8]
    proba = np.column_stack([1 - positive, positive])
    fn = M.primary_metric_fn("classification", y, (proba[:, 1] > 0.5).astype(int), proba, n_classes=2)
    assert fn(np.arange(60)) == pytest.approx(1.0)
    assert np.isnan(fn(np.arange(30)))  # only class 0 in this resample


def _classification_frame(seed: int = 0) -> pl.DataFrame:
    rng = np.random.default_rng(seed)
    n = 30 * 80
    x = rng.normal(size=n)
    return pl.DataFrame({"year": np.repeat(np.arange(1990, 2020), 80), "x": x,
                         "label": (x + rng.normal(scale=0.7, size=n) > 0).astype(int)})


def test_tabular_results_carry_the_interval():
    dataset = Dataset("t_ci", "classification", _classification_frame(), target="label", features=["x"],
                      split="time", time_col="year")
    table = evaluate(dataset, fast=True, models=["logistica"], save=False, n_boot=60)
    row = table.filter(pl.col("model") == "logistica").row(0, named=True)
    assert row["roc_auc_lo"] <= row["roc_auc"] <= row["roc_auc_hi"]
    assert 0.5 < row["roc_auc_lo"] < row["roc_auc_hi"] <= 1.0
    base = table.filter(pl.col("model") == "base_frecuencia").row(0, named=True)
    assert base["roc_auc_lo"] == pytest.approx(0.5) and base["roc_auc_hi"] == pytest.approx(0.5)


def test_n_boot_zero_leaves_the_table_as_before():
    dataset = Dataset("t_ci0", "classification", _classification_frame(), target="label", features=["x"],
                      split="time", time_col="year")
    table = evaluate(dataset, fast=True, models=["logistica"], save=False, n_boot=0)
    assert "roc_auc_lo" not in table.columns and "roc_auc_hi" not in table.columns


def test_forecast_results_carry_the_interval_by_forecast_window():
    weeks = pd.date_range("2005-01-03", periods=700, freq="W-MON")
    rng = np.random.default_rng(4)
    y = 10 + 3 * np.sin(2 * np.pi * np.arange(700) / 52) + rng.normal(scale=0.3, size=700)
    frame = pl.from_pandas(pd.DataFrame({"unique_id": "a", "ds": weeks, "y": y}))
    dataset = Dataset("t_fc_ci", "forecast", frame, target="y", freq="W-MON", horizon=4, season_length=52)
    table = evaluate(dataset, fast=True, models=["auto_ets"], save=False, n_boot=60)
    row = table.filter(pl.col("model") == "auto_ets").row(0, named=True)
    assert row["mase_lo"] <= row["mase"] <= row["mase_hi"]


def test_interval_falls_back_to_spatial_blocks_when_the_test_has_fewer_than_three_periods():
    rng = np.random.default_rng(5)
    n_years, per_year = 10, 400
    n = n_years * per_year
    x = rng.normal(size=n)
    frame = pl.DataFrame({
        "year": np.repeat(np.arange(2010, 2010 + n_years), per_year), "x": x,
        "block": rng.integers(0, 12, n), "label": (x + rng.normal(scale=0.7, size=n) > 0).astype(int),
    })
    dataset = Dataset("t_ci_sp", "classification", frame, target="label", features=["x"], split="time",
                      time_col="year", group_col="block")
    table = evaluate(dataset, fast=True, models=["logistica"], save=False, n_boot=60)
    row = table.filter(pl.col("model") == "logistica").row(0, named=True)
    assert row["n_test"] == 2 * per_year  # two test years: a yearly block bootstrap has nothing to resample
    assert row["roc_auc_lo"] < row["roc_auc"] < row["roc_auc_hi"]
    assert "bloques espaciales" in row["note"]

    without_blocks = Dataset("t_ci_no", "classification", frame.drop("block"), target="label", features=["x"],
                             split="time", time_col="year")
    plain = evaluate(without_blocks, fast=True, models=["logistica"], save=False, n_boot=60)
    row = plain.filter(pl.col("model") == "logistica").row(0, named=True)
    assert np.isnan(row["roc_auc_lo"]) and np.isnan(row["roc_auc_hi"])  # honest: no interval can be estimated
