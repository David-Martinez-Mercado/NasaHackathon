"""NASA POWER point files (daily and monthly CSV with a text header)."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from pathlib import Path

import polars as pl

from fieldshift_ml.config import SITES, get_settings

MISSING = -999.0
# Frame to use instead of the downloaded files (the live service injects fresh API data here; see `use_daily_frame`).
_OVERRIDE: ContextVar[pl.DataFrame | None] = ContextVar("power_daily_override", default=None)


@contextmanager
def use_daily_frame(frame: pl.DataFrame) -> Iterator[None]:
    """Inside the block `read_daily_all()` returns `frame` (columns: date, site, variables), so every dataset builder
    and deployed model runs on fresh data without reading the CSV files."""
    token = _OVERRIDE.set(frame)
    try:
        yield
    finally:
        _OVERRIDE.reset(token)


def _data_dir() -> Path:
    return get_settings().nasa / "04-NASA-POWER" / "datos"


def _skip_rows(path: Path) -> int:
    with path.open(encoding="utf-8") as handle:
        for index, line in enumerate(handle):
            if line.startswith("-END HEADER-"):
                return index + 1
    raise ValueError(f"No se encontró '-END HEADER-' en {path}")


def daily_file(site: str) -> Path:
    matches = sorted(_data_dir().glob(f"power_daily_{site}_*.csv"))
    if not matches:
        raise FileNotFoundError(f"Falta el archivo diario de NASA POWER para {site} en {_data_dir()}")
    return matches[-1]


def read_daily(site: str) -> pl.DataFrame:
    """Daily weather for one site; -999 becomes null and trailing empty days are dropped."""
    path = daily_file(site)
    frame = pl.read_csv(path, skip_rows=_skip_rows(path))
    value_cols = [c for c in frame.columns if c not in ("YEAR", "DOY")]
    frame = frame.with_columns(
        (pl.date(pl.col("YEAR"), 1, 1) + pl.duration(days=pl.col("DOY") - 1)).alias("date"),
        *[pl.when(pl.col(c) == MISSING).then(None).otherwise(pl.col(c)).cast(pl.Float64).alias(c)
          for c in value_cols],
    )
    frame = frame.filter(pl.col("T2M").is_not_null())
    return frame.select("date", pl.lit(site).alias("site"), *value_cols).sort("date")


def read_daily_all() -> pl.DataFrame:
    override = _OVERRIDE.get()
    if override is not None:
        return override
    return pl.concat([read_daily(site) for site in SITES])
