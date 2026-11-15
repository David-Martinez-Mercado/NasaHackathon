"""Train/test partitions (80/20 by default).

`time_split` keeps whole periods together and sends the *last* ones to test: with climate, crop or
price data a random split leaks the future into training and inflates every score.
"""

from __future__ import annotations

import numpy as np
import polars as pl

from fieldshift_ml.datasets.base import Dataset


def time_split(frame: pl.DataFrame, time_col: str, test_fraction: float = 0.2) -> tuple[np.ndarray, np.ndarray]:
    periods = frame.get_column(time_col).unique().sort()
    n_test = max(1, int(round(periods.len() * test_fraction)))
    if n_test >= periods.len():
        raise ValueError(f"Muy pocos periodos ({periods.len()}) para separar una prueba del {test_fraction:.0%}")
    cutoff = periods[periods.len() - n_test]
    is_test = (frame.get_column(time_col) >= cutoff).to_numpy()
    return np.flatnonzero(~is_test), np.flatnonzero(is_test)


def group_split(
    frame: pl.DataFrame, group_col: str, test_fraction: float = 0.2, seed: int = 42
) -> tuple[np.ndarray, np.ndarray]:
    """Whole groups (e.g. spatial blocks) go to one side only."""
    groups = frame.get_column(group_col).unique().sort().to_numpy().copy()  # polars arrays are read-only
    rng = np.random.default_rng(seed)
    rng.shuffle(groups)
    n_test = max(1, int(round(len(groups) * test_fraction)))
    test_groups = groups[:n_test]
    is_test = frame.get_column(group_col).is_in(test_groups.tolist()).to_numpy()
    return np.flatnonzero(~is_test), np.flatnonzero(is_test)


def random_split(n_rows: int, test_fraction: float = 0.2, seed: int = 42) -> tuple[np.ndarray, np.ndarray]:
    order = np.random.default_rng(seed).permutation(n_rows)
    n_test = max(1, int(round(n_rows * test_fraction)))
    return np.sort(order[n_test:]), np.sort(order[:n_test])


def split_dataset(
    dataset: Dataset, kind: str | None = None, test_fraction: float = 0.2, seed: int = 42
) -> tuple[np.ndarray, np.ndarray]:
    kind = kind or dataset.split
    if kind == "time":
        if dataset.time_col is None:
            raise ValueError(f"{dataset.concept}: la partición temporal necesita time_col")
        return time_split(dataset.frame, dataset.time_col, test_fraction)
    if kind == "group":
        if dataset.group_col is None:
            raise ValueError(f"{dataset.concept}: la partición por grupos necesita group_col")
        return group_split(dataset.frame, dataset.group_col, test_fraction, seed)
    if kind == "random":
        return random_split(dataset.n_rows, test_fraction, seed)
    raise ValueError(f"Partición desconocida: {kind}")
