"""Drought probability from ERA5 monthly data (30 cells over Weld, 1940–2026)."""

from __future__ import annotations

import numpy as np
import polars as pl

from fieldshift_ml.config import get_settings
from fieldshift_ml.datasets.base import Dataset
from fieldshift_ml.features.climate import cyclical, spi
from fieldshift_ml.io import era5


def build_drought(lead_months: int = 3, spi_threshold: float = -1.0, inference: bool = False) -> Dataset:
    """c05a — ¿el SPI de 3 meses caerá bajo `spi_threshold` dentro de `lead_months` meses?

    With `inference=True` the latest months (whose future SPI is not known yet) are kept with a null label.
    """
    frame = era5.read_monthly().with_columns(
        pl.col("date").dt.year().alias("year"), pl.col("date").dt.month().alias("month"),
    )
    years = frame.get_column("year").unique().sort()
    n_test = max(1, int(round(years.len() * get_settings().test_fraction)))
    limit = int(years[years.len() - n_test - 1])  # SPI is calibrated with training years only

    frame = frame.sort("cell", "date").with_columns(
        *[pl.col("rain_mm").rolling_sum(k).over("cell").alias(f"rain_{k}") for k in (3, 6, 12)],
        pl.col("rain_mm").alias("rain_1"),
        (pl.col("rain_mm") - pl.col("pet_mm")).rolling_sum(3).over("cell").alias("water_balance_3"),
        pl.col("temp_c").rolling_mean(3).over("cell").alias("temp_mean_3"),
    )
    parts = []
    for _, group in frame.group_by("cell", maintain_order=True):
        months = group["month"].to_numpy()
        reference = (group["year"] <= limit).to_numpy()
        columns = [
            pl.Series(f"spi_{k}", spi(group[f"rain_{k}"].to_numpy(), months, reference)) for k in (1, 3, 6, 12)
        ]
        temp = group["temp_mean_3"].to_numpy()
        anomaly = np.full(temp.shape[0], np.nan)
        for month in range(1, 13):
            in_month = months == month
            ref = temp[in_month & reference]
            ref = ref[np.isfinite(ref)]
            if ref.size:
                anomaly[in_month] = temp[in_month] - ref.mean()
        parts.append(group.with_columns(*columns, pl.Series("temp_anomaly_3", anomaly)))
    frame = pl.concat(parts).with_columns(
        pl.col("spi_3").shift(-lead_months).over("cell").alias("_spi_future"),
        (pl.col("spi_3") - pl.col("spi_3").shift(1).over("cell")).alias("spi_3_change"),
        *cyclical(pl.col("month"), 12, "month"),
    )
    numeric = ["spi_1", "spi_3", "spi_6", "spi_12", "spi_3_change", "water_balance_3", "temp_anomaly_3",
               "soil_water_top", "soil_water_root", "month_sin", "month_cos", "lat", "lon", "drought_now"]
    keep = pl.col("spi_12").is_not_null() if inference else (
        pl.col("_spi_future").is_not_null() & pl.col("_spi_future").is_not_nan() & pl.col("spi_12").is_not_null())
    frame = frame.with_columns([pl.col(c).fill_nan(None) for c in numeric[:7]]).filter(keep).with_columns(
        (pl.col("_spi_future") <= spi_threshold).cast(pl.Int8).alias("drought_next"),
        # estado actual (solo usa información ya conocida): es la base de persistencia
        (pl.col("spi_3") <= spi_threshold).fill_null(False).cast(pl.Int8).alias("drought_now"),
    )
    return Dataset(
        concept="c05a", task="classification", frame=frame.sort("date", "cell"), target="drought_next",
        features=numeric, split="time", time_col="year",
        baseline_feature="drought_now", baseline_name="base_persistencia",
        notes=["Fuente: ERA5 mensual (ECMWF), 30 celdas de ~25 km sobre Weld, 1940–2026.",
               f"Sequía: SPI de 3 meses <= {spi_threshold} dentro de {lead_months} meses. "
               f"El SPI se calibra solo con años <= {limit}.",
               "`base_persistencia` = P(sequía futura | ¿hay sequía ahora?), aprendida solo con los años de "
               "entrenamiento; es más exigente que la frecuencia histórica y es la referencia a superar.",
               "Las celdas vecinas están muy correlacionadas: la muestra efectiva es menor al número de filas."],
    )
