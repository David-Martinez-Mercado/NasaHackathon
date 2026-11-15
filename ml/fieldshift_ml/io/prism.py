"""PRISM monthly grids (4 km, national) averaged per county.

Each monthly ZIP holds one GeoTIFF. Counties are rasterized once onto the PRISM grid and the means are
taken with a bincount, so the ~2,400 files are read in a single pass and cached as Parquet.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path

import geopandas as gpd
import numpy as np
import polars as pl
import rasterio
from rasterio import features
from rasterio.windows import from_bounds

from fieldshift_ml.config import REGION_STATES, get_settings

log = logging.getLogger("fieldshift_ml")
VARIABLES = ("ppt", "tmean", "tmax", "tmin")
_MONTHLY = re.compile(r"prism_(ppt|tmean|tmax|tmin)_us_25m_(\d{4})(\d{2})\.zip$")


def counties_file() -> Path:
    folder = get_settings().external / "24-Census-Condados" / "datos"
    path = folder / "cb_2023_us_county_20m.zip"
    if not path.exists():
        raise FileNotFoundError(
            f"Faltan los límites de condado ({path}). Descargar de "
            "https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_county_20m.zip"
        )
    return path


def read_counties() -> gpd.GeoDataFrame:
    """County polygons of the regional states with FIPS code and centroid."""
    counties = gpd.read_file(f"zip://{counties_file().as_posix()}")
    counties = counties[counties["STUSPS"].isin(REGION_STATES)].copy()
    counties["fips"] = counties["GEOID"]
    centroids = counties.geometry.representative_point()
    counties["lon"], counties["lat"] = centroids.x, centroids.y
    return counties[["fips", "STUSPS", "NAME", "lon", "lat", "geometry"]].reset_index(drop=True)


def _monthly_dir() -> Path:
    return get_settings().external / "12-PRISM" / "datos" / "mensual_4km_1981-2026"


def cache_file() -> Path:
    return get_settings().subdir("cache") / "prism_county_monthly.parquet"


def county_monthly(refresh: bool = False) -> pl.DataFrame:
    """fips, date, ppt (mm), tmean/tmax/tmin (°C) — mean of the 4 km cells inside each county."""
    target = cache_file()
    if target.exists() and not refresh:
        return pl.read_parquet(target)
    files = sorted(p for p in _monthly_dir().iterdir() if _MONTHLY.match(p.name))
    if not files:
        raise FileNotFoundError(f"No hay archivos mensuales de PRISM en {_monthly_dir()}")
    counties = read_counties()
    labels = window = None
    # the pass takes over an hour on a busy USB disk: progress is checkpointed so it can resume
    partial = target.with_name("prism_county_partial.npz")
    records: dict[tuple[int, int], dict[str, np.ndarray]] = {}
    if partial.exists() and not refresh:
        with np.load(partial) as saved:
            for key in saved.files:
                variable, year, month = key.split("_")
                if saved[key].shape[0] == len(counties):
                    records.setdefault((int(year), int(month)), {})[variable] = saved[key]
        log.info("PRISM por condado: se retoma con %d archivos ya leídos", sum(len(v) for v in records.values()))

    def checkpoint() -> None:
        np.savez_compressed(partial, **{f"{var}_{y}_{m}": values for (y, m), by_var in records.items()
                                        for var, values in by_var.items()})

    for index, path in enumerate(files):
        variable, year, month = _MONTHLY.match(path.name).groups()
        if variable in records.get((int(year), int(month)), {}):
            continue
        if index % 100 == 0 and records:
            checkpoint()
        with rasterio.open(f"/vsizip/{path.as_posix()}/{path.stem}.tif") as source:
            if labels is None:
                bounds = counties.to_crs(source.crs).total_bounds
                window = from_bounds(*bounds, transform=source.transform).round_offsets().round_lengths()
                shapes = zip(counties.to_crs(source.crs).geometry, range(1, len(counties) + 1), strict=True)
                labels = features.rasterize(
                    shapes, out_shape=(int(window.height), int(window.width)),
                    transform=source.window_transform(window), fill=0, all_touched=True, dtype="int32",
                ).ravel()
            data = source.read(1, window=window, masked=True).astype("float64")
        values = data.filled(np.nan).ravel()
        valid = np.isfinite(values) & (labels > 0)
        size = len(counties) + 1
        sums = np.bincount(labels[valid], weights=values[valid], minlength=size)
        counts = np.bincount(labels[valid], minlength=size)
        with np.errstate(invalid="ignore", divide="ignore"):
            means = (sums / counts)[1:]
        records.setdefault((int(year), int(month)), {})[variable] = means
        if index % 300 == 0:
            log.info("PRISM por condado: %d/%d archivos", index, len(files))
    fips = counties["fips"].to_numpy()
    frames = []
    for (year, month), variables in sorted(records.items()):
        frames.append(pl.DataFrame({
            "fips": fips, "year": year, "month": month,
            **{name: variables.get(name, np.full(len(fips), np.nan)) for name in VARIABLES},
        }))
    frame = pl.concat(frames).with_columns(pl.date("year", "month", 1).alias("date"))
    frame = frame.with_columns([pl.col(v).fill_nan(None) for v in VARIABLES]).join(
        pl.DataFrame({"fips": fips, "state": counties["STUSPS"].to_numpy(),
                      "lat": counties["lat"].to_numpy(), "lon": counties["lon"].to_numpy()}),
        on="fips",
    )
    frame.write_parquet(target)
    partial.unlink(missing_ok=True)
    return frame
