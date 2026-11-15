"""Final training of the deployed models: same algorithm as evaluated, fitted on 100 % of the rows."""

from __future__ import annotations

import logging
import time
from datetime import UTC, datetime

import joblib
import numpy as np
import pandas as pd
from sklearn.preprocessing import LabelEncoder

from fieldshift_ml.config import get_settings
from fieldshift_ml.datasets import registry as datasets
from fieldshift_ml.datasets.base import Dataset
from fieldshift_ml.deploy import paths
from fieldshift_ml.deploy.manifest import (
    Artifact,
    ModelManifest,
    evaluation_metrics,
    frame_sha256,
    git_commit,
    new_version,
    package_versions,
    sha256_file,
    write_manifest,
    write_model_card,
)
from fieldshift_ml.deploy.registry import DeploySpec, get_spec
from fieldshift_ml.models.forecast import DS, ID, Y, forecast_models
from fieldshift_ml.models.tabular import CLASSIFIERS, REGRESSORS, ModelSpec, build_pipeline, reference_spec

log = logging.getLogger("fieldshift_ml")

GENERAL_LIMITS = [
    "Entrenado con datos de Weld, Colorado (EE. UU.); no está validado en otras zonas (por ejemplo, Durango).",
    "Las variables de clima son reanálisis (NASA POWER, ERA5) de ~25–50 km, no mediciones en la parcela.",
    "Apoya la decisión del agricultor y del técnico; no la reemplaza.",
]


def _simple(params: dict) -> dict:
    return {k: v for k, v in params.items() if isinstance(v, str | int | float | bool) or v is None}


def tabular_spec(spec: DeploySpec, ds: Dataset) -> ModelSpec:
    """The registry entry of the deployed algorithm (a baseline rule is built from the dataset's reference column)."""
    if spec.model.startswith("base_"):
        if not ds.baseline_feature:
            raise ValueError(f"{ds.concept} no declara columna de referencia para {spec.model}")
        return reference_spec(ds.baseline_feature, ds.task, ds.baseline_name)
    pool = REGRESSORS if ds.task == "regression" else CLASSIFIERS
    found = next((s for s in pool if s.name == spec.model), None)
    if found is None:
        raise KeyError(f"{spec.model} no existe entre los modelos de {ds.task}")
    return found


def _train_tabular(spec: DeploySpec, ds: Dataset, seed: int) -> tuple[dict, dict]:
    frame = ds.frame
    numeric = [c for c in ds.features if c not in ds.categorical]
    X = frame.select(ds.features).to_pandas()
    for column in ds.categorical:
        X[column] = X[column].astype("object")
    raw = frame.get_column(ds.target).to_numpy()
    classes = None
    if ds.task == "classification":
        encoder = LabelEncoder().fit(raw)
        y = encoder.transform(raw)
        classes = [str(c) for c in encoder.classes_]
    else:
        y = raw.astype(float)
    mspec = tabular_spec(spec, ds)
    pipeline = build_pipeline(mspec, numeric, ds.categorical, spec.fast, seed)
    pipeline.fit(X, y)
    params = _simple(pipeline.named_steps["model"].get_params()) if hasattr(pipeline.named_steps["model"], "get_params") else {}
    bundle = {"kind": "tabular", "task": ds.task, "pipeline": pipeline, "features": list(ds.features),
              "categorical": list(ds.categorical), "classes": classes, "target": ds.target}
    return bundle, {"classes": classes, "hyperparameters": params, "trained_rows": len(y)}


def _train_forecast(spec: DeploySpec, ds: Dataset, seed: int) -> tuple[dict, dict]:
    frame = ds.frame.select(ID, DS, Y).to_pandas()
    frame[DS] = pd.to_datetime(frame[DS])
    candidates = forecast_models(ds.freq, int(ds.season_length), int(ds.horizon), spec.fast, seed, ds.exog_cols)
    model = next((m for m in candidates if m.name == spec.model), None)
    if model is None:
        raise KeyError(f"{spec.model} no existe entre los pronosticadores")
    model.fit(frame)
    bundle = {"kind": "forecast", "task": "forecast", "model": model, "freq": ds.freq, "horizon": int(ds.horizon),
              "season_length": int(ds.season_length), "series": sorted(frame[ID].unique().tolist())}
    return bundle, {"classes": None, "hyperparameters": {"freq": ds.freq, "horizon": int(ds.horizon),
                                                         "season_length": int(ds.season_length)},
                    "trained_rows": len(frame)}


def _train_index(spec: DeploySpec, ds: Dataset) -> tuple[dict, dict]:
    from fieldshift_ml.datasets.vulnerability import RISK_DIRECTION

    X = ds.frame.select(ds.features).to_numpy().astype(float)
    mean, scale = X.mean(axis=0), X.std(axis=0)
    scale[scale == 0] = 1.0
    signs = np.array([RISK_DIRECTION[f] for f in ds.features], dtype=float)
    scores = (((X - mean) / scale) * signs).mean(axis=1)
    bundle = {"kind": "index", "task": "unsupervised", "features": list(ds.features), "mean": mean, "scale": scale,
              "signs": signs, "train_scores": np.sort(scores)}
    return bundle, {"classes": None, "hyperparameters": {"n_features": len(ds.features)}, "trained_rows": len(X)}


def train(concept: str, version: str | None = None, seed: int | None = None) -> ModelManifest:
    """Fit the deployed model of `concept` on all its rows and write `ml/deploy/models/<concept>/<version>/`."""
    spec = get_spec(concept)
    seed = get_settings().seed if seed is None else seed
    version = version or new_version()
    ds = datasets.get_concept(concept).build()
    start = time.perf_counter()
    if spec.kind == "tabular":
        bundle, info = _train_tabular(spec, ds, seed)
    elif spec.kind == "forecast":
        bundle, info = _train_forecast(spec, ds, seed)
    else:
        bundle, info = _train_index(spec, ds)
    seconds = round(time.perf_counter() - start, 2)

    directory = paths.model_dir(concept, version)
    directory.mkdir(parents=True, exist_ok=True)
    bundle.update({"concept": concept, "version": version, "model_name": spec.model})
    target = directory / "model.joblib"
    joblib.dump(bundle, target, compress=3)

    time_col = ds.time_col if ds.time_col in ds.frame.columns else ("ds" if ds.task == "forecast" else None)
    through = ds.frame.get_column(time_col).max() if time_col else None
    manifest = ModelManifest(
        concept=concept, version=version, name=spec.model, role=spec.role, algorithm=spec.algorithm, reason=spec.reason,
        kind=spec.kind, task=ds.task, target=ds.target, features=list(ds.features) if ds.features else ["unique_id", "ds", "y"],
        categorical=list(ds.categorical), classes=info["classes"], hyperparameters=info["hyperparameters"],
        trained_rows=info["trained_rows"], trained_through=str(through) if through is not None else None,
        data_sha256=frame_sha256(ds.frame), trained_at=datetime.now(UTC), seconds=seconds,
        git_commit=git_commit(), packages=package_versions(), metrics=evaluation_metrics(concept, spec.model),
        artifact=Artifact(path="model.joblib", sha256=sha256_file(target), size_bytes=target.stat().st_size),
        scenario_applies=spec.scenario_applies, limitations=GENERAL_LIMITS, notes=list(ds.notes),
    )
    write_manifest(manifest, directory)
    write_model_card(manifest, directory)
    (directory.parent / "LATEST").write_text(version + "\n", encoding="utf-8")
    log.info("%s | %s v%s: %d filas, %.1f MB, %.1fs", concept, spec.model, version, manifest.trained_rows,
             manifest.artifact.size_bytes / 1e6, seconds)
    return manifest


def train_many(concepts: list[str] | None = None, version: str | None = None) -> list[ModelManifest]:
    """One shared version for the whole batch, one concept at a time (RAM)."""
    from fieldshift_ml.deploy.registry import DEPLOY

    version = version or new_version()
    out = []
    for concept in concepts or list(DEPLOY):
        out.append(train(concept, version))
    return out
