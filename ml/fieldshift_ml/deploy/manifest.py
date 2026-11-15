"""Manifest and model card written next to every deployed model artifact."""

from __future__ import annotations

import hashlib
import io
import json
import subprocess
from datetime import UTC, datetime
from importlib import metadata
from pathlib import Path

import polars as pl
from pydantic import BaseModel, ConfigDict

from fieldshift_ml.config import ML_ROOT
from fieldshift_ml.deploy.schema import Role

PACKAGES = ("scikit-learn", "xgboost", "lightgbm", "catboost", "statsforecast", "neuralforecast", "torch", "polars",
            "numpy", "pandas")


class Metrics(BaseModel):
    """Numbers of the 80/20 evaluation of this model (the deployed one is refit on 100 % of the rows)."""

    model_config = ConfigDict(extra="forbid")
    primary: str
    value: float | None = None
    ci_lo: float | None = None
    ci_hi: float | None = None
    skill: float | None = None
    baseline: str | None = None
    baseline_value: float | None = None
    split: str | None = None
    evaluated_at: str | None = None
    source: str | None = None  # which results file these came from


class Artifact(BaseModel):
    model_config = ConfigDict(extra="forbid")
    path: str  # relative to the model directory
    sha256: str
    size_bytes: int


class ModelManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    concept: str
    version: str
    name: str
    role: Role
    algorithm: str
    reason: str
    kind: str
    task: str
    target: str | None = None
    features: list[str]
    categorical: list[str] = []
    classes: list[str] | None = None
    hyperparameters: dict[str, str | int | float | bool | None] = {}
    trained_rows: int
    trained_through: str | None = None
    data_sha256: str
    trained_at: datetime
    seconds: float
    git_commit: str | None = None
    packages: dict[str, str] = {}
    metrics: Metrics | None = None
    artifact: Artifact | None = None
    scenario_applies: bool = False
    limitations: list[str] = []
    notes: list[str] = []


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def frame_sha256(frame: pl.DataFrame) -> str:
    """Fingerprint of the training table (content, not file layout)."""
    buffer = io.BytesIO()
    frame.write_parquet(buffer)
    return sha256_bytes(buffer.getvalue())


def package_versions() -> dict[str, str]:
    found = {}
    for name in PACKAGES:
        try:
            found[name] = metadata.version(name)
        except metadata.PackageNotFoundError:
            continue
    return found


def git_commit() -> str | None:
    try:
        out = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ML_ROOT, capture_output=True, text=True,
                             timeout=10, check=False)
        return out.stdout.strip() or None
    except (OSError, subprocess.SubprocessError):
        return None


def new_version(prefix: str = "") -> str:
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M")
    commit = git_commit()
    return f"{prefix}{stamp}" + (f"-{commit}" if commit else "")


def evaluation_metrics(concept: str, model_name: str) -> Metrics | None:
    """Pick the saved evaluation row of the deployed algorithm (CSV written by `fieldshift-ml eval`)."""
    from fieldshift_ml.evaluation.report import load_meta, load_results

    try:
        table = load_results(concept)
        meta = load_meta(concept)
    except FileNotFoundError:
        return None
    primary = meta["primary"]
    rows = [r for r in table.iter_rows(named=True) if not r.get("error")]
    row = next((r for r in rows if r["model"] == model_name), None)
    if row is None:
        return None
    baselines = [r for r in rows if r["is_baseline"] and r.get(primary) is not None]
    higher = primary not in ("mase", "rmse", "mae")
    best = (max if higher else min)(baselines, key=lambda r: r[primary], default=None)
    return Metrics(
        primary=primary, value=row.get(primary), ci_lo=row.get(f"{primary}_lo"), ci_hi=row.get(f"{primary}_hi"),
        skill=row.get("skill"), baseline=best["model"] if best else None,
        baseline_value=best[primary] if best else None, split=meta.get("split"), evaluated_at=meta.get("run_at"),
        source=f"results/{concept}.csv",
    )


def write_model_card(manifest: ModelManifest, directory: Path) -> Path:
    m = manifest.metrics
    lines = [
        f"# {manifest.concept} · {manifest.name}",
        "",
        f"- **Algoritmo:** {manifest.algorithm} ({'regla simple, no aprendida' if manifest.role == 'regla-base' else manifest.role})",
        f"- **Versión:** `{manifest.version}` · entrenado el {manifest.trained_at:%Y-%m-%d} con {manifest.trained_rows:,} filas"
        + (f" hasta {manifest.trained_through}" if manifest.trained_through else ""),
        f"- **Por qué este:** {manifest.reason}",
        f"- **Variables:** {', '.join(manifest.features) or '—'}",
    ]
    if m and m.value is not None:
        interval = f" [{m.ci_lo:.3f}, {m.ci_hi:.3f}]" if m.ci_lo is not None and m.ci_hi is not None else ""
        lines.append(f"- **Evaluación 80/20** ({m.split or 'time'}): {m.primary} = {m.value:.3f}{interval}"
                     + (f"; mejor base `{m.baseline}` = {m.baseline_value:.3f}" if m.baseline_value is not None else "")
                     + (f"; skill = {m.skill:+.3f}" if m.skill is not None else ""))
    else:
        lines.append("- **Evaluación 80/20:** no hay resultados guardados para este modelo.")
    lines += [
        "",
        "## Límites",
        *[f"- {x}" for x in manifest.limitations],
        "",
        "El modelo desplegado se reentrena con el 100 % de las filas: sus métricas son las de la evaluación 80/20, "
        "no se pueden recalcular sobre datos que ya vio.",
    ]
    path = directory / "model_card.md"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def write_manifest(manifest: ModelManifest, directory: Path) -> Path:
    path = directory / "manifest.json"
    path.write_text(json.dumps(json.loads(manifest.model_dump_json()), indent=2, ensure_ascii=False) + "\n",
                    encoding="utf-8")
    return path


def read_manifest(directory: Path) -> ModelManifest:
    return ModelManifest.model_validate_json((directory / "manifest.json").read_text(encoding="utf-8"))
