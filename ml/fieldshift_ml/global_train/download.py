"""Download the full daily history (1981 -> today) of every candidate cell from NASA POWER. Resumable and polite."""

from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

import polars as pl

from fieldshift_ml.config import get_settings
from fieldshift_ml.global_train.cells import Cell, candidates
from fieldshift_ml.io.live.power_api import FIRST_DAY, PowerClient, PowerError

log = logging.getLogger("fieldshift_ml")


def folder() -> Path:
    path = get_settings().subdir("global") / "cells"
    path.mkdir(parents=True, exist_ok=True)
    return path


def path_of(cell: Cell) -> Path:
    return folder() / f"{cell.id}.parquet"


def is_land(frame: pl.DataFrame) -> bool:
    """Root-zone soil wetness exists only over land in POWER."""
    return "GWETROOT" in frame.columns and frame["GWETROOT"].drop_nulls().len() > 0.9 * frame.height


def fetch_one(client: PowerClient, cell: Cell, end: date) -> str:
    target = path_of(cell)
    if target.exists() or target.with_suffix(".ocean").exists():
        return "ya"
    try:
        frame = client.daily(cell.lat, cell.lon, FIRST_DAY, end)
    except PowerError as exc:
        log.warning("%s: %s", cell.id, exc)
        return "error"
    if not is_land(frame):
        target.with_suffix(".ocean").write_text("ocean", encoding="utf-8")
        return "oceano"
    frame.write_parquet(target.with_suffix(".tmp"))
    target.with_suffix(".tmp").replace(target)
    return "ok"


def run(limit: int | None = None, workers: int = 6, per_band: int = 45, pause: float = 0.0) -> dict[str, int]:
    cells = candidates(per_band)[:limit] if limit else candidates(per_band)
    client = PowerClient(timeout=120.0, retries=4, backoff=2.0)
    end = date.today()
    counts: dict[str, int] = {}
    started = time.perf_counter()

    def work(cell: Cell) -> str:
        result = fetch_one(client, cell, end)
        if pause:
            time.sleep(pause)
        return result

    with ThreadPoolExecutor(workers) as pool:
        for i, result in enumerate(pool.map(work, cells), 1):
            counts[result] = counts.get(result, 0) + 1
            if i % 20 == 0 or i == len(cells):
                log.info("%d/%d celdas · %s · %.0f s", i, len(cells), counts, time.perf_counter() - started)
    return counts


def load_cells() -> pl.DataFrame:
    """All downloaded land cells as one frame (date, site = cell id, variables)."""
    parts = []
    for file in sorted(folder().glob("*.parquet")):
        parts.append(pl.read_parquet(file).with_columns(pl.lit(file.stem).alias("site")))
    if not parts:
        raise FileNotFoundError("No hay celdas descargadas: corre `fieldshift-ml global download`")
    return pl.concat(parts, how="diagonal_relaxed").sort("site", "date")
