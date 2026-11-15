"""Concepts built from USDA NASS QuickStats: yield (c01), cycle length (c07) and prices (c10)."""

from __future__ import annotations

from datetime import date, timedelta

import polars as pl

from fieldshift_ml.config import WELD_FIPS, get_settings
from fieldshift_ml.datasets.base import DataNotReady, Dataset
from fieldshift_ml.io import prism, quickstats

# series -> (crop label, factor to t/ha). Bushel weights: corn/sorghum 25.4 kg, wheat/soy 27.2, barley 21.8, oats 14.5.
YIELD_SERIES = {
    "CORN, GRAIN - YIELD, MEASURED IN BU / ACRE": ("maiz_grano", 0.06277),
    "WHEAT, WINTER - YIELD, MEASURED IN BU / ACRE": ("trigo_invierno", 0.06725),
    "SORGHUM, GRAIN - YIELD, MEASURED IN BU / ACRE": ("sorgo_grano", 0.06277),
    "BARLEY - YIELD, MEASURED IN BU / ACRE": ("cebada", 0.05380),
    "OATS - YIELD, MEASURED IN BU / ACRE": ("avena", 0.03587),
    "SOYBEANS - YIELD, MEASURED IN BU / ACRE": ("soya", 0.06725),
    "HAY, ALFALFA - YIELD, MEASURED IN TONS / ACRE": ("alfalfa", 2.2417),
    "CORN, SILAGE - YIELD, MEASURED IN TONS / ACRE": ("maiz_ensilaje", 2.2417),
}


def _train_limit(years: pl.Series) -> int:
    years = years.unique().sort()
    n_test = max(1, int(round(years.len() * get_settings().test_fraction)))
    return int(years[years.len() - n_test - 1])


def _season_climate() -> pl.DataFrame:
    """Growing-season climate per county and year from PRISM monthly means."""
    try:
        monthly = prism.county_monthly()
    except FileNotFoundError as exc:
        raise DataNotReady("c01", [str(exc)]) from exc
    days = pl.date("year", "month", 1).dt.days_in_month()
    monthly = monthly.with_columns(
        ((pl.col("tmean") - 10).clip(0, 20) * days).alias("gdd"),
        # the water year starts in October: Oct–Dec count for the next harvest
        pl.when(pl.col("month") >= 10).then(pl.col("year") + 1).otherwise(pl.col("year")).alias("harvest_year"),
    )

    def total(column: str, months: tuple[int, ...], name: str, how: str = "sum") -> pl.Expr:
        expr = pl.col(column).filter(pl.col("month").is_in(months))
        return (expr.sum() if how == "sum" else expr.mean()).alias(name)

    return monthly.group_by("fips", pl.col("harvest_year").alias("year")).agg(
        total("ppt", (10, 11, 12, 1, 2, 3), "ppt_preseason"),
        total("ppt", (4, 5), "ppt_apr_may"), total("ppt", (6, 7), "ppt_jun_jul"),
        total("ppt", (8, 9), "ppt_aug_sep"), total("ppt", (4, 5, 6, 7, 8, 9), "ppt_season"),
        total("tmean", (4, 5, 6, 7, 8, 9), "tmean_season", "mean"),
        total("tmax", (7, 8), "tmax_jul_aug", "mean"), total("tmin", (4, 5), "tmin_apr_may", "mean"),
        total("tmean", (12, 1, 2), "tmean_winter", "mean"),
        total("gdd", (4, 5, 6, 7, 8, 9), "gdd_season"),
        pl.col("lat").first(), pl.col("lon").first(), pl.col("state").first(), pl.len().alias("_months"),
    ).filter(pl.col("_months") == 12).drop("_months")


def build_yield(window_years: int | None = None) -> Dataset:
    """c01 — rendimiento (t/ha) por condado, año y cultivo.

    `window_years` (solo para el estudio de ventanas): `hist_yield` usa únicamente los últimos N años de entrenamiento.
    """
    yields = quickstats.county_yields().filter(pl.col("series").is_in(list(YIELD_SERIES)))
    mapping = pl.DataFrame(
        {"series": list(YIELD_SERIES), "crop": [v[0] for v in YIELD_SERIES.values()],
         "factor": [v[1] for v in YIELD_SERIES.values()]}
    )
    frame = (
        yields.join(mapping, on="series").with_columns((pl.col("yield") * pl.col("factor")).alias("yield_t_ha"))
        .join(_season_climate(), on=["fips", "year"], how="inner")
    )
    limit = _train_limit(frame.get_column("year"))
    # reference a farmer already has: the county's own average for that crop (training years only)
    first_year = limit - window_years if window_years else -1  # exclusive lower bound of the reference years
    in_window = (pl.col("year") <= limit) & (pl.col("year") > first_year)
    history = (
        frame.filter(in_window).group_by("fips", "crop")
        .agg(pl.col("yield_t_ha").mean().alias("hist_yield"), pl.len().alias("hist_years"))
    )
    crop_mean = frame.filter(in_window).group_by("crop").agg(
        pl.col("yield_t_ha").mean().alias("_crop_mean"))
    frame = (
        frame.join(history, on=["fips", "crop"], how="left").join(crop_mean, on="crop", how="left")
        .with_columns(pl.col("hist_yield").fill_null(pl.col("_crop_mean")), pl.col("hist_years").fill_null(0),
                      (pl.col("fips") == WELD_FIPS).alias("is_weld"))
        .filter(pl.col("_crop_mean").is_not_null())
    )
    features = ["year", "ppt_preseason", "ppt_apr_may", "ppt_jun_jul", "ppt_aug_sep", "ppt_season",
                "tmean_season", "tmax_jul_aug", "tmin_apr_may", "tmean_winter", "gdd_season", "lat", "lon",
                "hist_yield", "hist_years", "crop", "state"]
    return Dataset(
        concept="c01", task="regression", frame=frame.sort("year", "fips", "crop"), target="yield_t_ha",
        features=features, categorical=["crop", "state"], split="time", time_col="year",
        baseline_feature="hist_yield",
        notes=["Etiquetas: rendimiento de condado de NASS QuickStats (encuesta), 8 estados alrededor de Colorado.",
               "Clima: PRISM mensual 4 km promediado por condado. Weld solo aporta ~25 filas por cultivo.",
               f"`hist_yield` = promedio del condado y cultivo con años <= {limit}; es la referencia a superar.",
               "El R² global mezcla cultivos con rendimientos muy distintos; mirar también el RMSE y el skill."],
    )


# ---------------------------------------------------------------------------- c07
# crop -> (planted series, harvested series, GDD base °C)
CYCLE_CROPS = {
    "maiz": ("CORN - PROGRESS, MEASURED IN PCT PLANTED", "CORN, GRAIN - PROGRESS, MEASURED IN PCT HARVESTED", 10.0),
    "sorgo": ("SORGHUM - PROGRESS, MEASURED IN PCT PLANTED",
              "SORGHUM, GRAIN - PROGRESS, MEASURED IN PCT HARVESTED", 10.0),
    "trigo_invierno": ("WHEAT, WINTER - PROGRESS, MEASURED IN PCT PLANTED",
                       "WHEAT, WINTER - PROGRESS, MEASURED IN PCT HARVESTED", 0.0),
    "girasol": ("SUNFLOWER - PROGRESS, MEASURED IN PCT PLANTED",
                "SUNFLOWER - PROGRESS, MEASURED IN PCT HARVESTED", 7.0),
    "cebada": ("BARLEY - PROGRESS, MEASURED IN PCT PLANTED", "BARLEY - PROGRESS, MEASURED IN PCT HARVESTED", 0.0),
    "remolacha": ("SUGARBEETS - PROGRESS, MEASURED IN PCT PLANTED",
                  "SUGARBEETS - PROGRESS, MEASURED IN PCT HARVESTED", 3.0),
    "soya": ("SOYBEANS - PROGRESS, MEASURED IN PCT PLANTED", "SOYBEANS - PROGRESS, MEASURED IN PCT HARVESTED", 10.0),
}


def _half_date(weeks: list[date], pct: list[float]) -> date | None:
    """Date when progress crosses 50 %, interpolated between weekly reports."""
    for i in range(1, len(pct)):
        if pct[i - 1] < 50 <= pct[i]:
            share = (50 - pct[i - 1]) / (pct[i] - pct[i - 1])
            return weeks[i - 1] + timedelta(days=round(share * (weeks[i] - weeks[i - 1]).days))
    return None


def _state_monthly_temperature() -> dict[tuple[str, int, int], float]:
    monthly = prism.county_monthly().group_by("state", "year", "month").agg(pl.col("tmean").mean())
    return {(s, y, m): t for s, y, m, t in monthly.iter_rows()}


def _gdd_between(temps: dict, state: str, start: date, end: date, base: float) -> float | None:
    total, day = 0.0, start
    while day < end:
        temp = temps.get((state, day.year, day.month))
        if temp is None:
            return None
        total += max(temp - base, 0.0)
        day += timedelta(days=1)
    return total


def _days_to_reach(temps: dict, state: str, start: date, base: float, needed: float) -> int | None:
    total, day = 0.0, start
    for _ in range(500):
        temp = temps.get((state, day.year, day.month))
        if temp is None:
            return None
        total += max(temp - base, 0.0)
        day += timedelta(days=1)
        if total >= needed:
            return (day - start).days
    return None


def build_cycle_length(window_years: int | None = None) -> Dataset:
    """c07 — días de siembra a cosecha (50 % sembrado -> 50 % cosechado) por estado, año y cultivo.

    `window_years` (solo para el estudio de ventanas): los GDD de referencia usan solo los últimos N años de train.
    """
    try:
        temps = _state_monthly_temperature()
    except FileNotFoundError as exc:
        raise DataNotReady("c07", [str(exc)]) from exc
    rows = []
    for state in sorted({key[0] for key in temps}):
        progress = quickstats.crop_progress(state)
        for crop, (planted, harvested, base) in CYCLE_CROPS.items():
            plant = progress.filter(pl.col("series") == planted)
            harvest = progress.filter(pl.col("series") == harvested)
            for year in harvest.get_column("year").unique().sort():
                h = harvest.filter(pl.col("year") == year)
                h_date = _half_date(h["week_ending"].to_list(), h["pct"].to_list())
                p = plant.filter(pl.col("year") == year)
                p_date = _half_date(p["week_ending"].to_list(), p["pct"].to_list())
                if h_date is None or p_date is None or not 40 <= (h_date - p_date).days <= 400:
                    continue
                gdd = _gdd_between(temps, state, p_date, h_date, base)
                if gdd is None:
                    continue
                after = [temps.get((state, (p_date + timedelta(days=30 * k)).year,
                                    (p_date + timedelta(days=30 * k)).month)) for k in range(5)]
                rows.append({
                    "state": state, "crop": crop, "year": int(year), "gdd_base": base,
                    "plant_doy": p_date.timetuple().tm_yday, "plant_date": p_date,
                    "days": (h_date - p_date).days, "_gdd": gdd,
                    **{f"temp_month_{k}": after[k] for k in range(5)},
                })
    if not rows:
        raise DataNotReady("c07", ["avance de cultivos (PROGRESS) de QuickStats"])
    frame = pl.DataFrame(rows)
    limit = _train_limit(frame.get_column("year"))
    first_year = limit - window_years if window_years else -1
    needed = (
        frame.filter((pl.col("year") <= limit) & (pl.col("year") > first_year))
        .group_by("crop").agg(pl.col("_gdd").median().alias("gdd_needed"))
    )
    frame = frame.join(needed, on="crop", how="inner")
    formula = [
        _days_to_reach(temps, r["state"], r["plant_date"], r["gdd_base"], r["gdd_needed"])
        for r in frame.iter_rows(named=True)
    ]
    frame = frame.with_columns(
        pl.Series("gdd_formula_days", formula, dtype=pl.Float64),
        pl.mean_horizontal([f"temp_month_{k}" for k in range(5)]).alias("temp_season"),
    ).filter(pl.col("gdd_formula_days").is_not_null())
    # reference a technician already uses: the usual length of that crop in that state (training years)
    train = frame.filter(pl.col("year") <= limit)
    usual = train.group_by("crop", "state").agg(pl.col("days").mean().alias("usual_days"))
    by_crop = train.group_by("crop").agg(pl.col("days").mean().alias("_crop_days"))
    frame = (
        frame.join(usual, on=["crop", "state"], how="left").join(by_crop, on="crop", how="inner")
        .with_columns(pl.col("usual_days").fill_null(pl.col("_crop_days")))
    )
    features = ["plant_doy", "temp_month_0", "temp_month_1", "temp_month_2", "temp_month_3", "temp_month_4",
                "temp_season", "gdd_formula_days", "usual_days", "year", "crop", "state"]
    return Dataset(
        concept="c07", task="regression", frame=frame.sort("year", "state", "crop"), target="days",
        features=features, categorical=["crop", "state"], split="time", time_col="year",
        baseline_feature="usual_days",
        notes=["Etiqueta: días entre 50 % sembrado y 50 % cosechado (avance semanal de NASS, nivel estado).",
               "Temperatura: PRISM mensual promediado por estado.",
               f"`gdd_formula_days` = fórmula de grados-día (GDD necesarios: mediana por cultivo, años <= {limit}).",
               "Incluye el secado en campo antes de cosechar, no solo la madurez fisiológica.",
               "`usual_days` = duración habitual del cultivo en ese estado (años de entrenamiento); es la "
               "referencia a superar. El R² global es alto porque los cultivos duran muy distinto entre sí."],
    )


# ---------------------------------------------------------------------------- c10
PRICE_SERIES = {
    "CORN, GRAIN - PRICE RECEIVED, MEASURED IN $ / BU": "maiz",
    "WHEAT - PRICE RECEIVED, MEASURED IN $ / BU": "trigo",
    "SORGHUM, GRAIN - PRICE RECEIVED, MEASURED IN $ / CWT": "sorgo",
    "BARLEY - PRICE RECEIVED, MEASURED IN $ / BU": "cebada",
    "OATS - PRICE RECEIVED, MEASURED IN $ / BU": "avena",
    "HAY, ALFALFA - PRICE RECEIVED, MEASURED IN $ / TON": "alfalfa",
    "SOYBEANS - PRICE RECEIVED, MEASURED IN $ / BU": "soya",
}


def build_prices(start_year: int = 1990) -> Dataset:
    """c10 — precio mensual recibido por el productor (índice, 100 = promedio del periodo de entrenamiento)."""
    prices = quickstats.monthly_prices("NATIONAL").filter(
        pl.col("series").is_in(list(PRICE_SERIES)) & (pl.col("year") >= start_year)
    ).with_columns(pl.col("series").replace_strict(PRICE_SERIES).alias("unique_id"))
    last_common = prices.group_by("unique_id").agg(pl.col("date").max()).get_column("date").min()
    prices = prices.filter(pl.col("date") <= last_common)
    # complete monthly grid; short gaps are interpolated so every series is regular
    grid = pl.DataFrame({"ds": pl.date_range(date(start_year, 1, 1), last_common, "1mo", eager=True)})
    parts = []
    for uid, group in prices.group_by("unique_id", maintain_order=True):
        series = grid.join(group.select(pl.col("date").alias("ds"), "price"), on="ds", how="left")
        missing = series.get_column("price").null_count()
        if missing > 6:
            continue
        parts.append(series.with_columns(pl.col("price").interpolate().forward_fill().backward_fill(),
                                         pl.lit(uid[0]).alias("unique_id")))
    if not parts:
        raise DataNotReady("c10", ["precios mensuales (PRICE RECEIVED) de QuickStats"])
    frame = pl.concat(parts)
    dates = frame.get_column("ds").unique().sort()
    cutoff = dates[int(round(dates.len() * (1 - get_settings().test_fraction)))]
    base = frame.filter(pl.col("ds") < cutoff).group_by("unique_id").agg(pl.col("price").mean().alias("_base"))
    frame = frame.join(base, on="unique_id").with_columns(
        (pl.col("price") / pl.col("_base") * 100).alias("y")
    ).select("unique_id", "ds", "y", "price").sort("unique_id", "ds")
    return Dataset(
        concept="c10", task="forecast", frame=frame, target="y", freq="MS", horizon=6, season_length=12,
        notes=["Fuente: NASS QuickStats, precio mensual recibido por el productor (nacional, EE. UU.).",
               "Cada serie va como índice (100 = promedio del periodo de entrenamiento) para poder compararlas.",
               "Horizonte: 6 meses. Son precios nominales, sin ajustar por inflación.",
               "El precio entra al proyecto como dato; este pronóstico es solo exploratorio."],
    )
