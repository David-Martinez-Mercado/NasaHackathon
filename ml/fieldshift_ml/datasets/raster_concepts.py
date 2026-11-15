"""Concepts built from rasters: rotation (c02), vegetation stress (c03) and vulnerability (c06)."""

from __future__ import annotations

import numpy as np
import polars as pl

from fieldshift_ml.datasets.base import DataNotReady, Dataset
from fieldshift_ml.io import cdl

HISTORY = 5  # previous years used to predict the next crop
MAX_PIXELS = 15_000


def _crop_history() -> pl.DataFrame:
    try:
        return cdl.sample_history()
    except FileNotFoundError as exc:
        raise DataNotReady("c02", [str(exc)]) from exc


def build_rotation() -> Dataset:
    """c02 — cultivo del año siguiente a partir de los `HISTORY` años anteriores del mismo píxel."""
    history = _crop_history()
    if history.height > MAX_PIXELS:
        history = history.sample(MAX_PIXELS, seed=42)
    years = cdl.years(history)
    codes = history.select([f"y{y}" for y in years]).to_numpy()
    names = np.vectorize(cdl.class_name)(codes)
    parts = []
    for position in range(HISTORY, len(years)):
        window = names[:, position - HISTORY:position]
        same_as_last = window == window[:, [-1]]
        streak = np.cumprod(same_as_last[:, ::-1], axis=1).sum(axis=1)  # years in a row with the last crop
        parts.append(pl.DataFrame({
            "pixel": history["pixel"], "block": history["block"],
            "x_km": history["x"] / 1000, "y_km": history["y"] / 1000,
            "year": years[position], "crop": names[:, position],
            **{f"prev{HISTORY - k}": window[:, k] for k in range(HISTORY)},
            "streak": streak.astype(np.int16),
            "distinct_crops": np.array([len(set(row)) for row in window], dtype=np.int16),
            **{f"n_{crop}": (window == crop).sum(axis=1).astype(np.int16)
               for crop in ("maiz", "trigo_invierno", "barbecho", "alfalfa")},
        }))
    frame = pl.concat(parts).filter(pl.col("crop") != "pastizal")
    sequence = [f"prev{k}" for k in range(HISTORY, 0, -1)]  # oldest -> newest
    features = [*sequence, "streak", "distinct_crops", "n_maiz", "n_trigo_invierno", "n_barbecho",
                "n_alfalfa", "x_km", "y_km"]
    return Dataset(
        concept="c02", task="classification", frame=frame.sort("year", "pixel"), target="crop",
        features=features, categorical=sequence, split="time", time_col="year", group_col="block",
        baseline_feature="prev1", sequence_cols=sequence,
        notes=[f"Fuente: CDL CropScape {years[0]}–{years[-1]}, Weld, 30 m. Muestra de un píxel cada 360 m "
               "que fue cultivo o barbecho al menos la mitad de los años.",
               f"Se predice el cultivo del año con los {HISTORY} anteriores; la prueba son los últimos años.",
               "`base_markov` = cultivo más frecuente después del cultivo del año pasado.",
               "CDL es una clasificación de satélite: sus errores entran como ruido en las etiquetas.",
               "Para medir generalización a parcelas nuevas usar `--split group` (bloques de 10 km)."],
    )


def build_stress() -> Dataset:
    """c03 — índice de estrés evaporativo (ESI) de ECOSTRESS a partir del clima previo."""
    from fieldshift_ml.datasets.stress import build

    return build()


def build_vulnerability() -> Dataset:
    """c06 — índice de vulnerabilidad sin etiqueta (suelo + clima + historial de cultivo)."""
    from fieldshift_ml.datasets.vulnerability import build

    return build()
