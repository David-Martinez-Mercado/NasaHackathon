from datetime import date

import numpy as np
import polars as pl
import pytest

from fieldshift_ml.datasets.base import Dataset
from fieldshift_ml.evaluation.splits import group_split, random_split, split_dataset, time_split


def _frame(n_years: int = 20, per_year: int = 5) -> pl.DataFrame:
    years = np.repeat(np.arange(2000, 2000 + n_years), per_year)
    return pl.DataFrame({"year": years, "x": np.arange(len(years), dtype=float), "block": years % 7})


def test_time_split_never_trains_on_the_future():
    frame = _frame()
    train, test = time_split(frame, "year", 0.2)
    assert frame["year"][train].max() < frame["year"][test].min()


def test_time_split_keeps_whole_periods_and_fraction():
    frame = _frame(n_years=20, per_year=5)
    train, test = time_split(frame, "year", 0.2)
    assert set(frame["year"][test].unique()) == {2016, 2017, 2018, 2019}
    assert len(train) + len(test) == frame.height
    assert len(test) / frame.height == pytest.approx(0.2)


def test_time_split_works_with_dates():
    frame = pl.DataFrame({"d": [date(2020, 1, d) for d in range(1, 11)]})
    train, test = time_split(frame, "d", 0.2)
    assert list(test) == [8, 9]


def test_time_split_rejects_too_few_periods():
    with pytest.raises(ValueError):
        time_split(pl.DataFrame({"year": [2020, 2020]}), "year", 0.2)


def test_group_split_keeps_groups_on_one_side():
    frame = _frame()
    train, test = group_split(frame, "block", 0.3, seed=1)
    assert set(frame["block"][train]).isdisjoint(set(frame["block"][test]))


def test_random_split_is_reproducible_and_disjoint():
    a = random_split(100, 0.2, seed=7)
    b = random_split(100, 0.2, seed=7)
    assert np.array_equal(a[1], b[1])
    assert len(a[1]) == 20 and set(a[0]).isdisjoint(a[1])


def test_split_dataset_uses_the_dataset_default():
    dataset = Dataset("x", "regression", _frame(), target="x", features=["year"], split="time", time_col="year")
    train, test = split_dataset(dataset)
    assert len(test) == 20
    with pytest.raises(ValueError):
        split_dataset(dataset, "group")  # no group column declared
