"""c03 — vegetation stress: ECOSTRESS ESI explained by the weather of the previous days."""

from __future__ import annotations

import geopandas as gpd
import numpy as np
import polars as pl

from fieldshift_ml.config import SITES, get_settings
from fieldshift_ml.datasets.base import DataNotReady, Dataset
from fieldshift_ml.features.climate import cyclical
from fieldshift_ml.io import cdl, ecostress, power

MAX_POINTS = 2_500
LOCAL_TZ = "America/Denver"  # Mountain time with daylight saving (UTC-7 in winter, UTC-6 in summer)


def to_local_time(frame: pl.DataFrame, column: str = "time_utc") -> pl.DataFrame:
    """Add `time_local` from a UTC timestamp, honouring daylight saving time.

    A naive timestamp is taken as UTC: ECOSTRESS file names carry the acquisition time (UTC) [POR VERIFICAR:
    the GeoTIFFs have no time tag, so this rests on the product naming convention].
    """
    utc = pl.col(column)
    if frame.schema[column].time_zone is None:  # type: ignore[union-attr]
        utc = utc.dt.replace_time_zone("UTC")
    return frame.with_columns(utc.dt.convert_time_zone(LOCAL_TZ).alias("time_local"))


def add_esi_history(frame: pl.DataFrame, cutoff, value: str = "esi", pixel: str = "pixel",
                    date: str = "date") -> pl.DataFrame:
    """Add `esi_hist`, the pixel's mean ESI before `cutoff`, without letting a row see its own label.

    - Training rows (date < cutoff): mean of the pixel's OTHER training dates (leave-one-out). A pixel with no
      other date falls back to the global training mean.
    - Test rows (date >= cutoff): mean of all the pixel's training dates (or the global mean if it has none).
    """
    train = frame.filter(pl.col(date) < cutoff)
    overall = train.get_column(value).mean()
    stats = train.group_by(pixel).agg(pl.col(value).sum().alias("_sum"), pl.len().alias("_n"))
    joined = frame.join(stats, on=pixel, how="left")
    is_train = pl.col(date) < cutoff
    hist = (
        pl.when(is_train & (pl.col("_n") > 1)).then((pl.col("_sum") - pl.col(value)) / (pl.col("_n") - 1))
        .when(~is_train & (pl.col("_n") > 0)).then(pl.col("_sum") / pl.col("_n"))
        .otherwise(overall)
    )
    return joined.with_columns(hist.alias("esi_hist")).drop("_sum", "_n")


def _weather() -> pl.DataFrame:
    rain = pl.col("PRECTOTCORR")
    return power.read_daily_all().sort("site", "date").with_columns(
        rain.rolling_sum(7).over("site").alias("rain_sum_7"),
        rain.rolling_sum(14).over("site").alias("rain_sum_14"),
        rain.rolling_sum(30).over("site").alias("rain_sum_30"),
        pl.col("T2M_MAX").rolling_mean(7).over("site").alias("tmax_mean_7"),
        pl.col("EVPTRNS").rolling_mean(7).over("site").alias("et_mean_7"),
        (pl.col("T2M") - pl.col("T2MDEW")).alias("dew_depression"),
    ).select("site", "date", "T2M_MAX", "T2M_MIN", "RH2M", "WS2M", "ALLSKY_SFC_SW_DWN", "GWETTOP",
             "GWETROOT", "rain_sum_7", "rain_sum_14", "rain_sum_30", "tmax_mean_7", "et_mean_7",
             "dew_depression")


def build() -> Dataset:
    cache = get_settings().subdir("cache") / "ecostress_points.parquet"
    try:
        from fieldshift_ml.datasets.vulnerability import build as build_points

        points = build_points().frame
        if points.height > MAX_POINTS:
            points = points.sample(MAX_POINTS, seed=42)
        if cache.exists():
            samples = pl.read_parquet(cache)
        else:
            geometry = gpd.GeoDataFrame(
                {"pixel": points["pixel"].to_numpy()},
                geometry=gpd.points_from_xy(points["x"].to_numpy(), points["y"].to_numpy()), crs="EPSG:5070",
            )
            samples = ecostress.sample_points(geometry)
            samples.write_parquet(cache)
        crops = cdl.sample_history()
    except FileNotFoundError as exc:
        raise DataNotReady("c03", [str(exc)]) from exc

    last_year = cdl.years(crops)[-1]
    crop_names = crops.select(
        "pixel", pl.col(f"y{last_year}").map_elements(cdl.class_name, return_dtype=pl.String).alias("crop"))
    lonlat = gpd.GeoSeries(gpd.points_from_xy(points["x"].to_numpy(), points["y"].to_numpy()),
                           crs="EPSG:5070").to_crs("EPSG:4326")
    sites = list(SITES.values())
    nearest = np.array([min(sites, key=lambda s: abs(s.lat - lat)).key for lat in lonlat.y])
    static = points.select("pixel", "slope_pct", "available_water_cm", (pl.col("x") / 1000).alias("x_km"),
                           (pl.col("y") / 1000).alias("y_km")).with_columns(pl.Series("site", nearest))

    frame = (
        to_local_time(samples.filter(pl.col("esi").is_between(0, 2)))
        .with_columns(pl.col("time_local").dt.date().alias("date"),
                      (pl.col("time_local").dt.hour() + pl.col("time_local").dt.minute() / 60).alias("hour"),
                      pl.col("time_local").dt.ordinal_day().alias("doy"))
        .group_by("pixel", "date").agg(pl.col("esi").mean(), pl.col("hour").mean(), pl.col("doy").first())
        .join(static, on="pixel").join(crop_names, on="pixel", how="left")
        .join(_weather(), on=["site", "date"], how="inner")
        .with_columns(*cyclical(pl.col("doy"), 365.25, "doy"))
    )
    dates = frame.get_column("date").unique().sort()
    # same cut as splits.time_split: the last 20 % of the distinct dates go to test
    cutoff = dates[dates.len() - max(1, int(round(dates.len() * get_settings().test_fraction)))]
    frame = add_esi_history(frame, cutoff)
    features = ["T2M_MAX", "T2M_MIN", "RH2M", "WS2M", "ALLSKY_SFC_SW_DWN", "GWETTOP", "GWETROOT",
                "rain_sum_7", "rain_sum_14", "rain_sum_30", "tmax_mean_7", "et_mean_7", "dew_depression",
                "hour", "doy_sin", "doy_cos", "slope_pct", "available_water_cm", "x_km", "y_km", "esi_hist",
                "crop", "site"]
    return Dataset(
        concept="c03", task="regression", frame=frame.sort("date", "pixel"), target="esi",
        features=features, categorical=["crop", "site"], split="time", time_col="date",
        baseline_feature="esi_hist",
        notes=["Etiqueta: ESI de ECOSTRESS L4T v003 (70 m), cielo despejado, 2024–2026 "
               "(0 = estrés total, 1 = sin estrés).",
               "Clima: NASA POWER del punto más cercano; es igual para todos los píxeles de una fecha, "
               "así que el modelo explica sobre todo la variación entre fechas.",
               f"`esi_hist` = ESI promedio del píxel antes de {cutoff}; es la referencia a superar. En "
               "entrenamiento excluye la fecha propia de cada fila (para que no vea su etiqueta).",
               "La hora local usa America/Denver con horario de verano; se asume que las marcas de tiempo de "
               "ECOSTRESS vienen en UTC [POR VERIFICAR: los GeoTIFF no traen etiqueta de hora].",
               "Solo hay ~2.5 años de escenas: la prueba cubre unos pocos meses de una misma temporada."],
    )
