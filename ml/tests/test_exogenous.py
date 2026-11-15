"""c04: weather as exogenous variables in the lag models, never from the future."""

import numpy as np
import pandas as pd
import polars as pl
import pytest

from fieldshift_ml.datasets.base import Dataset
from fieldshift_ml.datasets.validation import validate
from fieldshift_ml.evaluation.runner import evaluate
from fieldshift_ml.models.forecast import DS, ID, LagBoosting, Y, lag_exog

H = 4
FREQ = "W-MON"


def _weekly(n_weeks: int = 600, seed: int = 0, lag: int = H, series: tuple[str, ...] = ("a", "b")) -> pd.DataFrame:
    """y depends ONLY on the weather of `lag` weeks earlier; the weather itself is white noise, so the own past of
    y says nothing about the future of y."""
    rng = np.random.default_rng(seed)
    frames = []
    for uid in series:
        weeks = pd.date_range("2010-01-04", periods=n_weeks, freq=FREQ)
        rain = rng.normal(size=n_weeks)
        y = np.full(n_weeks, np.nan)
        y[lag:] = 3.0 * rain[:-lag] + rng.normal(scale=0.1, size=n_weeks - lag)
        frames.append(pd.DataFrame({ID: uid, DS: weeks, Y: y, "rain": rain}))
    return pd.concat(frames, ignore_index=True).dropna().reset_index(drop=True)


def _dataset(frame: pd.DataFrame, exog: list[str] | None = None) -> Dataset:
    return Dataset("t_exog", "forecast", pl.from_pandas(frame), target=Y, freq=FREQ, horizon=H, season_length=52,
                   exog_cols=exog if exog is not None else ["rain"])


def test_exogenous_models_beat_the_lag_only_ones_when_weather_explains_the_target():
    table = evaluate(_dataset(_weekly()), fast=True, models=["lightgbm_rezagos", "lightgbm_exogenas"], save=False)
    mase = dict(zip(table["model"], table["mase"], strict=True))
    assert {"lightgbm_rezagos", "lightgbm_exogenas", "base_estacional"} <= set(mase)
    assert mase["lightgbm_exogenas"] < 0.5 * mase["lightgbm_rezagos"]
    assert mase["lightgbm_exogenas"] < 0.5  # it really learned the lagged relationship


def test_no_exogenous_models_are_created_without_exogenous_columns():
    table = evaluate(_dataset(_weekly(), exog=[]), fast=True, models=["lightgbm_rezagos"], save=False)
    assert "lightgbm_exogenas" not in set(table["model"]) and "xgboost_exogenas" not in set(table["model"])


def test_the_other_models_ignore_the_extra_columns():
    table = evaluate(_dataset(_weekly()), fast=True, models=["auto_ets", "prophet"], save=False)
    assert table.filter(pl.col("error") != "").height == 0
    assert {"auto_ets", "prophet", "base_persistencia"} <= set(table["model"])


def test_validation_accepts_the_extra_columns():
    validate(_dataset(_weekly()))


def test_a_lag_shorter_than_the_horizon_is_refused():
    """With exog_lag < horizon the weather of a future week would be needed: it must fail, not peek."""
    frame = _weekly()
    model = LagBoosting("cheat", "lightgbm", FREQ, 52, exog=["rain"], exog_lag=2)
    model.fit(frame.iloc[:900])
    with pytest.raises(ValueError, match="clima del futuro"):
        model.predict(frame.iloc[:900], H)


def test_exogenous_columns_require_an_explicit_lag():
    with pytest.raises(ValueError, match="exog_lag"):
        LagBoosting("x", "lightgbm", FREQ, 52, exog=["rain"])


def test_lagged_exogenous_values_come_from_the_past_and_respect_gaps():
    weeks = pd.date_range("2020-01-06", periods=6, freq=FREQ)
    frame = pd.DataFrame({ID: "a", DS: weeks, Y: range(6), "rain": [10.0, 11.0, 12.0, 13.0, 14.0, 15.0]})
    frame = frame.drop(index=2)  # week 3 is missing
    lagged = lag_exog(frame, ["rain"], 2, FREQ)
    by_date = dict(zip(lagged[DS], lagged["rain_lag2"], strict=True))
    assert by_date[weeks[2]] == 10.0   # the value on week 3 is the rain of week 1
    assert by_date[weeks[5]] == 13.0   # week 6 gets the rain of week 4 (not a shifted row)
    assert weeks[3] in by_date and by_date[weeks[3]] == 11.0
    assert weeks[4] not in by_date or by_date[weeks[4]] != 12.0  # week 5 would need the missing week 3
    # the table reaches `lag` periods past the last observation, which is what the next steps need
    assert max(lagged[DS]) == weeks[-1] + pd.tseries.frequencies.to_offset(FREQ) * 2


def test_future_steps_use_only_values_already_observed_at_the_origin():
    """Changing the weather that happens AFTER the origin must not change the forecast."""
    full = _weekly(n_weeks=500)
    origin = 400
    history = full[full[DS] < full[DS].unique()[origin]].reset_index(drop=True)
    model = LagBoosting("m", "lightgbm", FREQ, 52, exog=["rain"], exog_lag=H)
    model.fit(history.iloc[: len(history) // 2])
    base = model.predict(history, H)
    altered = full.copy()
    altered.loc[altered[DS] >= full[DS].unique()[origin], "rain"] += 100.0  # weather of the future weeks
    same_history = altered[altered[DS] < full[DS].unique()[origin]].reset_index(drop=True)
    again = model.predict(same_history, H)
    pd.testing.assert_frame_equal(base.reset_index(drop=True), again.reset_index(drop=True))
