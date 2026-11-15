"""Which places of the world are used to train the global climate models, and which are held out to test them.

Cells are the MERRA-2 grid of NASA POWER (0.5° x 0.625°). Candidates are drawn at random and stratified by latitude band,
then ocean cells are dropped after downloading (POWER has no root-zone soil wetness over water). Whole regions are held out
so the models are also tested where they never trained.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

from fieldshift_ml.io.live.power_api import LAT_STEP, LON_STEP, cell_of

BAND_DEG = 10
LAT_MIN, LAT_MAX = -58.0, 72.0
# held-out regions (lon_min, lat_min, lon_max, lat_max): never used for training
HOLDOUT = {
    "africa": (-20.0, -35.0, 52.0, 37.0),
    "south_asia": (60.0, 5.0, 100.0, 35.0),
}
WELD = (-105.2, 39.8, -103.5, 41.1)


@dataclass(frozen=True)
class Cell:
    lat: float
    lon: float

    @property
    def id(self) -> str:
        return f"{self.lat:+07.2f}_{self.lon:+08.3f}"


def region_of(lat: float, lon: float) -> str:
    for name, (w, s, e, n) in HOLDOUT.items():
        if w <= lon <= e and s <= lat <= n:
            return name
    w, s, e, n = WELD
    if w <= lon <= e and s <= lat <= n:
        return "weld"
    return "train"


def candidates(per_band: int = 45, seed: int = 7) -> list[Cell]:
    """Random MERRA-2 cells, `per_band` per 10° of latitude, plus the two Weld cells (always tested, never trained)."""
    rng = random.Random(seed)
    seen: dict[tuple[float, float], Cell] = {}
    lat0 = LAT_MIN
    while lat0 < LAT_MAX:
        for _ in range(per_band):
            lat = rng.uniform(lat0, min(lat0 + BAND_DEG, LAT_MAX))
            lon = rng.uniform(-179.0, 179.0)
            c = cell_of(lat, lon)
            if LAT_MIN <= c[0] <= LAT_MAX:
                seen[c] = Cell(*c)
        lat0 += BAND_DEG
    for lat, lon in ((40.42, -104.71), (40.82, -104.75)):
        c = cell_of(lat, lon)
        seen[c] = Cell(*c)
    return sorted(seen.values(), key=lambda c: (c.lat, c.lon))


__all__ = ["HOLDOUT", "LAT_STEP", "LON_STEP", "Cell", "candidates", "region_of"]
