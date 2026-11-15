"""Elevation (NASADEM, the reprocessed SRTM) over Weld County: heights, slope, and averaging onto the display grid."""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import Affine
from rasterio.warp import Resampling, reproject

from fieldshift_ml.config import WELD_BBOX, get_settings

M_PER_DEG_LAT = 110_540.0
M_PER_DEG_LON_AT_EQUATOR = 111_320.0


@dataclass(frozen=True)
class Dem:
    """Heights in metres (NaN where there is no data) on a regular lon/lat raster."""

    heights: np.ndarray
    transform: Affine

    @property
    def shape(self) -> tuple[int, int]:
        return self.heights.shape  # type: ignore[return-value]


def dem_path() -> Path:
    folder = get_settings().nasa / "05-SRTM" / "datos" / "appeears_SRTMGL1_NASADEM"
    files = sorted(folder.glob("NASADEM_NC.*/NASADEM_NC.*NASADEM_HGT*.tif"))
    if not files:
        raise FileNotFoundError(f"No encuentro el DEM de NASADEM (NASADEM_HGT*.tif) en {folder}")
    return files[0]


def read_dem(path: Path | None = None) -> Dem:
    with rasterio.open(path or dem_path()) as source:
        heights = source.read(1).astype("float32")
        if source.nodata is not None:
            heights[heights == source.nodata] = np.nan
        return Dem(heights=heights, transform=source.transform)


def slope_percent(dem: Dem) -> np.ndarray:
    """Slope in percent (rise over run × 100) with Horn's 3×3 method, in metres on the ground."""
    z = np.pad(dem.heights, 1, mode="edge")
    res_x, res_y = dem.transform.a, -dem.transform.e
    north = dem.transform.f
    lat_mid = north + dem.transform.e * dem.heights.shape[0] / 2
    dx = res_x * M_PER_DEG_LON_AT_EQUATOR * math.cos(math.radians(lat_mid))
    dy = res_y * M_PER_DEG_LAT
    dzdx = ((z[:-2, 2:] + 2 * z[1:-1, 2:] + z[2:, 2:]) - (z[:-2, :-2] + 2 * z[1:-1, :-2] + z[2:, :-2])) / (8 * dx)
    dzdy = ((z[2:, :-2] + 2 * z[2:, 1:-1] + z[2:, 2:]) - (z[:-2, :-2] + 2 * z[:-2, 1:-1] + z[:-2, 2:])) / (8 * dy)
    return (np.hypot(dzdx, dzdy) * 100).astype("float32")


def sample(values: np.ndarray, dem: Dem, lon: np.ndarray, lat: np.ndarray) -> np.ndarray:
    """Value of a DEM-aligned raster at each lon/lat (nearest cell); NaN outside the raster."""
    col = np.floor((np.asarray(lon) - dem.transform.c) / dem.transform.a).astype(int)
    row = np.floor((np.asarray(lat) - dem.transform.f) / dem.transform.e).astype(int)
    inside = (row >= 0) & (row < values.shape[0]) & (col >= 0) & (col < values.shape[1])
    out = np.full(col.shape, np.nan, dtype="float64")
    out[inside] = values[row[inside], col[inside]]
    return out


def to_display_grid(values: np.ndarray, dem: Dem, cols: int, rows: int, bbox=WELD_BBOX) -> list[float | None]:
    """Mean of the 30 m cells inside each display cell, row-major from the north edge (None where all are empty)."""
    west, south, east, north = bbox
    out = np.full((rows, cols), np.nan, dtype="float32")
    reproject(
        source=values.astype("float32"), destination=out, src_transform=dem.transform, src_crs="EPSG:4326",
        dst_transform=Affine((east - west) / cols, 0, west, 0, -(north - south) / rows, north), dst_crs="EPSG:4326",
        resampling=Resampling.average, src_nodata=np.nan, dst_nodata=np.nan,
    )
    return [None if not np.isfinite(v) else round(float(v), 3) for v in out.ravel()]
