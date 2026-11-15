"""Erosion potential: where cropland is most exposed to water erosion, from soil, slope and rainfall.

A relative RUSLE-style index: K (soil erodibility, SSURGO) × S (slope steepness from the NASADEM 30 m DEM) × R
(rainfall erosivity, with the PRISM annual precipitation normal as a stand-in). It leaves out slope length and crop
cover/management: this is the *inherent* exposure of the land, not tons of soil lost. There is no measured erosion
to calibrate it against.
"""

from __future__ import annotations

import geopandas as gpd
import numpy as np
import polars as pl
from pyproj import Transformer

from fieldshift_ml.config import get_settings
from fieldshift_ml.datasets import registry
from fieldshift_ml.datasets.base import DataNotReady
from fieldshift_ml.io import dem, ssurgo

# Provisional classes, as a multiple of the typical (median) cropland pixel. [POR VERIFICAR] with an agronomist.
HIGH_RATIO, MEDIUM_RATIO = 3.0, 1.8


def slope_factor(slope_pct: np.ndarray) -> np.ndarray:
    """RUSLE slope steepness S (McCool et al.): gentle slopes (< 9 %) and steep slopes use different fits."""
    sin = np.sin(np.arctan(np.asarray(slope_pct, dtype=float) / 100))
    return np.where(slope_pct < 9, 10.8 * sin + 0.03, 16.8 * sin - 0.5)


def erosion_index(k: np.ndarray, slope_pct: np.ndarray, ppt_mm: np.ndarray) -> np.ndarray:
    """Raw index K × S × R_rel (R_rel = precipitation relative to the sample mean). Higher = more exposed."""
    rain = np.asarray(ppt_mm, dtype=float)
    return np.asarray(k, dtype=float) * slope_factor(slope_pct) * (rain / np.nanmean(rain))


def build_points() -> pl.DataFrame:
    """One row per sampled cropland pixel: position, slope, K, rain, raw index, ratio to the median, percentile."""
    cache = get_settings().subdir("cache") / "erosion_points.parquet"
    if cache.exists():
        return pl.read_parquet(cache)
    try:
        base = registry.get_concept("c06").build().frame  # cropland pixels (CDL) with PRISM normals
        elevation = dem.read_dem()
        units = ssurgo.read_map_units()[["mukey", "geometry"]]
        erodibility = ssurgo.read_erodibility()
    except FileNotFoundError as exc:
        raise DataNotReady("erosion", [str(exc)]) from exc
    lon, lat = Transformer.from_crs(5070, 4326, always_xy=True).transform(base["x"].to_numpy(), base["y"].to_numpy())
    slope = dem.sample(dem.slope_percent(elevation), elevation, np.asarray(lon), np.asarray(lat))
    pts = gpd.GeoDataFrame({"i": np.arange(len(lon))}, geometry=gpd.points_from_xy(lon, lat), crs="EPSG:4326")
    joined = gpd.sjoin(pts.to_crs(units.crs), units, how="left", predicate="within")
    joined = joined[~joined.index.duplicated()].merge(erodibility, on="mukey", how="left")
    k = joined.sort_values("i")["k_factor"].to_numpy(dtype=float)
    raw = erosion_index(k, slope, base["ppt_annual_mm"].to_numpy())
    frame = pl.DataFrame({"lon": lon, "lat": lat, "slope_pct": slope, "k_factor": k,
                          "ppt_annual_mm": base["ppt_annual_mm"].to_numpy(), "raw": raw}).with_columns(
        pl.col(pl.Float64).fill_nan(None)).drop_nulls().filter(pl.col("raw") > 0)
    raw_values = frame["raw"].to_numpy()
    ratio = raw_values / np.median(raw_values)
    rank = raw_values.argsort().argsort() / max(len(raw_values) - 1, 1) * 100
    frame = frame.with_columns(pl.Series("ratio", ratio), pl.Series("score", rank))
    frame.write_parquet(cache)
    return frame
