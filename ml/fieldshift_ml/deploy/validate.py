"""Checks an export directory the way the backend will read it: hashes, schema and grid sizes."""

from __future__ import annotations

import json
from pathlib import Path

from fieldshift_ml.deploy.manifest import sha256_file
from fieldshift_ml.deploy.schema import (
    SCHEMA_VERSION,
    ExportManifest,
    Layer,
    PointsFile,
    SeriesFile,
    Summaries,
    TablesFile,
)

_MODEL_OF_KIND = {"layer": Layer, "points": PointsFile, "series": SeriesFile, "summaries": Summaries,
                  "tables": TablesFile}


class ExportInvalid(ValueError):
    """The export cannot be imported; the message lists every problem found."""


def validate_export(directory: Path) -> ExportManifest:
    problems: list[str] = []
    manifest_path = directory / "manifest.json"
    if not manifest_path.exists():
        raise ExportInvalid(f"{directory}: falta manifest.json")
    manifest = ExportManifest.model_validate_json(manifest_path.read_text(encoding="utf-8"))
    if manifest.schema_version != SCHEMA_VERSION:
        problems.append(f"schema_version {manifest.schema_version} (se esperaba {SCHEMA_VERSION})")
    seen: set[str] = set()
    for entry in manifest.files:
        if entry.path in seen:
            problems.append(f"{entry.path}: aparece dos veces en el manifiesto")
        seen.add(entry.path)
        path = directory / entry.path
        if not path.resolve().is_relative_to(directory.resolve()):
            problems.append(f"{entry.path}: ruta fuera del export")
            continue
        if not path.exists():
            problems.append(f"{entry.path}: no existe")
            continue
        if sha256_file(path) != entry.sha256:
            problems.append(f"{entry.path}: el hash no coincide (archivo modificado o dañado)")
            continue
        try:
            model = _MODEL_OF_KIND[entry.kind].model_validate(json.loads(path.read_text(encoding="utf-8")))
        except Exception as error:  # noqa: BLE001 - report every file, not only the first failure
            problems.append(f"{entry.path}: {type(error).__name__}: {str(error)[:200]}")
            continue
        if isinstance(model, Layer):
            problems += _layer_problems(entry.path, model)
    if not manifest.files:
        problems.append("el manifiesto no lista archivos")
    if problems:
        raise ExportInvalid("; ".join(problems))
    return manifest


def _layer_problems(path: str, layer: Layer) -> list[str]:
    out = []
    size = layer.cols * layer.rows
    for scenario in layer.scenarios:
        if len(scenario.values) != size:
            out.append(f"{path}: un escenario trae {len(scenario.values)} valores y la rejilla es {layer.cols}x{layer.rows}")
            break
    if layer.min >= layer.max:
        out.append(f"{path}: min >= max")
    west, south, east, north = layer.bbox
    if west >= east or south >= north:
        out.append(f"{path}: bbox invertido")
    stops = [s.at for s in layer.ramp]
    if stops != sorted(stops) or len(stops) < 2:
        out.append(f"{path}: la rampa de color debe tener 2 o más paradas ordenadas")
    if len(layer.legend) < 2:
        out.append(f"{path}: la leyenda necesita al menos 2 etiquetas")
    keys = [(s.rain_pct, s.temp_delta) for s in layer.scenarios]
    if len(set(keys)) != len(keys):
        out.append(f"{path}: escenarios repetidos")
    if (0, 0) not in keys:
        out.append(f"{path}: falta el escenario base (0 % de lluvia, 0 °C)")
    return out
