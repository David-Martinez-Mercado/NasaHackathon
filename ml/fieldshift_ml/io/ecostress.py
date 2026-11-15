"""ECOSTRESS L4T ESI v003 (70 m): evaporative stress index sampled at fixed points."""

from __future__ import annotations

import logging
import re
from datetime import datetime
from pathlib import Path

import geopandas as gpd
import numpy as np
import polars as pl
import rasterio

from fieldshift_ml.config import get_settings

log = logging.getLogger("fieldshift_ml")
_NAME = re.compile(r"ECOv003_L4T_ESI_(\d+)_(\d+)_(\w{5})_(\d{8}T\d{6})_\d+_ESI\.tif$")


def _folder() -> Path:
    return get_settings().nasa / "06-ECOSTRESS" / "datos" / "L4T_ESI_v003_estres_2024-2026"


def scenes() -> list[tuple[Path, str, datetime]]:
    folder = _folder()
    if not folder.exists():
        raise FileNotFoundError(f"No existe {folder}")
    found = []
    for path in sorted(folder.glob("*_ESI.tif")):
        match = _NAME.search(path.name)
        if match:
            found.append((path, match.group(3), datetime.strptime(match.group(4), "%Y%m%dT%H%M%S")))
    if not found:
        raise FileNotFoundError(f"No hay escenas ESI en {folder}")
    return found


def sample_points(points: gpd.GeoDataFrame, id_column: str = "pixel") -> pl.DataFrame:
    """ESI at each point for every clear-sky scene. Columns: pixel, time_utc, tile, esi."""
    ids = points[id_column].to_numpy()
    projected: dict[str, tuple[np.ndarray, np.ndarray]] = {}
    parts = []
    listing = scenes()
    for index, (path, tile, when) in enumerate(listing):
        with rasterio.open(path) as source:
            key = source.crs.to_string()
            if key not in projected:
                geometry = points.to_crs(source.crs).geometry
                projected[key] = (geometry.x.to_numpy(), geometry.y.to_numpy())
            xs, ys = projected[key]
            rows, cols = rasterio.transform.rowcol(source.transform, xs, ys)
            rows, cols = np.asarray(rows), np.asarray(cols)
            inside = (rows >= 0) & (rows < source.height) & (cols >= 0) & (cols < source.width)
            if not inside.any():
                continue
            esi = source.read(1)[rows[inside], cols[inside]].astype(float)
        cloud_path = path.with_name(path.name.replace("_ESI.tif", "_cloud.tif"))
        clear = np.ones(esi.shape[0], dtype=bool)
        if cloud_path.exists():
            with rasterio.open(cloud_path) as cloud:
                clear = cloud.read(1)[rows[inside], cols[inside]] == 0
        keep = clear & np.isfinite(esi)
        if keep.any():
            parts.append(pl.DataFrame({
                "pixel": ids[inside][keep], "time_utc": [when] * int(keep.sum()), "tile": tile,
                "esi": esi[keep],
            }))
        if index % 100 == 0:
            log.info("ECOSTRESS: %d/%d escenas", index, len(listing))
    if not parts:
        raise FileNotFoundError("Ninguna escena ESI cubre los puntos de muestra")
    return pl.concat(parts)
