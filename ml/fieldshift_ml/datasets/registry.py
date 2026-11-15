"""The catalogue of concepts: what each one answers, its task and how to build its table."""

from __future__ import annotations

import importlib

import polars as pl

from fieldshift_ml.config import get_settings
from fieldshift_ml.datasets.base import Concept, DataNotReady, Dataset


def _lazy(module: str, function: str):
    """Import the builder only when used, so a missing optional source never breaks the catalogue."""

    def build() -> Dataset:
        return getattr(importlib.import_module(f"fieldshift_ml.datasets.{module}"), function)()

    return build


CONCEPTS: dict[str, Concept] = {c.id: c for c in [
    Concept("c01", 1, "Rendimiento por cultivo", "¿Cuánto rendirá cada cultivo con este clima?",
            "regression", ("NASS QuickStats", "PRISM mensual", "Límites de condado (Censo)"),
            _lazy("yield_concepts", "build_yield")),
    Concept("c02", 2, "Rotación de cultivos", "¿Qué cultivo sigue según lo sembrado antes?",
            "classification", ("CDL CropScape (Weld, un raster por año)",),
            _lazy("raster_concepts", "build_rotation"), phase=2),
    Concept("c03", 3, "Estrés de vegetación", "¿Dónde sufren las plantas por agua o calor?",
            "regression", ("ECOSTRESS ESI", "NASA POWER", "CDL"), _lazy("raster_concepts", "build_stress"),
            phase=2),
    Concept("c04", 4, "Humedad del suelo", "¿Cuánta agua habrá en la zona de raíces en 4 semanas?",
            "forecast", ("NASA POWER GWETROOT",), _lazy("power_concepts", "build_soil_moisture")),
    Concept("c05a", 5, "Sequía", "¿Qué probabilidad hay de sequía en los próximos 3 meses?",
            "classification", ("ERA5 mensual 1940–2026",), _lazy("era5_concepts", "build_drought")),
    Concept("c05b", 5, "Olas de calor", "¿Habrá ola de calor en los próximos 7 días?",
            "classification", ("NASA POWER diario",), _lazy("power_concepts", "build_heatwave")),
    Concept("c06", 6, "Vulnerabilidad de parcelas", "¿Qué zonas son más frágiles (clima + suelo + historial)?",
            "unsupervised", ("SSURGO", "CDL", "PRISM normales"), _lazy("raster_concepts", "build_vulnerability"),
            phase=2),
    Concept("c07", 7, "Duración del ciclo", "¿Cuántos días de siembra a cosecha con más calor?",
            "regression", ("NASS QuickStats avance de cultivos", "NASA POWER"),
            _lazy("yield_concepts", "build_cycle_length")),
    Concept("c08a", 8, "Probabilidad de lluvia", "¿Lloverá mañana?",
            "classification", ("NASA POWER diario",), _lazy("power_concepts", "build_rain_probability")),
    Concept("c08b", 8, "Lluvia mensual", "¿Cuánta lluvia caerá en los próximos 6 meses?",
            "forecast", ("NASA POWER diario",), _lazy("power_concepts", "build_rain_monthly")),
    Concept("c09", 9, "Degradación por cultivo constante", "¿Cuánto baja la productividad con el monocultivo?",
            "regression", ("NDVI MODIS/Landsat (serie larga)", "CDL"), _lazy("pending", "build_degradation"),
            phase=3),
    Concept("c10", 10, "Tendencia de mercado", "¿Hacia dónde va el precio de cada cultivo?",
            "forecast", ("NASS QuickStats precios",), _lazy("yield_concepts", "build_prices")),
    Concept("c11", 11, "Salud de parcelas a largo plazo", "¿Mejora o empeora el verdor de la parcela?",
            "unsupervised", ("NDVI MODIS/Landsat (serie larga)",), _lazy("pending", "build_health"), phase=3),
]}


def get_concept(concept_id: str) -> Concept:
    if concept_id not in CONCEPTS:
        raise KeyError(f"Concepto desconocido: {concept_id}. Opciones: {', '.join(CONCEPTS)}")
    return CONCEPTS[concept_id]


def cache_path(concept_id: str):
    return get_settings().subdir("datasets") / f"{concept_id}.parquet"


def build(concept_id: str, save: bool = True) -> Dataset:
    """Build the modelling table of a concept and keep a Parquet copy under artifacts/datasets."""
    from fieldshift_ml.datasets.validation import validate

    dataset = get_concept(concept_id).build()
    validate(dataset)
    if save:
        dataset.frame.write_parquet(cache_path(concept_id))
    return dataset


def status() -> pl.DataFrame:
    """One row per concept: ready or which source is missing."""
    rows = []
    for concept in CONCEPTS.values():
        row = {"id": concept.id, "n": concept.number, "concepto": concept.name, "tarea": concept.task,
               "fase": concept.phase, "estado": "listo", "filas": None, "detalle": ""}
        try:
            dataset = concept.build()
            row["filas"] = dataset.n_rows
        except DataNotReady as exc:
            row["estado"] = "faltan datos"
            row["detalle"] = "; ".join(exc.missing)
        except Exception as exc:  # a bug in a builder should be visible, not fatal for the listing
            row["estado"] = "error"
            row["detalle"] = f"{type(exc).__name__}: {exc}"[:200]
        rows.append(row)
    return pl.DataFrame(rows)
