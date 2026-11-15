"""ERA5 monthly means over Weld (5 x 6 cells, 1940–2026).

The downloaded `.nc` files are ZIP archives with two NetCDF members (instantaneous and accumulated
variables); they are read from memory, nothing is extracted to disk.
"""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

import pandas as pd
import polars as pl
import xarray as xr

from fieldshift_ml.config import get_settings


def _data_dir() -> Path:
    return get_settings().external / "23-ERA5" / "datos"


def _read_members(path: Path) -> xr.Dataset:
    parts = []
    with zipfile.ZipFile(path) as archive:
        for name in archive.namelist():
            dataset = xr.open_dataset(io.BytesIO(archive.read(name)), engine="h5netcdf").load()
            # the two members stamp the same month at different hours; align both to the month start
            months = pd.to_datetime(dataset["valid_time"].values).to_period("M").to_timestamp()
            dataset = dataset.assign_coords(valid_time=months)
            parts.append(dataset.drop_vars(["number", "expver"], errors="ignore"))
    return xr.merge(parts, compat="override", join="outer")


def read_monthly() -> pl.DataFrame:
    """One row per cell and month: rain (mm), temperature (°C), soil water, potential evaporation (mm)."""
    files = sorted(p for p in _data_dir().glob("mensual_*_weld.nc") if not p.name.endswith(".part"))
    if not files:
        raise FileNotFoundError(f"No hay archivos mensuales de ERA5 en {_data_dir()}")
    frames = []
    for path in files:
        table = _read_members(path).to_dataframe().reset_index()
        frames.append(pl.from_pandas(table))
    frame = pl.concat(frames, how="diagonal_relaxed")
    date = pl.col("valid_time").cast(pl.Date)
    days = date.dt.days_in_month()
    # monthly means of daily accumulations are in metres per day
    return (
        frame.with_columns(date.dt.truncate("1mo").alias("date"))
        .select(
            "date",
            pl.format("{}_{}", pl.col("latitude"), pl.col("longitude")).alias("cell"),
            pl.col("latitude").alias("lat"), pl.col("longitude").alias("lon"),
            (pl.col("tp") * 1000 * days).alias("rain_mm"),
            (-pl.col("pev") * 1000 * days).alias("pet_mm"),
            (-pl.col("e") * 1000 * days).alias("evap_mm"),
            (pl.col("t2m") - 273.15).alias("temp_c"),
            (pl.col("d2m") - 273.15).alias("dewpoint_c"),
            pl.col("swvl1").alias("soil_water_top"), pl.col("swvl2").alias("soil_water_root"),
        )
        .filter(pl.col("rain_mm").is_not_null())
        .unique(subset=["cell", "date"], keep="last").sort("cell", "date")
    )
