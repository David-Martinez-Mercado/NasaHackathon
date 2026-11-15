"""Concepts built from NASA POWER daily data (two points in Weld: Greeley and Nunn/CPER)."""

from __future__ import annotations

import numpy as np
import polars as pl

from fieldshift_ml.config import get_settings
from fieldshift_ml.datasets.base import Dataset
from fieldshift_ml.features.climate import cyclical, run_length_at_least, trailing_run_at_least
from fieldshift_ml.io import power

POWER_NOTE = "Fuente: NASA POWER (MERRA-2/CERES), puntos Greeley y Nunn. Es reanálisis de ~50 km, no una estación."


def _daily() -> pl.DataFrame:
    return power.read_daily_all().sort("site", "date").with_columns(
        pl.col("date").dt.year().alias("year"),
        pl.col("date").dt.month().alias("month"),
        pl.col("date").dt.ordinal_day().alias("doy"),
    )


def _train_year_limit(frame: pl.DataFrame) -> int:
    """Last year that belongs to training in a time split; thresholds must be learned up to here."""
    years = frame.get_column("year").unique().sort()
    n_test = max(1, int(round(years.len() * get_settings().test_fraction)))
    return int(years[years.len() - n_test - 1])


def build_rain_probability(horizon_days: int = 1, threshold_mm: float = 1.0) -> Dataset:
    """c08a — ¿lloverá (>= threshold) en los próximos `horizon_days` días?"""
    rain = pl.col("PRECTOTCORR")
    future = [rain.shift(-k).over("site") for k in range(1, horizon_days + 1)]
    frame = _daily().with_columns(
        rain.rolling_sum(3).over("site").alias("rain_sum_3"),
        rain.rolling_sum(7).over("site").alias("rain_sum_7"),
        rain.rolling_sum(30).over("site").alias("rain_sum_30"),
        (rain >= threshold_mm).cast(pl.Int8).rolling_sum(7).over("site").alias("wet_days_7"),
        (pl.col("PS") - pl.col("PS").shift(1).over("site")).alias("ps_change_1"),
        (pl.col("PS") - pl.col("PS").shift(3).over("site")).alias("ps_change_3"),
        (pl.col("T2M") - pl.col("T2M").shift(1).over("site")).alias("t2m_change_1"),
        (pl.col("RH2M") - pl.col("RH2M").shift(1).over("site")).alias("rh_change_1"),
        (pl.col("T2M") - pl.col("T2MDEW")).alias("dew_depression"),
        *cyclical(pl.col("doy"), 365.25, "doy"),
        pl.max_horizontal(future).alias("_future_rain"),
    )
    frame = frame.filter(pl.col("_future_rain").is_not_null() & pl.col("rain_sum_30").is_not_null())
    frame = frame.with_columns((pl.col("_future_rain") >= threshold_mm).cast(pl.Int8).alias("rain_next"))
    features = [
        "T2M", "T2M_MAX", "T2M_MIN", "T2MDEW", "T2MWET", "RH2M", "QV2M", "WS2M", "PS", "TS",
        "ALLSKY_SFC_SW_DWN", "GWETTOP", "PRECTOTCORR", "rain_sum_3", "rain_sum_7", "rain_sum_30",
        "wet_days_7", "ps_change_1", "ps_change_3", "t2m_change_1", "rh_change_1", "dew_depression",
        "doy_sin", "doy_cos", "site",
    ]
    return Dataset(
        concept="c08a", task="classification", frame=frame.sort("date", "site"), target="rain_next",
        features=features, categorical=["site"], split="time", time_col="year",
        notes=[POWER_NOTE, f"Evento: lluvia >= {threshold_mm} mm en los próximos {horizon_days} día(s).",
               "La prueba son los últimos años completos (20 %)."],
    )


def build_rain_monthly() -> Dataset:
    """c08b — lámina de lluvia mensual (mm) a 6 meses."""
    frame = (
        _daily().group_by("site", pl.col("date").dt.truncate("1mo").alias("ds"))
        .agg(pl.col("PRECTOTCORR").sum().alias("y"), pl.len().alias("days"))
        .filter(pl.col("days") >= 28)
        .select(pl.col("site").alias("unique_id"), "ds", "y").sort("unique_id", "ds")
    )
    return Dataset(
        concept="c08b", task="forecast", frame=frame, target="y", freq="MS", horizon=6, season_length=12,
        notes=[POWER_NOTE, "Lluvia total del mes (mm). Horizonte: 6 meses, origen móvil sobre el 20 % final.",
               "Pronosticar la lluvia mensual a 6 meses usando solo la propia serie suele no superar a la "
               "climatología (el promedio histórico de cada mes): por eso `base_climatologia` es la referencia "
               "esperada y un `skill` cercano a 0 o negativo es un resultado normal, no un fallo.",
               "No hay ningún índice climático (ENSO/ONI, PDO...) en RESOURCES_DIR, así que este concepto no usa "
               "exógenas. Si se descargara uno, habría que usarlo con la misma regla sin fuga que c04: solo su valor "
               "ya publicado en el origen (desplazado al menos 6 meses, o el último valor conocido), nunca el de "
               "los meses que se pronostican."],
    )


def build_soil_moisture() -> Dataset:
    """c04 — humedad de la zona de raíces (0–1) a 4 semanas."""
    frame = (
        _daily().group_by("site", pl.col("date").dt.truncate("1w").alias("ds"))
        .agg(pl.col("GWETROOT").mean().alias("y"), pl.len().alias("days"),
             pl.col("PRECTOTCORR").sum().alias("rain_mm"), pl.col("T2M_MAX").mean().alias("tmax_c"),
             pl.col("EVPTRNS").mean().alias("et_mj"))
        .filter(pl.col("days") == 7)
        .select(pl.col("site").alias("unique_id"), "ds", "y", "rain_mm", "tmax_c", "et_mj")
        .sort("unique_id", "ds")
    )
    horizon = 4
    return Dataset(
        concept="c04", task="forecast", frame=frame, target="y", freq="W-MON", horizon=horizon, season_length=52,
        exog_cols=["rain_mm", "tmax_c", "et_mj"],
        notes=[POWER_NOTE, "Variable GWETROOT (humedad de raíz de MERRA-2) como sustituto mientras llega SMAP.",
               f"Promedio semanal. Horizonte: {horizon} semanas, origen móvil sobre el 20 % final.",
               "Exógenas (`lightgbm_exogenas`, `xgboost_exogenas`): lluvia total, Tmax media y ET media de la "
               "semana. Sin fuga: el clima de una semana futura no se conoce en el origen, así que para "
               f"pronosticar la semana t+k se usa el de t+k-{horizon} (siempre ya observado porque k <= {horizon}); "
               "el modelo se niega a pronosticar más lejos que ese rezago. Los modelos `*_rezagos` no las ven, "
               "para poder medir cuánto aporta el clima."],
    )


def build_heatwave(lead_days: int = 7, run_days: int = 3) -> Dataset:
    """c05b — ¿habrá ola de calor (>= run_days días sobre el percentil 90) en los próximos `lead_days` días?"""
    daily = _daily()
    limit = _train_year_limit(daily)
    thresholds = (
        daily.filter((pl.col("year") <= limit) & pl.col("month").is_between(6, 8))
        .group_by("site").agg(pl.col("T2M_MAX").quantile(0.9).alias("hot_threshold"))
    )
    daily = daily.join(thresholds, on="site").sort("site", "date")
    parts = []
    for _, group in daily.group_by("site", maintain_order=True):
        hot = (group["T2M_MAX"] >= group["hot_threshold"]).fill_null(False).to_numpy()
        in_wave = run_length_at_least(hot, run_days)  # used only to define the future event (the label)
        ahead = np.zeros(len(in_wave), dtype=np.int8)
        for k in range(1, lead_days + 1):
            ahead[:-k] |= in_wave[k:]
        valid = np.ones(len(in_wave), dtype=bool)
        valid[-lead_days:] = False
        # Current state: `in_wave` cannot be used here because it marks the first days of a run once the run is
        # known to last `run_days`, i.e. it peeks at tomorrow. The causal state looks only backwards.
        now = trailing_run_at_least(hot, run_days)
        parts.append(group.with_columns(
            pl.Series("hot_day", hot.astype(np.int8)), pl.Series("heatwave_next", ahead),
            pl.Series("heatwave_now", now.astype(np.int8)), pl.Series("_valid", valid),
        ))
    frame = pl.concat(parts).with_columns(
        (pl.col("T2M_MAX") - pl.col("hot_threshold")).alias("tmax_minus_threshold"),
        pl.col("T2M_MAX").rolling_mean(3).over("site").alias("tmax_mean_3"),
        pl.col("T2M_MAX").rolling_mean(7).over("site").alias("tmax_mean_7"),
        pl.col("T2M_MAX").rolling_max(7).over("site").alias("tmax_max_7"),
        pl.col("T2M_MIN").rolling_mean(7).over("site").alias("tmin_mean_7"),
        pl.col("hot_day").rolling_sum(7).over("site").alias("hot_days_7"),
        pl.col("PRECTOTCORR").rolling_sum(14).over("site").alias("rain_sum_14"),
        pl.col("PRECTOTCORR").rolling_sum(30).over("site").alias("rain_sum_30"),
        *cyclical(pl.col("doy"), 365.25, "doy"),
    )
    frame = frame.filter(pl.col("_valid") & pl.col("month").is_between(5, 9) & pl.col("rain_sum_30").is_not_null())
    features = [
        "T2M_MAX", "T2M_MIN", "T2M", "RH2M", "WS2M", "PS", "ALLSKY_SFC_SW_DWN", "GWETTOP", "GWETROOT",
        "tmax_minus_threshold", "tmax_mean_3", "tmax_mean_7", "tmax_max_7", "tmin_mean_7", "hot_days_7",
        "rain_sum_14", "rain_sum_30", "doy_sin", "doy_cos", "site", "heatwave_now",
    ]
    return Dataset(
        concept="c05b", task="classification", frame=frame.sort("date", "site"), target="heatwave_next",
        features=features, categorical=["site"], split="time", time_col="year",
        baseline_feature="heatwave_now", baseline_name="base_persistencia",
        notes=[POWER_NOTE,
               f"Ola de calor: {run_days}+ días seguidos con máxima sobre el percentil 90 de junio–agosto "
               f"(umbral calculado solo con años <= {limit}).",
               f"Se predice si ocurre en los próximos {lead_days} días; filas de mayo a septiembre.",
               f"`heatwave_now` = el día actual ya es el {run_days}.º (o posterior) día caluroso seguido; usa solo "
               "días pasados. `base_persistencia` = P(ola próxima | ¿ola ahora?), aprendida con los años de "
               "entrenamiento, y es la referencia a superar."],
    )
