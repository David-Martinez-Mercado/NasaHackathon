"""Per-cell history of POWER daily weather: downloaded once, then refreshed with only the newest days.

The models need decades of history (thresholds, 30-day rolling sums, seasonal references), but the API only has to be
asked for the last few days on every refresh. If a refresh fails the last good copy is served and flagged as stale.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

import polars as pl

from fieldshift_ml.io.live.power_api import FIRST_DAY, PARAMETERS, PowerError, PowerSource, cell_of

log = logging.getLogger("fieldshift_ml")

OVERLAP_DAYS = 10  # re-ask this many days before the last one: POWER revises its newest values


@dataclass(frozen=True)
class HistoryMeta:
    cell: tuple[float, float]
    last_date: date
    fetched_at: float  # epoch seconds of the last successful download
    from_cache: bool  # True when no network call was needed for this request
    stale: bool  # a refresh failed: the copy is older than the TTL
    latency_ms: float
    error: str | None = None


class HistoryCache:
    def __init__(self, source: PowerSource, folder: Path | None = None, ttl_seconds: float = 6 * 3600,
                 clock=time.time, today=date.today):
        self.source, self.folder, self.ttl, self._clock, self._today = source, folder, ttl_seconds, clock, today
        self._memory: dict[tuple[float, float], tuple[pl.DataFrame, float]] = {}
        self._locks: dict[tuple[float, float], threading.Lock] = {}
        self._guard = threading.Lock()
        if folder is not None:
            folder.mkdir(parents=True, exist_ok=True)

    def _path(self, cell: tuple[float, float]) -> Path | None:
        return None if self.folder is None else self.folder / f"power_daily_{cell[0]:.3f}_{cell[1]:.3f}.parquet"

    def _lock(self, cell) -> threading.Lock:
        with self._guard:
            return self._locks.setdefault(cell, threading.Lock())

    def _load_disk(self, cell) -> tuple[pl.DataFrame, float] | None:
        path = self._path(cell)
        if path is None or not path.exists():
            return None
        frame = pl.read_parquet(path)
        if not set(PARAMETERS) <= set(frame.columns) or frame.is_empty():
            log.warning("Se ignora la copia guardada %s: no trae todas las variables de POWER", path.name)
            return None  # never serve a partial or foreign file as if it were real weather
        return frame, path.stat().st_mtime

    def _save(self, cell, frame: pl.DataFrame) -> None:
        path = self._path(cell)
        if path is not None:
            tmp = path.with_suffix(".tmp")
            frame.write_parquet(tmp)
            tmp.replace(path)

    def history(self, lat: float, lon: float) -> tuple[pl.DataFrame, HistoryMeta]:
        """Daily weather from 1981 to the newest day POWER has, for the cell of the point."""
        started = time.perf_counter()
        cell = cell_of(lat, lon)
        with self._lock(cell):
            cached = self._memory.get(cell) or self._load_disk(cell)
            now = self._clock()
            if cached is not None and now - cached[1] < self.ttl:
                self._memory[cell] = cached
                return self._result(cell, cached, True, False, started)
            try:
                frame = self._download(cell, cached[0] if cached else None)
            except PowerError as exc:
                if cached is None:
                    raise
                log.warning("POWER no respondió; se usa la copia guardada de la celda %s: %s", cell, exc)
                self._memory[cell] = cached
                return self._result(cell, cached, True, True, started, str(exc))
            entry = (frame, now)
            self._memory[cell] = entry
            self._save(cell, frame)
            return self._result(cell, entry, False, False, started)

    def _download(self, cell, previous: pl.DataFrame | None) -> pl.DataFrame:
        end = self._today()
        if previous is None or previous.is_empty():
            return self.source.daily(cell[0], cell[1], FIRST_DAY, end)
        start = previous["date"].max() - timedelta(days=OVERLAP_DAYS)
        fresh = self.source.daily(cell[0], cell[1], start, end)
        keep = previous.filter(pl.col("date") < fresh["date"].min()) if not fresh.is_empty() else previous
        return pl.concat([keep, fresh], how="diagonal_relaxed").sort("date")

    def _result(self, cell, entry, from_cache: bool, stale: bool, started: float, error: str | None = None):
        frame, fetched = entry
        meta = HistoryMeta(cell=cell, last_date=frame["date"].max(), fetched_at=fetched, from_cache=from_cache, stale=stale,
                           latency_ms=round((time.perf_counter() - started) * 1000, 1), error=error)
        return frame, meta
