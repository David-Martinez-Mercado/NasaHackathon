"""History-window study: the test set never moves, short windows are judged against the full history."""

import numpy as np
import polars as pl
import pytest

from fieldshift_ml.datasets.base import Dataset
from fieldshift_ml.evaluation import windows as W


def _clf(drift: bool, n_years: int = 36, per_year: int = 150) -> Dataset:
    """Binary label from one feature. With `drift`, the relation flips sign halfway: old years teach the wrong rule."""
    rng = np.random.default_rng(3)
    n = n_years * per_year
    year = np.repeat(np.arange(1985, 1985 + n_years), per_year)
    x = rng.normal(size=n)
    sign = np.where(year < 2005, -1.0, 1.0) if drift else 1.0
    label = (sign * x + rng.normal(scale=0.7, size=n) > 0).astype(int)
    return Dataset("t_win", "classification", pl.DataFrame({"year": year, "x": x, "label": label}), target="label",
                   features=["x"], split="time", time_col="year")


def _delta(dataset: Dataset, window: int, mode: str = "recent"):
    plan = W.make_plan(dataset)
    full_results, full_preds, _ = W._fit(dataset, None, ["logistica"], 0, True, None)
    results, preds, _ = W._fit(dataset, W.make_keep(plan, window, mode), ["logistica"], 0, True, None)
    d = W.paired_delta(dataset, preds, full_preds, "logistica", 150, 0)
    return full_results, results, d


def test_plan_finds_the_start_of_the_test_period():
    plan = W.make_plan(_clf(False))
    assert plan.test_start == 2014.0  # the last 20 % of 36 years = 7 years: 2014..2020
    assert plan.first_year == 1985.0 and plan.span == 29.0


def test_every_window_is_scored_on_the_same_test_rows():
    dataset = _clf(False)
    full, short, _ = _delta(dataset, 5)
    f = next(r for r in full if r.model == "logistica")
    s = next(r for r in short if r.model == "logistica")
    assert s.n_test == f.n_test and s.n_train < f.n_train
    assert s.n_train == pytest.approx(5 * 150, rel=0.01)


def test_a_stable_relation_makes_a_short_window_equivalent():
    dataset = _clf(False)
    _, _, (delta, low, high, n) = _delta(dataset, 8)
    assert n > 0 and low > -W.MARGIN_ABS
    assert W.verdict(dataset, low, high) in ("equivalente", "mejor")


def test_a_drifting_relation_makes_recent_data_better_and_old_data_useless():
    dataset = _clf(True)
    _, recent, (delta_recent, low_recent, high_recent, _) = _delta(dataset, 6, "recent")
    assert delta_recent > 0 and W.verdict(dataset, low_recent, high_recent) == "mejor"  # forgetting the old rule helps
    _, old, _ = _delta(dataset, 6, "old")
    auc = {"recent": next(r for r in recent if r.model == "logistica").metrics["roc_auc"],
           "old": next(r for r in old if r.model == "logistica").metrics["roc_auc"]}
    assert auc["recent"] > 0.7 and auc["old"] < 0.4  # trained only on the old regime, it is wrong about today


def test_impossible_windows_are_refused():
    plan = W.make_plan(_clf(False))
    with pytest.raises(ValueError):
        W.make_keep(plan, 40, "recent")  # longer than the history
    with pytest.raises(ValueError):
        W.make_keep(plan, 25, "old")  # not enough history to end 10 years before the test
    keep = W.make_keep(plan, 5, "random", np.random.default_rng(0))
    assert keep(np.arange(1985, 2013)).sum() == 5  # exactly 5 distinct years


def test_only_concepts_with_long_history_can_be_measured():
    with pytest.raises(ValueError):
        W.run_windows("c03", save=False)
    assert "c02" not in W.MEASURABLE and "c05b" in W.MEASURABLE


def test_verdict_labels():
    ds = _clf(False)
    assert W.verdict(ds, 0.01, 0.05) == "mejor"
    assert W.verdict(ds, -0.01, 0.02) == "equivalente"
    assert W.verdict(ds, -0.10, -0.03) == "peor"
    assert W.verdict(ds, -0.10, 0.03) == "no concluyente"
    assert W.verdict(ds, float("nan"), float("nan")) == "sin intervalo"
