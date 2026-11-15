"""Global c04 (root-zone soil moisture, 4 weeks ahead): PatchTST trained on many cells, tested on held-out regions.

Same rolling-origin protocol as the main evaluation: the last 20 % of the weeks are the test period; a forecast is made from
`N_ORIGINS` evenly spaced origins; MASE is scaled by each series' own seasonal-naive error (training weeks only).
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

import numpy as np
import pandas as pd

from fieldshift_ml.deploy.predict import load_bundle
from fieldshift_ml.evaluation import metrics as M
from fieldshift_ml.evaluation.runner import _seasonal_scale
from fieldshift_ml.global_train import download
from fieldshift_ml.global_train.cells import region_of
from fieldshift_ml.global_train.tabular import season_aligned
from fieldshift_ml.io import power
from fieldshift_ml.models.forecast import DS, ID, YHAT, Y, forecast_models

log = logging.getLogger("fieldshift_ml")
HORIZON, SEASON = 4, 52
N_ORIGINS = 12
TRAIN_SERIES = 150
TEST_SERIES = 40


@dataclass
class Row:
    model: str
    test: str
    n_series: int
    n_points: int
    mase: float
    lo: float
    hi: float


def build_series() -> pd.DataFrame:
    """Weekly mean root-zone wetness per cell (complete weeks only), long format, with its region."""
    from fieldshift_ml.datasets.power_concepts import build_soil_moisture

    cells = season_aligned(download.load_cells())
    with power.use_daily_frame(cells):
        frame = build_soil_moisture().frame.select(ID, DS, Y)
    out = frame.to_pandas()
    out[DS] = pd.to_datetime(out[DS])
    out["region"] = [region_of(float(s[:7]), float(s[8:])) for s in out[ID]]
    return out.dropna(subset=[Y])


def _pick(ids: list[str], n: int, seed: int) -> list[str]:
    rng = np.random.default_rng(seed)
    return sorted(rng.choice(ids, size=min(n, len(ids)), replace=False).tolist())


def evaluate(n_boot: int = 100, seed: int = 42, fast: bool = False) -> tuple[list[Row], dict]:
    data = build_series()
    weeks = np.sort(data[DS].unique())
    first_test = int(len(weeks) * 0.8)
    cutoff = weeks[first_test]
    starts = [first_test + int(i) for i in np.linspace(0, len(weeks) - first_test - HORIZON, N_ORIGINS)]
    by_region = {r: sorted(g[ID].unique().tolist()) for r, g in data.groupby("region")}
    train_ids = _pick(by_region["train"], TRAIN_SERIES, seed)
    held_ids = [i for r in ("africa", "south_asia") for i in _pick(by_region.get(r, []), TEST_SERIES // 2, seed)]
    seen_ids = _pick([i for i in by_region["train"] if i not in train_ids], TEST_SERIES, seed + 1)
    groups = {"seen": seen_ids, "holdout": held_ids, "weld": by_region.get("weld", [])}
    log.info("c04: %d series de entrenamiento; pruebas %s", len(train_ids), {k: len(v) for k, v in groups.items()})

    train = data[data[ID].isin(train_ids) & (data[DS] < cutoff)][[ID, DS, Y]]
    models = {m.name: m for m in forecast_models("W-MON", SEASON, HORIZON, fast, seed)
              if m.name in ("base_persistencia", "base_climatologia", "base_estacional", "patchtst")}
    start = time.perf_counter()
    for m in models.values():
        m.fit(train)
    fit_seconds = round(time.perf_counter() - start, 1)
    weld_model = load_bundle("c04")["model"]
    models["weld_only"] = weld_model

    rows: list[Row] = []
    for name, ids in groups.items():
        if not ids:
            continue
        sub = data[data[ID].isin(ids)][[ID, DS, Y]]
        scale = _seasonal_scale(sub[sub[DS] < cutoff], SEASON)
        parts: dict[str, list[pd.DataFrame]] = {k: [] for k in models}
        for origin in starts:
            history = sub[sub[DS] < weeks[origin]]
            for key, model in models.items():
                f = model.predict(history, HORIZON)
                f["cutoff"] = weeks[origin - 1]
                parts[key].append(f)
        for key, chunks in parts.items():
            merged = pd.concat(chunks).merge(sub, on=[ID, DS], how="inner").dropna(subset=[Y, YHAT])
            s = merged[ID].map(scale).to_numpy()
            y, p = merged[Y].to_numpy(), merged[YHAT].to_numpy()
            mase = float(np.mean(np.abs(p - y) / s))
            fn = M.primary_metric_fn("forecast", y, p, scale=s)
            lo, hi = M.block_bootstrap_ci(fn, M.time_blocks(merged["cutoff"].to_numpy()), n_boot=n_boot, seed=0)
            rows.append(Row(key, name, len(ids), len(y), mase, lo, hi))
            log.info("c04 %-18s %-8s series=%-3d MASE %.3f [%.3f–%.3f]", key, name, len(ids), mase, lo, hi)
    info = {"train_series": len(train_ids), "fit_seconds": fit_seconds, "model": models["patchtst"], "cutoff": str(cutoff)[:10]}
    return rows, info
