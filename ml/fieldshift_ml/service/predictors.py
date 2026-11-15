"""Live predictions for one point: fresh POWER weather -> the same dataset builders -> the deployed models.

The builders and models are exactly the ones used by the batch export (`deploy/export.py`). The only change is where the
daily weather comes from: `io.power.use_daily_frame` swaps the downloaded CSV for the frame fetched from the API.
Which concepts can be live: the ones fed only by POWER (c05b heat waves, c08a rain tomorrow, c08b monthly rain, c04 soil
moisture). The others need data that arrives by queue or once a year, so they stay in the batch export.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date

import numpy as np
import pandas as pd
import polars as pl

from fieldshift_ml.config import SITES, WELD_BBOX
from fieldshift_ml.deploy.predict import apply_scenario, predict_forecast, predict_tabular
from fieldshift_ml.io import power

ZONE_MARGIN_DEG = 0.25  # how far outside Weld a point may be and still count as "near the training zone"
HEAT_SEASON = range(5, 10)  # the heat-wave model is only used from May to September (as in the export)
LIVE_CONCEPTS = ("c05b", "c08a", "c08b", "c04")
TITLES = {
    "c05b": ("Riesgo de ola de calor", "%", "próximos 7 días"),
    "c08a": ("Probabilidad de lluvia mañana", "%", "mañana"),
    "c08b": ("Lluvia mensual esperada", "mm", "próximos 6 meses"),
    "c04": ("Humedad de la zona de raíces", "%", "próximas 4 semanas"),
}
SCENARIO_CONCEPTS = ("c05b", "c08a")


@dataclass
class ConceptResult:
    concept: str
    title: str
    unit: str
    horizon: str
    available: bool
    value: float | None = None
    series: list[float] | None = None
    as_of: date | None = None
    role: str = "modelo"
    algorithm: str = ""
    scenario_applied: bool = False
    notes: list[str] = field(default_factory=list)
    reason: str | None = None


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(a))


def nearest_site(lat: float, lon: float) -> tuple[str, float]:
    """The training site closest to the point (its name is the categorical `site` value the models know)."""
    return min(((key, haversine_km(lat, lon, s.lat, s.lon)) for key, s in SITES.items()), key=lambda kv: kv[1])


def in_zone(lat: float, lon: float) -> bool:
    west, south, east, north = WELD_BBOX
    return (west - ZONE_MARGIN_DEG <= lon <= east + ZONE_MARGIN_DEG) and (south - ZONE_MARGIN_DEG <= lat <= north + ZONE_MARGIN_DEG)


def _meta(bundle_info: dict, concept: str) -> tuple[str, str]:
    info = bundle_info.get(concept, {})
    return info.get("role", "modelo"), info.get("algorithm", "")


def _last_rows(frame: pl.DataFrame) -> pl.DataFrame:
    return frame.sort("date").group_by("site", maintain_order=True).last()


def _unavailable(concept: str, reason: str, info: dict) -> ConceptResult:
    title, unit, horizon = TITLES[concept]
    role, algorithm = _meta(info, concept)
    return ConceptResult(concept, title, unit, horizon, False, role=role, algorithm=algorithm, reason=reason)


def _heat(bundles: dict, info: dict, rain_pct: float, temp_delta: float) -> ConceptResult:
    from fieldshift_ml.datasets.power_concepts import build_heatwave

    frame = build_heatwave(inference=True).frame
    latest = _last_rows(frame)
    day = latest["date"].min()
    if day.month not in HEAT_SEASON:
        return _unavailable("c05b", f"El modelo de olas de calor solo se usa de mayo a septiembre (último dato: {day}).", info)
    scenario = bool(rain_pct or temp_delta)
    rows = apply_scenario("c05b", latest, rain_pct, temp_delta) if scenario else latest
    title, unit, horizon = TITLES["c05b"]
    role, algorithm = _meta(info, "c05b")
    return ConceptResult("c05b", title, unit, horizon, True, float(np.mean(predict_tabular(bundles["c05b"], rows) * 100)), as_of=day,
                         role=role, algorithm=algorithm, scenario_applied=scenario,
                         notes=["Probabilidad de que empiece una ola de calor (3 o más días sobre el percentil 90 de esta celda) en los 7 días siguientes."])


def _rain_day(bundles: dict, info: dict, rain_pct: float, temp_delta: float) -> ConceptResult:
    from fieldshift_ml.datasets.power_concepts import build_rain_probability

    latest = _last_rows(build_rain_probability(inference=True).frame)
    scenario = bool(rain_pct or temp_delta)
    rows = apply_scenario("c08a", latest, rain_pct, temp_delta) if scenario else latest
    title, unit, horizon = TITLES["c08a"]
    role, algorithm = _meta(info, "c08a")
    return ConceptResult("c08a", title, unit, horizon, True, float(np.mean(predict_tabular(bundles["c08a"], rows) * 100)),
                         as_of=latest["date"].min(), role=role, algorithm=algorithm, scenario_applied=scenario,
                         notes=["Probabilidad de lluvia de 1 mm o más mañana."])


def _rain_month(bundles: dict, info: dict) -> ConceptResult:
    from fieldshift_ml.datasets.power_concepts import build_rain_monthly

    ds = build_rain_monthly()
    history = ds.frame.select("unique_id", "ds", "y").to_pandas()
    history["ds"] = pd.to_datetime(history["ds"])
    forecast = predict_forecast(bundles["c08b"], history, 6)
    values = [round(float(v), 1) for v in forecast.groupby("ds")["yhat"].mean().sort_index()]
    title, unit, horizon = TITLES["c08b"]
    role, algorithm = _meta(info, "c08b")
    return ConceptResult("c08b", title, unit, horizon, True, values[0] if values else None, series=values,
                         as_of=history["ds"].max().date(), role=role, algorithm=algorithm,
                         notes=["Lámina de lluvia de cada uno de los próximos 6 meses (mm). Es la climatología de la celda, no un pronóstico meteorológico."])


def _soil(bundles: dict, info: dict) -> ConceptResult:
    from fieldshift_ml.datasets.power_concepts import build_soil_moisture

    ds = build_soil_moisture()
    history = ds.frame.select("unique_id", "ds", "y").to_pandas()
    history["ds"] = pd.to_datetime(history["ds"])
    forecast = predict_forecast(bundles["c04"], history, 4)
    weekly = [round(float(v) * 100, 1) for v in forecast.groupby("ds")["yhat"].mean().sort_index()]
    title, unit, horizon = TITLES["c04"]
    role, algorithm = _meta(info, "c04")
    return ConceptResult("c04", title, unit, horizon, True, round(float(np.mean(weekly)), 1), series=weekly,
                         as_of=history["ds"].max().date(), role=role, algorithm=algorithm,
                         notes=["Humedad de raíz (GWETROOT de MERRA-2) esperada: promedio de las próximas 4 semanas; la serie trae cada semana."])


def observations(frame: pl.DataFrame) -> dict:
    """The newest day of raw weather, so the answer can show what the prediction started from."""
    last = frame.sort("date").tail(1).row(0, named=True)
    keep = ("T2M", "T2M_MAX", "T2M_MIN", "PRECTOTCORR", "RH2M", "GWETROOT", "GWETTOP")
    return {"date": last["date"], **{k: last[k] for k in keep if k in last}}


def predict_point(history: pl.DataFrame, lat: float, lon: float, bundles: dict, info: dict, rain_pct: float = 0.0,
                  temp_delta: float = 0.0, concepts: tuple[str, ...] = LIVE_CONCEPTS) -> list[ConceptResult]:
    """Run the live concepts on the cell history. A failure in one concept never hides the others."""
    site, _ = nearest_site(lat, lon)
    frame = history.with_columns(pl.lit(site).alias("site"))
    out: list[ConceptResult] = []
    steps = {"c05b": lambda: _heat(bundles, info, rain_pct, temp_delta), "c08a": lambda: _rain_day(bundles, info, rain_pct, temp_delta),
             "c08b": lambda: _rain_month(bundles, info), "c04": lambda: _soil(bundles, info)}
    with power.use_daily_frame(frame):
        for concept in concepts:
            if concept not in bundles:
                out.append(_unavailable(concept, "El modelo no está cargado en el servicio.", info))
                continue
            try:
                out.append(steps[concept]())
            except Exception as exc:  # noqa: BLE001 - report it, do not invent a value
                out.append(_unavailable(concept, f"No se pudo calcular: {type(exc).__name__}: {exc}"[:220], info))
    return out
