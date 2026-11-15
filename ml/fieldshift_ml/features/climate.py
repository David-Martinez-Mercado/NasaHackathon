"""Derived climate variables: growing degree days, SPI, heat waves, seasonal encodings."""

from __future__ import annotations

import numpy as np
import polars as pl
from scipy import stats


def growing_degree_days(tmax: pl.Expr, tmin: pl.Expr, base: float = 10.0, cap: float = 30.0) -> pl.Expr:
    """Daily GDD with the usual corn limits (base 10 °C, cap 30 °C)."""
    tmax_c = tmax.clip(base, cap)
    tmin_c = tmin.clip(base, cap)
    return (tmax_c + tmin_c) / 2 - base


def cyclical(column: pl.Expr, period: float, name: str) -> list[pl.Expr]:
    angle = column.cast(pl.Float64) * (2 * np.pi / period)
    return [angle.sin().alias(f"{name}_sin"), angle.cos().alias(f"{name}_cos")]


def run_length_at_least(flags: np.ndarray, length: int) -> np.ndarray:
    """True where a day belongs to a run of `length` or more consecutive True values."""
    flags = np.asarray(flags, dtype=bool)
    out = np.zeros(flags.shape[0], dtype=bool)
    start = None
    for index, flag in enumerate(np.append(flags, False)):
        if flag and start is None:
            start = index
        elif not flag and start is not None:
            if index - start >= length:
                out[start:index] = True
            start = None
    return out


def trailing_run_at_least(flags: np.ndarray, length: int) -> np.ndarray:
    """True on day t when the run of consecutive True values ENDING at t already has `length` days or more.

    Unlike `run_length_at_least`, which marks a whole run (including its first days) once the run is known to
    last long enough, this only looks backwards: it is what a forecaster really knows on day t.
    """
    flags = np.asarray(flags, dtype=bool)
    out = np.zeros(flags.shape[0], dtype=bool)
    run = 0
    for index, flag in enumerate(flags):
        run = run + 1 if flag else 0
        out[index] = run >= length
    return out


def spi(values: np.ndarray, months: np.ndarray, reference: np.ndarray) -> np.ndarray:
    """Standardized Precipitation Index.

    A gamma distribution is fitted per calendar month using only the `reference` rows
    (the training period), so the test period never leaks into the index.
    """
    values = np.asarray(values, dtype=float)
    out = np.full(values.shape[0], np.nan)
    for month in range(1, 13):
        in_month = months == month
        ref = values[in_month & reference]
        ref = ref[np.isfinite(ref)]
        if ref.size < 10:
            continue
        zero_prob = float((ref <= 0).mean())
        positive = ref[ref > 0]
        if positive.size < 5:
            continue
        shape, _, scale = stats.gamma.fit(positive, floc=0)
        target = values[in_month]
        cdf = zero_prob + (1 - zero_prob) * stats.gamma.cdf(np.clip(target, 0, None), shape, scale=scale)
        cdf = np.clip(cdf, 1e-4, 1 - 1e-4)
        out[in_month] = stats.norm.ppf(cdf)
    return out
