"""Cropland Data Layer (CDL) for Weld: one 30 m raster per year with the crop grown on each pixel."""

from __future__ import annotations

import re
from pathlib import Path

import numpy as np
import polars as pl
import rasterio

from fieldshift_ml.config import get_settings

# CDL codes that matter in Weld; everything else is grouped as "otro"
CLASS_NAMES = {
    1: "maiz", 4: "sorgo", 6: "girasol", 21: "cebada", 23: "trigo_primavera", 24: "trigo_invierno",
    28: "avena", 29: "mijo", 36: "alfalfa", 37: "otro_heno", 41: "remolacha", 42: "frijol",
    43: "papa", 49: "cebolla", 61: "barbecho", 176: "pastizal", 205: "triticale",
}
NON_CROP = {0, 63, 64, 65, 81, 82, 83, 87, 88, 92, 111, 112, 121, 122, 123, 124, 131, 141, 142, 143,
            152, 176, 190, 195}


def _files() -> dict[int, Path]:
    folder = get_settings().external / "11-CDL-CropScape" / "datos"
    files = {}
    for path in folder.glob("CDL_*_Weld_08123.tif"):
        match = re.match(r"CDL_(\d{4})_", path.name)
        if match:
            files[int(match.group(1))] = path
    if len(files) < 6:
        raise FileNotFoundError(f"Se necesitan al menos 6 años de CDL en {folder}; hay {len(files)}")
    return dict(sorted(files.items()))


def cache_file() -> Path:
    return get_settings().subdir("cache") / "cdl_sample.parquet"


def sample_history(step: int = 12, min_crop_years: float = 0.5, refresh: bool = False) -> pl.DataFrame:
    """Crop history of a regular sample of cropland pixels.

    One pixel every `step` (360 m with step=12) keeps neighbours apart; a pixel is kept when it was
    cropland (or fallow) in at least `min_crop_years` of the years. Columns: pixel, x, y (EPSG:5070
    metres), block (10 km square) and one `y<year>` column with the CDL code.
    """
    target = cache_file()
    if target.exists() and not refresh:
        return pl.read_parquet(target)
    files = _files()
    layers = {}
    for year, path in files.items():
        with rasterio.open(path) as source:
            layers[year] = source.read(1)[::step, ::step]
            transform, shape = source.transform, source.shape
    stack = np.stack(list(layers.values()))
    is_crop = ~np.isin(stack, list(NON_CROP))
    keep = is_crop.mean(axis=0) >= min_crop_years
    rows, cols = np.nonzero(keep)
    full_rows, full_cols = rows * step, cols * step
    xs, ys = rasterio.transform.xy(transform, full_rows, full_cols)
    frame = pl.DataFrame({
        "pixel": (full_rows.astype(np.int64) * shape[1] + full_cols).astype(np.int64),
        "x": np.asarray(xs), "y": np.asarray(ys),
        "block": (full_rows // 333).astype(np.int32) * 100 + (full_cols // 333).astype(np.int32),
        **{f"y{year}": layer[rows, cols].astype(np.int16) for year, layer in layers.items()},
    })
    frame.write_parquet(target)
    return frame


def years(frame: pl.DataFrame) -> list[int]:
    return sorted(int(c[1:]) for c in frame.columns if re.fullmatch(r"y\d{4}", c))


def class_name(code: int) -> str:
    return CLASS_NAMES.get(int(code), "otro")
