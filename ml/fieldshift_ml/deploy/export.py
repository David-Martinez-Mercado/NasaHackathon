"""Predictions of the deployed models, written as the versioned export that the backend imports.

Everything here is batch: it runs where the data and the models are (this laptop), writes plain JSON under
`ml/deploy/exports/<version>/` and the backend loads it into PostgreSQL in one transaction. Each piece is built
independently: if one fails, the others are still written and the failure is listed in the manifest, never hidden.
"""

from __future__ import annotations

import logging
import math
from datetime import UTC, date, datetime
from pathlib import Path

import numpy as np
import pandas as pd
import polars as pl
from pydantic import BaseModel

from fieldshift_ml.config import SITES, WELD_BBOX, WELD_FIPS
from fieldshift_ml.datasets import registry as datasets
from fieldshift_ml.deploy import grid, paths
from fieldshift_ml.deploy.manifest import new_version, sha256_bytes
from fieldshift_ml.deploy.predict import (
    apply_scenario,
    index_scores,
    load_bundle,
    load_manifest,
    predict_forecast,
    predict_tabular,
)
from fieldshift_ml.deploy.registry import DEPLOY
from fieldshift_ml.deploy.schema import (
    SCHEMA_VERSION,
    Alert,
    ClimateSummary,
    ExportManifest,
    FileEntry,
    HumiditySummary,
    Layer,
    MapPoint,
    ModelInfo,
    PointsFile,
    ScenarioGrid,
    Series,
    SeriesFile,
    SeriesPoint,
    Summaries,
    Table,
    TablesFile,
    Zone,
)

log = logging.getLogger("fieldshift_ml")

# Slider ranges of the app: rainfall -50..+50 %, temperature -2..+4 °C
RAIN_BINS = (-50, -25, 0, 25, 50)
TEMP_BINS = (-2, 0, 2, 4)

WHATIF_NOTE = ("Los escenarios de lluvia y temperatura mueven las variables de clima que entran al modelo: es una "
               "sensibilidad del modelo, no una proyección climática.")
TWO_POINTS_NOTE = ("El clima viene de 2 puntos de reanálisis (~50 km): dentro de una parcela el valor es uno solo y el "
                   "degradado entre puntos es interpolación, no variación medida.")
UNAVAILABLE = [
    "Puntos de erosión (no hay modelo ni dato)",
    "Reservas de agua y balance hídrico (no hay fuente con licencia verificada)",
    "Elevación (SRTM aún no se descarga)",
    "Recomendaciones agronómicas por capa (las entrega el motor de reglas, no el ML)",
]
LIMITATIONS = [
    "Los modelos se entrenaron con datos de Weld, Colorado (EE. UU.), no de Durango.",
    "Temperatura, humedad, lluvia y sequía vienen de reanálisis de 25–50 km: no distinguen parcelas vecinas.",
    "Los escenarios ¿y si? son sensibilidades de los modelos, no proyecciones climáticas.",
    "El ML entrega insumos; la recomendación final la da y explica el motor de reglas. La herramienta apoya, no reemplaza, "
    "la experiencia local.",
]


class _Run:
    """Collects what an export writes, so the manifest can list every file with its hash."""

    def __init__(self, out: Path):
        self.out = out
        self.files: list[FileEntry] = []
        self.limits: list[str] = []
        self.dates: list[date] = []
        self.extras: dict = {}

    def write(self, rel: str, model: BaseModel, kind: str) -> None:
        data = model.model_dump_json().encode("utf-8")
        path = self.out / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        self.files.append(FileEntry(path=rel, sha256=sha256_bytes(data), kind=kind))  # type: ignore[arg-type]

    def failed(self, what: str, error: Exception) -> None:
        text = f"No se pudo generar {what}: {type(error).__name__}: {error}"[:300]
        log.warning(text)
        self.limits.append(text)


def _d(value) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return pd.Timestamp(value).date()


def _last_per_site(frame: pl.DataFrame) -> pl.DataFrame:
    return frame.sort("date").group_by("site", maintain_order=True).last()


def _site_points(sites: list[str], values) -> list[tuple[float, float, float]]:
    return [(SITES[s].lon, SITES[s].lat, float(v)) for s, v in zip(sites, values, strict=True)]


def _scenario_grids(concept: str, rows: pl.DataFrame, bundle: dict, applies: bool) -> list[ScenarioGrid]:
    combos = [(r, t) for r in RAIN_BINS for t in TEMP_BINS] if applies else [(0, 0)]
    out = []
    sites = rows["site"].to_list()
    for rain, temp in combos:
        frame = apply_scenario(concept, rows, rain, temp) if applies else rows
        probability = predict_tabular(bundle, frame) * 100
        per_site = pl.DataFrame({"site": sites, "p": probability}).group_by("site", maintain_order=True).agg(
            pl.col("p").mean())  # one row per site, or the mean of several days
        out.append(ScenarioGrid(rain_pct=rain, temp_delta=temp,
                                values=grid.idw(_site_points(per_site["site"].to_list(), per_site["p"].to_list()))))
    return out


def _layer(kind, concept, title, variable, unit, lo, hi, scenarios, applies, source, resolution_m, interpolated, as_of,
           notes, bbox=WELD_BBOX, cols=grid.GRID_COLS, rows=grid.GRID_ROWS) -> Layer:
    return Layer(kind=kind, concept=concept, title=title, variable=variable, unit=unit, min=lo, max=hi,
                 ramp=grid.RAMPS[kind], legend=grid.legend(lo, hi, unit), bbox=bbox, cols=cols, rows=rows,
                 scenarios=scenarios, scenario_applies=applies, source=source, resolution_m=resolution_m,
                 interpolated=interpolated, as_of=as_of, notes=notes)


# ------------------------------------------------------------------------------------------------ layers
def _heat_layer(run: _Run) -> Layer:
    from fieldshift_ml.datasets.power_concepts import build_heatwave

    bundle = load_bundle("c05b")
    frame = build_heatwave(inference=True).frame
    summer = frame.filter(pl.col("month").is_between(6, 8))
    year = int(summer["year"].max())
    rows = summer.filter(pl.col("year") == year)
    as_of = _d(rows["date"].max())
    latest = _last_per_site(frame)
    if _d(latest["date"].min()).month in range(5, 10):  # a forecast only makes sense inside the heat season
        run.extras["heat_pct"] = float(np.mean(predict_tabular(bundle, latest) * 100))
    notes = [f"Exposición media de la temporada de calor más reciente (junio–agosto {year}): promedio, sobre todos sus "
             "días, de la probabilidad de que empiece una ola en los 7 días siguientes.",
             "Fuera de mayo–septiembre el modelo no se usa: no hay pronóstico de ola de calor para hoy.",
             WHATIF_NOTE, TWO_POINTS_NOTE,
             "La respuesta a la lluvia es una asociación estadística del modelo (más lluvia reciente va con más "
             "probabilidad de ola), no un efecto físico comprobado."]
    return _layer("temperature", "c05b", "Riesgo de ola de calor",
                  "Probabilidad media de que empiece una ola de calor (3 o más días seguidos sobre el percentil 90) "
                  f"en los 7 días siguientes, promedio de junio–agosto {year}",
                  "%", 0, 100, _scenario_grids("c05b", rows, bundle, True), True, "NASA POWER (MERRA-2) + modelo c05b",
                  50_000, True, as_of, notes)


def _rain_layer(run: _Run) -> Layer:
    from fieldshift_ml.datasets.power_concepts import build_rain_probability

    bundle = load_bundle("c08a")
    rows = _last_per_site(build_rain_probability(inference=True).frame)
    as_of = _d(rows["date"].min())
    run.extras["rain_day_pct"] = float(np.mean(predict_tabular(bundle, rows) * 100))
    return _layer("rain", "c08a", "Probabilidad de lluvia", "Probabilidad de lluvia (1 mm o más) mañana", "%", 0, 100,
                  _scenario_grids("c08a", rows, bundle, True), True, "NASA POWER (MERRA-2) + modelo c08a", 50_000, True,
                  as_of, [WHATIF_NOTE, TWO_POINTS_NOTE])


def _humidity_layer(run: _Run) -> Layer:
    ds = datasets.get_concept("c04").build()
    bundle = load_bundle("c04")
    history = ds.frame.select("unique_id", "ds", "y").to_pandas()
    history["ds"] = pd.to_datetime(history["ds"])
    forecast = predict_forecast(bundle, history, 4)
    per_site = forecast.groupby("unique_id")["yhat"].mean() * 100
    as_of = history["ds"].max().date()
    run.extras["humidity_forecast"] = float(per_site.mean())
    points = [(SITES[s].lon, SITES[s].lat, float(v)) for s, v in per_site.items()]
    scenarios = [ScenarioGrid(rain_pct=0, temp_delta=0, values=grid.idw(points))]
    return _layer("humidity", "c04", "Humedad del suelo",
                  "Humedad de la zona de raíces (GWETROOT de MERRA-2) esperada como promedio de las próximas 4 semanas",
                  "%", 20, 60, scenarios, False, "NASA POWER (MERRA-2) + modelo c04", 50_000, True, as_of,
                  [TWO_POINTS_NOTE, "El modelo usa solo la propia serie de humedad: los sliders no cambian esta capa.",
                   "Su ventaja sobre repetir la última semana no es concluyente (intervalos traslapados)."])


def _drought_layer(run: _Run) -> Layer:
    from fieldshift_ml.datasets.era5_concepts import build_drought

    bundle = load_bundle("c05a")
    frame = build_drought(inference=True).frame
    last = frame["date"].max()
    rows = frame.filter(pl.col("date") == last)
    p = predict_tabular(bundle, rows) * 100
    lats = sorted(set(rows["lat"].to_list()), reverse=True)
    lons = sorted(set(rows["lon"].to_list()))
    values: list[float | None] = [None] * (len(lats) * len(lons))
    for lat, lon, v in zip(rows["lat"], rows["lon"], p, strict=True):
        values[lats.index(lat) * len(lons) + lons.index(lon)] = round(float(v), 4)
    half = 0.125
    bbox = (min(lons) - half, min(lats) - half, max(lons) + half, max(lats) + half)
    run.extras["drought_now"] = (int(rows["drought_now"].sum()), rows.height)
    run.extras["drought_as_of"] = _d(last)
    return _layer("drought", "c05a", "Riesgo de sequía",
                  "Probabilidad de sequía (SPI de 3 meses bajo -1) dentro de 3 meses",
                  "%", 0, 100, [ScenarioGrid(rain_pct=0, temp_delta=0, values=values)], False,
                  "ERA5 mensual (ECMWF) + regla de persistencia c05a", 25_000, False, _d(last),
                  ["Regla de persistencia, no un modelo aprendido: ningún modelo superó a la persistencia.",
                   f"Último mes disponible en ERA5: {_d(last):%Y-%m}.",
                   "Celdas nativas de ERA5 (~25 km); la rejilla no está suavizada."],
                  bbox=bbox, cols=len(lons), rows=len(lats))


def _vulnerability_layer(run: _Run) -> Layer:
    from pyproj import Transformer

    ds = datasets.get_concept("c06").build()
    bundle = load_bundle("c06")
    scores = index_scores(bundle, ds.frame)
    lon, lat = Transformer.from_crs(5070, 4326, always_xy=True).transform(
        ds.frame["x"].to_numpy(), ds.frame["y"].to_numpy())
    values = grid.aggregate_cells(np.asarray(lon), np.asarray(lat), scores)
    run.extras["vulnerability_mean"] = float(np.mean(scores))
    return _layer("vulnerability", "c06", "Vulnerabilidad",
                  "Índice de vulnerabilidad 0-100: qué tan frágil es cada zona (suelo, clima normal e historial de cultivo)",
                  "", 0, 100, [ScenarioGrid(rain_pct=0, temp_delta=0, values=values)], False,
                  "SSURGO + PRISM normales 1991–2020 + CDL", 3_400, False, date.today(),
                  ["Índice relativo (percentil entre los píxeles de cultivo muestreados), no una medida física.",
                   "Cada celda promedia píxeles de 30 m muestreados; las celdas vacías no tienen cultivo muestreado.",
                   "La pendiente sale de SSURGO porque SRTM aún no está descargado.",
                   "Sin etiqueta real de vulnerabilidad: necesita revisión agronómica."])


# ------------------------------------------------------------------------------------------------ points
def _stress_points(run: _Run) -> PointsFile:
    import math as _m

    from pyproj import Transformer

    from fieldshift_ml.datasets.stress import _weather

    ds = datasets.get_concept("c03").build()
    bundle = load_bundle("c03")
    frame = ds.frame
    last = frame["date"].max()
    pixels = frame.group_by("pixel", maintain_order=True).agg(
        pl.col("slope_pct").first(), pl.col("available_water_cm").first(), pl.col("x_km").first(),
        pl.col("y_km").first(), pl.col("crop").first(), pl.col("site").first(), pl.col("esi").mean().alias("esi_hist"),
    )
    weather = _weather().filter(pl.col("date") == last).drop("date")
    doy = last.timetuple().tm_yday
    rows = pixels.join(weather, on="site", how="inner").with_columns(
        pl.lit(float(frame["hour"].median())).alias("hour"),
        pl.lit(_m.sin(2 * _m.pi * doy / 365.25)).alias("doy_sin"),
        pl.lit(_m.cos(2 * _m.pi * doy / 365.25)).alias("doy_cos"),
    )
    esi = predict_tabular(bundle, rows)
    q_high, q_med = np.quantile(frame["esi"].to_numpy(), [0.10, 0.25])  # thresholds from the ESI OBSERVED in 2024–2026
    lon, lat = Transformer.from_crs(5070, 4326, always_xy=True).transform(
        rows["x_km"].to_numpy() * 1000, rows["y_km"].to_numpy() * 1000)
    points, n_high = [], 0
    for pixel, x, y, v in zip(rows["pixel"], lon, lat, esi, strict=True):
        if v > q_med:
            continue
        severity = "high" if v <= q_high else "medium"
        n_high += severity == "high"
        points.append(MapPoint(id=f"stress-{pixel}", lat=round(float(y), 6), lon=round(float(x), 6), kind="stress",
                               label="Estrés hídrico alto" if severity == "high" else "Estrés hídrico medio",
                               severity=severity, value=round(float(v), 4)))
    run.extras["stress"] = (n_high, len(esi))
    run.extras["stress_as_of"] = _d(last)
    return PointsFile(kind="stress", concept="c03", source="ECOSTRESS ESI (70 m) + NASA POWER + modelo c03", as_of=_d(last),
                      unit="ESI (0 = estrés total, 1 = sin estrés)",
                      notes=["Alto: ESI previsto en el 10 % más bajo del ESI observado por ECOSTRESS en 2024–2026; "
                             "medio: hasta el 25 % más bajo. Los umbrales no cambian con la fecha.",
                             f"Clima de {_d(last)} (última escena ECOSTRESS disponible).",
                             f"Se evaluaron {len(esi):,} píxeles muestreados de 70 m, no todos los de la zona.",
                             "La prueba del modelo cubre solo ~15 fechas de una temporada."],
                      points=points)


# ------------------------------------------------------------------------------------------------ series
def _market_series(run: _Run) -> SeriesFile:
    from fieldshift_ml.datasets.yield_concepts import PRICE_SERIES

    ds = datasets.get_concept("c10").build()
    bundle = load_bundle("c10")
    history = ds.frame.select("unique_id", "ds", "y").to_pandas()
    history["ds"] = pd.to_datetime(history["ds"])
    forecast = predict_forecast(bundle, history, 6)
    units = {name: key.split("MEASURED IN ")[-1] for key, name in PRICE_SERIES.items()}
    base = ds.frame.group_by("unique_id").agg((pl.col("price") / pl.col("y") * 100).mean().alias("base"))
    base_of = dict(zip(base["unique_id"], base["base"], strict=True))
    out = []
    for crop in sorted(history["unique_id"].unique()):
        observed = ds.frame.filter(pl.col("unique_id") == crop).sort("ds").tail(24)
        points = [SeriesPoint(label=f"{_d(d):%Y-%m}", a=round(float(p), 2)) for d, p in zip(observed["ds"], observed["price"], strict=True)]
        future = forecast[forecast["unique_id"] == crop].sort_values("ds")
        points += [SeriesPoint(label=f"{_d(d):%Y-%m}", a=round(float(v) / 100 * base_of[crop], 2), forecast=True)
                   for d, v in zip(future["ds"], future["yhat"], strict=True)]
        out.append(Series(id=f"market:{crop}", title=f"Precio recibido por el productor: {crop}", unit=units.get(crop, ""),
                          source="USDA NASS QuickStats (nacional, EE. UU.) + modelo c10", concept="c10",
                          notes=["Precios nominales, sin ajustar por inflación.", "Los últimos 6 puntos son pronóstico.",
                                 "El precio entra a la herramienta como dato; este pronóstico es solo exploratorio."],
                          points=points))
    return SeriesFile(series=out)


def _statistics_series(run: _Run) -> SeriesFile:
    from fieldshift_ml.io import power

    daily = power.read_daily_all().with_columns(pl.col("date").dt.year().alias("year"))
    yearly = daily.group_by("site", "year").agg(
        pl.col("T2M").mean().alias("temp"), (pl.col("GWETROOT").mean() * 100).alias("hum"), pl.len().alias("days"),
    ).filter((pl.col("days") >= 300) & (pl.col("year") >= 2015))
    field_site = "greeley-riego"
    series = []
    for sid, column, title, unit in (("temperature", "temp", "Temperatura media anual", "°C"),
                                     ("humidity", "hum", "Humedad de raíz media anual", "%")):
        field = yearly.filter(pl.col("site") == field_site).select("year", column)
        region = yearly.group_by("year").agg(pl.col(column).mean().alias("region"))
        merged = field.join(region, on="year").sort("year")
        series.append(Series(
            id=f"statistics:{sid}", title=title, unit=unit, source="NASA POWER (MERRA-2)", a_label="Greeley (riego)",
            b_label="Región (promedio de 2 puntos)",
            notes=["La zona tiene solo 2 puntos de reanálisis: la 'región' es su promedio.",
                   f"El último año llega hasta {_d(daily['date'].max())}."],
            points=[SeriesPoint(label=str(int(y)), a=round(float(a), 2), b=round(float(b), 2))
                    for y, a, b in zip(merged["year"], merged[column], merged["region"], strict=True)]))
    return SeriesFile(series=series)


# ------------------------------------------------------------------------------------------------ summaries
def _humidity_summary() -> HumiditySummary:
    from fieldshift_ml.io import power

    daily = power.read_daily_all().filter(pl.col("GWETROOT").is_not_null())
    latest = daily.sort("date").group_by("site", maintain_order=True).last()
    as_of = _d(latest["date"].min())
    site = daily.filter(pl.col("site") == "greeley-riego").sort("date")
    last_doy = site["date"].max().timetuple().tm_yday
    window = site.with_columns(pl.col("date").dt.ordinal_day().alias("doy"), pl.col("date").dt.year().alias("year")).filter(
        (pl.col("doy") > last_doy - 28) & (pl.col("doy") <= last_doy))
    per_year = window.group_by("year").agg(pl.col("GWETROOT").mean().alias("m")).sort("year")
    current = float(per_year["m"][-1])
    previous = per_year["m"][:-1].to_numpy()
    percentile = float((previous <= current).mean() * 100) if len(previous) else 50.0
    return HumiditySummary(
        root=round(float(latest["GWETROOT"].mean()) * 100, 1), surface=round(float(latest["GWETTOP"].mean()) * 100, 1),
        evaporation=round(float(latest["EVPTRNS"].mean()), 2), percentile=round(percentile, 1), as_of=as_of,
        source="NASA POWER (MERRA-2): GWETROOT, GWETTOP, EVPTRNS; percentil de los últimos 28 días contra los mismos días de años anteriores (Greeley)")


def _climate_summary(run: _Run) -> ClimateSummary:
    from fieldshift_ml.io import power

    daily = power.read_daily_all().with_columns(pl.col("date").dt.year().alias("year"), pl.col("date").dt.month().alias("month"))
    as_of = _d(daily["date"].max())
    month = as_of.month % 12 + 1
    normal = daily.filter(pl.col("year").is_between(1991, 2020) & (pl.col("month") == month))
    monthly = None
    try:
        ds = datasets.get_concept("c08b").build()
        history = ds.frame.select("unique_id", "ds", "y").to_pandas()
        history["ds"] = pd.to_datetime(history["ds"])
        forecast = predict_forecast(load_bundle("c08b"), history, 6)
        monthly = [round(float(v), 1) for v in forecast.groupby("ds")["yhat"].mean().sort_index()]
    except Exception as error:  # noqa: BLE001 - the summary is still useful without the monthly rain
        run.failed("la lluvia mensual del resumen de clima", error)
    notes = ["La temperatura es climatología del próximo mes (1991–2020), no un pronóstico: no hay modelo de temperatura.",
             "La lluvia mensual es la climatología (regla c08b)."]
    return ClimateSummary(
        rain_next_day_pct=round(run.extras["rain_day_pct"], 1) if "rain_day_pct" in run.extras else None,
        rain_next_months_mm=monthly or [], heatwave_next7_pct=round(run.extras["heat_pct"], 1) if "heat_pct" in run.extras else None,
        temperature_max_c=round(float(normal["T2M_MAX"].mean()), 1), temperature_min_c=round(float(normal["T2M_MIN"].mean()), 1),
        temperature_mean_c=round(float(normal["T2M"].mean()), 1), as_of=as_of, notes=notes)


# ------------------------------------------------------------------------------------------------ tables
def _yield_table(run: _Run) -> Table:
    ds = datasets.get_concept("c01").build()
    bundle = load_bundle("c01")
    weld = ds.frame.filter(pl.col("fips") == WELD_FIPS)
    year = int(weld["year"].max())
    rows = weld.filter(pl.col("year") == year).sort("crop")
    out = []
    for rain in RAIN_BINS:
        for temp in TEMP_BINS:
            predicted = predict_tabular(bundle, apply_scenario("c01", rows, rain, temp))
            for crop, pred, observed, hist in zip(rows["crop"], predicted, rows["yield_t_ha"], rows["hist_yield"], strict=True):
                out.append({"crop": crop, "year": year, "rain_pct": rain, "temp_delta": float(temp),
                            "predicted_t_ha": round(float(pred), 3), "observed_t_ha": round(float(observed), 3),
                            "hist_yield_t_ha": round(float(hist), 3)})
    return Table(id="rendimiento", concept="c01", title=f"Rendimiento del condado de Weld, temporada {year}", unit="t/ha",
                 as_of=date(year, 12, 31),
                 notes=["Rendimiento de condado (encuesta NASS), no de parcela.",
                        "Con rain_pct=0 y temp_delta=0 es el ajuste del modelo a una temporada que ya vio al entrenar.",
                        "El R² global alto se debe sobre todo a distinguir cultivos; el de la anomalía respecto al historial del condado es ~0.48.",
                        WHATIF_NOTE,
                        "La respuesta del modelo a la lluvia es una asociación estadística entre estados, no causal: en el maíz "
                        "de riego los años más secos y soleados rinden más. Usar los escenarios solo como referencia."], rows=out)


def _roll_rotation_forward(frame: pl.DataFrame) -> pl.DataFrame:
    """Rows of the last labelled year, moved one year ahead: last year's crop becomes `prev1`."""
    seq = ["prev5", "prev4", "prev3", "prev2", "prev1"]
    moved = frame.with_columns(
        pl.col("prev4").alias("prev5"), pl.col("prev3").alias("prev4"), pl.col("prev2").alias("prev3"),
        pl.col("prev1").alias("prev2"), pl.col("crop").alias("prev1"),
        pl.when(pl.col("crop") == pl.col("prev1")).then(pl.min_horizontal(pl.col("streak") + 1, 5)).otherwise(1)
        .cast(pl.Int16).alias("streak"),
        (pl.col("year") + 1).alias("year"),
    )
    return moved.with_columns(
        pl.concat_list(seq).list.n_unique().cast(pl.Int16).alias("distinct_crops"),
        *[pl.sum_horizontal([(pl.col(c) == crop).cast(pl.Int16) for c in seq]).alias(f"n_{crop}")
          for crop in ("maiz", "trigo_invierno", "barbecho", "alfalfa")],
    ).with_columns(
        pl.concat_str([pl.col("prev1"), pl.lit("|"), pl.min_horizontal(pl.col("streak"), 3).cast(pl.String)]).alias("prev1_streak"),
    )


def _rotation_table(run: _Run) -> Table:
    ds = datasets.get_concept("c02").build()
    bundle = load_bundle("c02")
    last = ds.frame.filter(pl.col("year") == pl.col("year").max())
    rows = _roll_rotation_forward(last)
    proba = predict_tabular(bundle, rows)
    classes = bundle["classes"]
    out = []
    for prev in sorted(set(rows["prev1"].to_list())):
        mask = (rows["prev1"] == prev).to_numpy()
        if mask.sum() < 30:
            continue
        mean = proba[mask].mean(axis=0)
        for idx in np.argsort(mean)[::-1][:5]:
            out.append({"prev_crop": prev, "next_crop": classes[idx], "probability_pct": round(float(mean[idx]) * 100, 1),
                        "pixels": int(mask.sum())})
    year = int(rows["year"][0])
    return Table(id="rotacion", concept="c02", title=f"Qué se siembra el año {year} según el cultivo del año anterior",
                 unit="%", as_of=date(year, 1, 1),
                 notes=["Probabilidad media sobre los píxeles de cultivo muestreados de Weld (CDL), por cultivo del año anterior.",
                        "CDL es una clasificación de satélite: sus errores entran como ruido.",
                        "El F1 macro del modelo es ~0.31 (0.46 en las clases con al menos 1 % de los datos): "
                        "sirve para ordenar opciones, no para decidir."], rows=out)


def _cycle_table(run: _Run) -> Table:
    ds = datasets.get_concept("c07").build()
    bundle = load_bundle("c07")
    frame = ds.frame.filter(pl.col("state") == "CO") if (ds.frame["state"] == "CO").any() else ds.frame
    latest = frame.sort("year").group_by("crop", maintain_order=True).last().sort("crop")
    fitted = predict_tabular(bundle, latest)
    out = []
    for crop, state, year, observed, pred in zip(latest["crop"], latest["state"], latest["year"], latest["days"], fitted, strict=True):
        recent = frame.filter((pl.col("crop") == crop) & (pl.col("year") > year - 10))["days"]
        out.append({"crop": crop, "state": state, "year": int(year), "observed_days": int(observed),
                    "fitted_days": round(float(pred), 1), "median_days_last_10y": round(float(recent.median()), 1)})
    return Table(id="ciclo", concept="c07", title="Días de siembra a cosecha", unit="días", as_of=None,
                 notes=["Ciclo = del 50 % sembrado al 50 % cosechado (avance semanal de NASS, nivel estado).",
                        "`fitted_days` es el ajuste a una temporada que el modelo ya vio al entrenar, no un pronóstico.",
                        "Incluye el secado en campo, no solo la madurez fisiológica."], rows=out)


# ------------------------------------------------------------------------------------------------ main
def _models_info() -> list[ModelInfo]:
    out = []
    for concept, spec in DEPLOY.items():
        try:
            m = load_manifest(concept)
        except FileNotFoundError:
            continue
        metrics = m.metrics
        out.append(ModelInfo(
            concept=concept, name=m.name, role=m.role, algorithm=m.algorithm, trained_rows=m.trained_rows,
            trained_through=m.trained_through, metric=metrics.primary if metrics else "—",
            value=metrics.value if metrics else None, ci_lo=metrics.ci_lo if metrics else None,
            ci_hi=metrics.ci_hi if metrics else None, baseline=metrics.baseline if metrics else None,
            baseline_value=metrics.baseline_value if metrics else None, skill=metrics.skill if metrics else None,
            notes=[spec.reason]))
    return out


def build_export(version: str | None = None) -> Path:
    """Write `ml/deploy/exports/<version>/` and return its path. Needs the data drive and the deployed models."""
    version = version or new_version("export-")
    out = paths.exports_dir() / version
    out.mkdir(parents=True, exist_ok=True)
    run = _Run(out)

    for kind, make in (("temperature", _heat_layer), ("rain", _rain_layer), ("humidity", _humidity_layer),
                       ("drought", _drought_layer), ("vulnerability", _vulnerability_layer)):
        try:
            layer = make(run)
            run.write(f"layers/{kind}.json", layer, "layer")
            if kind != "vulnerability":  # static layer: its date is when it was built, not the data's date
                run.dates.append(layer.as_of)
        except Exception as error:  # noqa: BLE001 - one layer failing must not stop the export
            run.failed(f"la capa {kind}", error)
    for name, make, rel, kind in (("los puntos de estrés", _stress_points, "points/stress.json", "points"),
                                  ("las series de mercado", _market_series, "series/market.json", "series"),
                                  ("las estadísticas", _statistics_series, "series/statistics.json", "series")):
        try:
            run.write(rel, make(run), kind)
        except Exception as error:  # noqa: BLE001
            run.failed(name, error)

    tables = []
    for name, make in (("la tabla de rendimiento", _yield_table), ("la tabla de rotación", _rotation_table),
                       ("la tabla de ciclo", _cycle_table)):
        try:
            tables.append(make(run))
        except Exception as error:  # noqa: BLE001
            run.failed(name, error)
    if tables:
        run.write("tables.json", TablesFile(tables=tables), "tables")

    alerts = []
    if "drought_now" in run.extras:
        n, total = run.extras["drought_now"]
        alerts.append(Alert(kind="drought", title="Sequía", value=round(n / total * 100, 1), unit="%",
                            detail=f"{n} de {total} celdas de ERA5 con SPI de 3 meses bajo -1",
                            definition="Porcentaje de celdas de ~25 km de la zona en sequía en el último mes de ERA5.",
                            concept="c05a", as_of=run.extras["drought_as_of"]))
    if "stress" in run.extras:
        n, total = run.extras["stress"]
        alerts.append(Alert(kind="stress", title="Puntos de estrés", value=round(n / total * 100, 1), unit="%",
                            detail=f"{n} puntos críticos de {total:,} píxeles evaluados",
                            definition="Porcentaje de píxeles evaluados con ESI previsto en el 10 % más bajo del ESI observado en 2024–2026.",
                            concept="c03", as_of=run.extras["stress_as_of"]))
    summaries = {"alerts": alerts, "unavailable": UNAVAILABLE}
    for name, make in (("el resumen de humedad", lambda: _humidity_summary()), ("el resumen de clima", lambda: _climate_summary(run))):
        try:
            summaries["humidity" if "humedad" in name else "climate"] = make()
        except Exception as error:  # noqa: BLE001
            run.failed(name, error)
    run.write("summaries.json", Summaries(**summaries), "summaries")

    if not run.files:
        raise RuntimeError("El export quedó vacío: " + "; ".join(run.limits))
    manifest = ExportManifest(
        schema_version=SCHEMA_VERSION, version=version, generated_at=datetime.now(UTC),
        zone=Zone(name="Condado de Weld, Colorado (EE. UU.)", fips=WELD_FIPS, bbox=WELD_BBOX),
        data_as_of=max(run.dates) if run.dates else date.today(), models=_models_info(), files=run.files,
        limitations=LIMITATIONS + run.limits)
    (out / "manifest.json").write_text(manifest.model_dump_json(indent=2) + "\n", encoding="utf-8")
    from fieldshift_ml.deploy.validate import validate_export

    validate_export(out)  # what the backend will read must be valid before anyone imports it
    log.info("Export %s: %d archivos, %d avisos", version, len(run.files), len(run.limits))
    return out


__all__ = ["build_export", "math"]
