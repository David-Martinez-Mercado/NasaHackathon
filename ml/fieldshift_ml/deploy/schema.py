"""Contract of the export that the backend imports (`ml/deploy/exports/<version>/`).

Everything the backend reads is described here with pydantic; `ml/deploy/export.schema.json` is generated from these
models (`fieldshift-ml deploy schema`) and the backend validates every file against it before importing, so both sides
share one definition. Bump `SCHEMA_VERSION` when a change is not backwards compatible.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SCHEMA_VERSION = 1

LayerKind = Literal["temperature", "humidity", "rain", "drought", "vulnerability"]
PointKind = Literal["stress"]
Severity = Literal["low", "medium", "high"]
Role = Literal["modelo", "regla-base", "indice"]


class _Base(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ColorStop(_Base):
    at: float = Field(ge=0, le=1)
    color: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")


class ScenarioGrid(_Base):
    """One grid of the layer for one what-if scenario. `values` is row-major from the NORTH edge; null = no data."""

    rain_pct: int = Field(ge=-100, le=100)
    temp_delta: float = Field(ge=-10, le=10)
    values: list[float | None]


class Layer(_Base):
    kind: LayerKind
    concept: str
    title: str
    variable: str
    unit: str
    min: float
    max: float
    ramp: list[ColorStop]
    legend: list[str]
    bbox: tuple[float, float, float, float]  # west, south, east, north
    cols: int = Field(gt=0)
    rows: int = Field(gt=0)
    scenarios: list[ScenarioGrid] = Field(min_length=1)
    scenario_applies: bool
    source: str
    resolution_m: int
    interpolated: bool
    as_of: date
    notes: list[str] = []


class MapPoint(_Base):
    id: str
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    kind: PointKind
    label: str | None = None
    severity: Severity | None = None
    value: float | None = None


class PointsFile(_Base):
    kind: PointKind
    concept: str
    source: str
    as_of: date
    unit: str | None = None
    notes: list[str] = []
    points: list[MapPoint]


class SeriesPoint(_Base):
    label: str
    a: float | None = None
    b: float | None = None
    forecast: bool = False


class Series(_Base):
    id: str  # e.g. "market:maiz", "statistics:temperature"
    title: str
    unit: str
    source: str
    concept: str | None = None
    a_label: str | None = None
    b_label: str | None = None
    notes: list[str] = []
    points: list[SeriesPoint]


class SeriesFile(_Base):
    series: list[Series]


class Alert(_Base):
    kind: Literal["drought", "stress"]
    title: str
    value: float
    unit: str
    detail: str
    definition: str
    concept: str
    as_of: date


class HumiditySummary(_Base):
    root: float  # %
    surface: float  # %
    evaporation: float  # MJ/m2/day (POWER EVPTRNS)
    percentile: float  # 0-100, root-zone wetness against the same week of previous years
    as_of: date
    source: str


class ClimateSummary(_Base):
    rain_next_day_pct: float | None = None  # c08a, mean of the two points
    rain_next_months_mm: list[float] = []  # c08b, 6 months
    heatwave_next7_pct: float | None = None  # c05b; null outside the heat season (May-September)
    temperature_max_c: float | None = None  # climatology of the coming month (not a forecast)
    temperature_min_c: float | None = None
    temperature_mean_c: float | None = None
    as_of: date
    notes: list[str] = []


class Summaries(_Base):
    alerts: list[Alert]
    humidity: HumiditySummary | None = None
    climate: ClimateSummary | None = None
    unavailable: list[str] = []  # what the app asks for but no model/data exists for (never invented)


class Table(_Base):
    """Small generic table for the model outputs that have no map layer (yield, rotation, cycle length)."""

    id: str  # "rendimiento", "rotacion", "ciclo"
    concept: str
    title: str
    unit: str | None = None
    as_of: date | None = None
    notes: list[str] = []
    rows: list[dict[str, str | float | int | None]]


class TablesFile(_Base):
    tables: list[Table]


class ModelInfo(_Base):
    concept: str
    name: str
    role: Role
    algorithm: str
    trained_rows: int
    trained_through: str | None = None
    metric: str
    value: float | None = None
    ci_lo: float | None = None
    ci_hi: float | None = None
    baseline: str | None = None
    baseline_value: float | None = None
    skill: float | None = None
    notes: list[str] = []


class FileEntry(_Base):
    path: str
    sha256: str
    kind: Literal["layer", "points", "series", "summaries", "tables"]


class Zone(_Base):
    name: str
    fips: str
    bbox: tuple[float, float, float, float]


class ExportManifest(_Base):
    schema_version: int
    version: str
    generated_at: datetime
    zone: Zone
    data_as_of: date
    models: list[ModelInfo]
    files: list[FileEntry]
    limitations: list[str]


# ---- one place that lists what each file contains, used by the writer and by the generated JSON Schema
FILE_MODELS: dict[str, type[BaseModel]] = {
    "manifest": ExportManifest,
    "layer": Layer,
    "points": PointsFile,
    "series": SeriesFile,
    "summaries": Summaries,
    "tables": TablesFile,
}


def json_schema() -> dict:
    """JSON Schema with one definition per file type, for the backend validator."""
    defs: dict = {}
    for name, model in FILE_MODELS.items():
        schema = model.model_json_schema(ref_template="#/$defs/{model}")
        for key, value in schema.pop("$defs", {}).items():
            defs[key] = value
        defs[f"file_{name}"] = schema
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "Field Shift export",
        "schema_version": SCHEMA_VERSION,
        "$defs": defs,
    }
