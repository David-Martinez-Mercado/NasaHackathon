"""Global mode: recent observed weather for the map cells in view (NASA POWER, anywhere on Earth).

Only OBSERVED climate (latest week), never model predictions: the deployed models were trained on Weld and are not valid elsewhere.
Cells are the MERRA-2 grid (0.5° x 0.625°); only the visible ones are requested, a few at a time, and kept in memory for a while.
"""

from __future__ import annotations

import math
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

from fieldshift_ml.io.live.power_api import LAT_STEP, LON_STEP, PowerError, PowerSource, cell_of

MAX_CELLS = 36
RECENT_DAYS = 10
TTL_SECONDS = 3 * 3600


def cells_in_view(west: float, south: float, east: float, north: float, limit: int = MAX_CELLS) -> tuple[list[tuple[float, float]], bool]:
    """MERRA-2 cell centres inside the view; if there are more than `limit`, a regular subsample (second value True)."""
    if not (-90 <= south < north <= 90 and -180 <= west < east <= 180):
        raise ValueError("Caja del mapa no válida")
    lats = [round(south / LAT_STEP) * LAT_STEP + i * LAT_STEP for i in range(int((north - south) / LAT_STEP) + 2)]
    lons = [round((west + 180) / LON_STEP) * LON_STEP - 180 + i * LON_STEP for i in range(int((east - west) / LON_STEP) + 2)]
    lats = [v for v in lats if south - LAT_STEP / 2 <= v <= north + LAT_STEP / 2 and -90 <= v <= 90]
    lons = [v for v in lons if west - LON_STEP / 2 <= v <= east + LON_STEP / 2 and -180 <= v <= 180]
    step = max(1, math.ceil(math.sqrt(len(lats) * len(lons) / limit)))
    picked = [(a, o) for a in lats[::step] for o in lons[::step]][:limit]
    return picked, step > 1


class GlobalGrid:
    def __init__(self, source: PowerSource, ttl: float = TTL_SECONDS, clock=time.time, today=date.today, workers: int = 8):
        self.source, self.ttl, self.clock, self.today, self.workers = source, ttl, clock, today, workers
        self._memory: dict[tuple[float, float], tuple[float, dict | None]] = {}

    def _cell(self, cell: tuple[float, float]) -> dict | None:
        hit = self._memory.get(cell)
        if hit and self.clock() - hit[0] < self.ttl:
            return hit[1]
        end = self.today()
        try:
            frame = self.source.daily(cell[0], cell[1], end - timedelta(days=RECENT_DAYS), end)
        except PowerError:
            return hit[1] if hit else None  # stale copy beats a hole in the map
        if frame.is_empty():
            return None
        week = frame.tail(7)

        def mean(c: str):
            v = week[c].drop_nulls()
            return round(float(v.mean()), 2) if len(v) and c in week.columns else None

        rain = week["PRECTOTCORR"].drop_nulls() if "PRECTOTCORR" in week.columns else []
        soil = mean("GWETROOT")
        out = {"lat": cell[0], "lon": cell[1], "temp_mean_c": mean("T2M"), "temp_max_c": mean("T2M_MAX"),
               "rain_7d_mm": round(float(rain.sum()), 1) if len(rain) else None, "humidity_pct": mean("RH2M"),
               "soil_moisture_pct": None if soil is None else round(soil * 100, 1), "as_of": frame["date"].max()}
        self._memory[cell] = (self.clock(), out)
        return out

    def view(self, west: float, south: float, east: float, north: float) -> dict:
        cells, subsampled = cells_in_view(west, south, east, north)
        with ThreadPoolExecutor(self.workers) as pool:
            results = list(pool.map(self._cell, cells))
        found = [r for r in results if r]
        return {"cells": found, "requested": len(cells), "missing": len(cells) - len(found), "subsampled": subsampled,
                "lat_step": LAT_STEP, "lon_step": LON_STEP, "as_of": max((r["as_of"] for r in found), default=None)}


__all__ = ["GlobalGrid", "cell_of", "cells_in_view"]
