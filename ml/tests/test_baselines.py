"""Persistence baselines (c05a, c05b) and the extra Markov baseline (c02)."""

import numpy as np
import polars as pl
import pytest

from fieldshift_ml.datasets.base import Dataset
from fieldshift_ml.evaluation.runner import evaluate
from fieldshift_ml.features.climate import run_length_at_least, trailing_run_at_least


def _persistent_state(n_years: int = 40, per_year: int = 60, stay: float = 0.9, seed: int = 0) -> pl.DataFrame:
    """A binary state that stays the same next period with probability `stay`."""
    rng = np.random.default_rng(seed)
    n = n_years * per_year
    now = rng.integers(0, 2, n)
    flip = rng.random(n) > stay
    nxt = np.where(flip, 1 - now, now)
    return pl.DataFrame({
        "year": np.repeat(np.arange(1980, 1980 + n_years), per_year),
        "state_now": now.astype(np.int8), "noise": rng.normal(size=n), "state_next": nxt.astype(np.int8),
    })


def _dataset(**kwargs) -> Dataset:
    return Dataset("t_persist", "classification", _persistent_state(), target="state_next",
                   features=["state_now", "noise"], split="time", time_col="year", **kwargs)


def test_persistence_baseline_beats_climatology_and_skill_uses_the_best_baseline():
    table = evaluate(_dataset(baseline_feature="state_now", baseline_name="base_persistencia"),
                     fast=True, models=["logistica"], save=False)
    rows = {r["model"]: r for r in table.iter_rows(named=True)}
    assert {"base_frecuencia", "base_persistencia", "logistica"} <= set(rows)
    assert rows["base_persistencia"]["is_baseline"] and rows["base_frecuencia"]["is_baseline"]
    assert rows["base_persistencia"]["brier"] < rows["base_frecuencia"]["brier"]
    assert rows["base_persistencia"]["roc_auc"] > 0.8 > rows["base_frecuencia"]["roc_auc"] - 0.2
    # skill is measured against the best baseline, so the weaker one is negative and the best one is zero
    assert rows["base_persistencia"]["skill"] == pytest.approx(0.0)
    expected = 1 - rows["base_frecuencia"]["brier"] / rows["base_persistencia"]["brier"]
    assert rows["base_frecuencia"]["skill"] == pytest.approx(expected, abs=1e-3)
    assert rows["base_frecuencia"]["skill"] < 0


def test_a_model_that_only_copies_the_state_gets_no_credit():
    """With a persistence baseline, a model with no extra information must not look like an improvement."""
    table = evaluate(_dataset(baseline_feature="state_now", baseline_name="base_persistencia"),
                     fast=True, models=["logistica"], save=False)
    skill = table.filter(pl.col("model") == "logistica")["skill"][0]
    assert skill < 0.05


def test_default_baseline_name_is_unchanged():
    table = evaluate(_dataset(baseline_feature="state_now"), fast=True, models=["logistica"], save=False)
    assert "base_markov" in set(table["model"])


def test_trailing_run_only_looks_backwards():
    flags = np.array([1, 1, 0, 1, 1, 1, 1], dtype=bool)
    assert trailing_run_at_least(flags, 3).tolist() == [False, False, False, False, False, True, True]
    # the old helper marks the whole run, including days that cannot yet know the run will last
    assert run_length_at_least(flags, 3).tolist() == [False, False, False, True, True, True, True]


def test_trailing_run_does_not_change_when_the_future_changes():
    rng = np.random.default_rng(3)
    flags = rng.random(200) > 0.5
    base = trailing_run_at_least(flags, 3)
    changed = flags.copy()
    changed[120:] = ~changed[120:]
    assert np.array_equal(base[:120], trailing_run_at_least(changed, 3)[:120])

    # a run that straddles the cut: the non-causal marking changes days BEFORE the cut when the future changes
    straddle = np.zeros(10, dtype=bool)
    straddle[3:8] = True
    shortened = straddle.copy()
    shortened[5:] = False
    assert run_length_at_least(straddle, 3)[3] and not run_length_at_least(shortened, 3)[3]
    assert trailing_run_at_least(straddle, 3)[:5].tolist() == trailing_run_at_least(shortened, 3)[:5].tolist()


def _rotation_like(n_years: int = 24, per_year: int = 80, seed: int = 1) -> pl.DataFrame:
    """The next crop depends on the previous crop AND on how long it has lasted (a second-order effect)."""
    rng = np.random.default_rng(seed)
    n = n_years * per_year
    prev = rng.choice(["maiz", "trigo"], n)
    streak = rng.integers(1, 6, n)
    long_run = streak >= 3
    # after a long monoculture the farmer switches; after a short one he stays
    switch = np.where(long_run, rng.random(n) < 0.9, rng.random(n) < 0.1)
    other = np.where(prev == "maiz", "trigo", "maiz")
    nxt = np.where(switch, other, prev)
    return pl.DataFrame({
        "year": np.repeat(np.arange(2000, 2000 + n_years), per_year), "prev1": prev, "streak": streak,
        "prev1_streak": np.char.add(np.char.add(prev.astype(str), "|"), np.minimum(streak, 3).astype(str)),
        "crop": nxt,
    })


def test_second_order_markov_baseline_is_scored_and_beats_the_first_order_one():
    dataset = Dataset("t_rot", "classification", _rotation_like(), target="crop",
                      features=["prev1", "streak", "prev1_streak"], categorical=["prev1", "prev1_streak"],
                      split="time", time_col="year", baseline_feature="prev1",
                      extra_baselines={"base_markov2": "prev1_streak"})
    table = evaluate(dataset, fast=True, models=["logistica"], save=False)
    rows = {r["model"]: r for r in table.iter_rows(named=True)}
    assert {"base_markov", "base_markov2", "base_frecuencia"} <= set(rows)
    assert rows["base_markov2"]["is_baseline"]
    assert rows["base_markov2"]["f1_macro"] > rows["base_markov"]["f1_macro"] + 0.2
    assert "f1_weighted" in rows["base_markov2"]
    # skill is taken against the best of all the baselines, i.e. against base_markov2
    assert rows["base_markov2"]["skill"] == pytest.approx(0.0)
    assert rows["base_markov"]["skill"] < 0


def test_per_class_report_is_saved_with_the_results(tmp_path, monkeypatch):
    import json

    from fieldshift_ml import config

    monkeypatch.setenv("ML_WORK_DIR", str(tmp_path))
    config.get_settings.cache_clear()
    try:
        dataset = Dataset("t_rot2", "classification", _rotation_like(), target="crop",
                          features=["prev1", "streak"], categorical=["prev1"], split="time", time_col="year",
                          baseline_feature="prev1")
        table = evaluate(dataset, fast=True, models=["logistica"])
        assert table.height >= 2
        meta = json.loads((tmp_path / "results" / "t_rot2.json").read_text(encoding="utf-8"))
        report = meta["per_class"]["logistica"]
        assert set(report) == {"maiz", "trigo"}
        assert set(report["maiz"]) == {"precision", "recall", "f1", "support"}
        assert meta["primary"] == "roc_auc"  # two classes: the ranking metric did not change (c02 stays f1_macro)
    finally:
        config.get_settings.cache_clear()
