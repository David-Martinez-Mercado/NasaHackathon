"""Grids, color ramps and legends for the map layers."""

from __future__ import annotations

import math

import numpy as np

from fieldshift_ml.config import WELD_BBOX
from fieldshift_ml.deploy.schema import ColorStop

GRID_COLS, GRID_ROWS = 34, 30  # display grid over the Weld bbox (~3.4 km cells)

RAMPS: dict[str, list[ColorStop]] = {
    "temperature": [ColorStop(at=0, color="#2E86DE"), ColorStop(at=0.5, color="#F7DC6F"), ColorStop(at=1, color="#E74C3C")],
    "humidity": [ColorStop(at=0, color="#C0392B"), ColorStop(at=0.5, color="#F4D03F"), ColorStop(at=1, color="#2471A3")],
    "rain": [ColorStop(at=0, color="#FDFEFE"), ColorStop(at=1, color="#1F618D")],
    "drought": [ColorStop(at=0, color="#FCF3CF"), ColorStop(at=0.5, color="#F5B041"), ColorStop(at=1, color="#B03A2E")],
    "vulnerability": [ColorStop(at=0, color="#27AE60"), ColorStop(at=0.5, color="#F4D03F"), ColorStop(at=1, color="#C0392B")],
    "elevation": [ColorStop(at=0, color="#2E7D32"), ColorStop(at=0.4, color="#D4E157"), ColorStop(at=0.75, color="#A1887F"),
                  ColorStop(at=1, color="#FAFAFA")],
    "slope": [ColorStop(at=0, color="#FCF3CF"), ColorStop(at=0.5, color="#E59866"), ColorStop(at=1, color="#7B241C")],
    "erosion": [ColorStop(at=0, color="#FAE5D3"), ColorStop(at=0.5, color="#DC7633"), ColorStop(at=1, color="#5D2E0C")],
}


def legend(lo: float, hi: float, unit: str, steps: int = 5) -> list[str]:
    """Labels from the top (max) to the bottom (min), as the frontend draws them."""
    values = np.linspace(hi, lo, steps)
    return [f"{v:.0f}{unit}" for v in values]


def cell_centers(bbox: tuple[float, float, float, float], cols: int, rows: int) -> tuple[np.ndarray, np.ndarray]:
    """Longitude and latitude of each cell centre, row-major from the NORTH edge."""
    west, south, east, north = bbox
    lons = west + (np.arange(cols) + 0.5) * (east - west) / cols
    lats = north - (np.arange(rows) + 0.5) * (north - south) / rows
    lon, lat = np.meshgrid(lons, lats)
    return lon.ravel(), lat.ravel()


def idw(points: list[tuple[float, float, float]], bbox=WELD_BBOX, cols: int = GRID_COLS, rows: int = GRID_ROWS,
        power: float = 2.0) -> list[float]:
    """Inverse-distance weighting of a few (lon, lat, value) points onto the display grid.

    With two reanalysis points this is only a smooth blend between them: layers built this way are flagged
    `interpolated` and must never be read as measured detail inside a parcel.
    """
    if not points:
        raise ValueError("idw necesita al menos un punto")
    lon, lat = cell_centers(bbox, cols, rows)
    lat0 = math.radians((bbox[1] + bbox[3]) / 2)
    weights, total = np.zeros(lon.shape), np.zeros(lon.shape)
    for px, py, value in points:
        dist = np.hypot((lon - px) * math.cos(lat0), lat - py)
        w = 1.0 / np.maximum(dist, 1e-6) ** power
        weights += w
        total += w * value
    return [round(float(v), 4) for v in total / weights]


def aggregate_cells(lons: np.ndarray, lats: np.ndarray, values: np.ndarray, bbox=WELD_BBOX, cols: int = GRID_COLS,
                    rows: int = GRID_ROWS) -> list[float | None]:
    """Mean of the points that fall in each cell (null where none do), row-major from the north edge."""
    west, south, east, north = bbox
    col = np.floor((lons - west) / (east - west) * cols).astype(int)
    row = np.floor((north - lats) / (north - south) * rows).astype(int)
    inside = (col >= 0) & (col < cols) & (row >= 0) & (row < rows) & np.isfinite(values)
    flat = row[inside] * cols + col[inside]
    sums = np.bincount(flat, weights=values[inside], minlength=rows * cols)
    counts = np.bincount(flat, minlength=rows * cols)
    with np.errstate(invalid="ignore", divide="ignore"):
        mean = sums / counts
    return [round(float(v), 4) if c else None for v, c in zip(mean, counts, strict=True)]
