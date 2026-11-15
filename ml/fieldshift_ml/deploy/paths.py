"""Where deploy artifacts live: `ml/deploy/` (override with ML_DEPLOY_DIR; tests do)."""

from __future__ import annotations

import os
from pathlib import Path

from fieldshift_ml.config import ML_ROOT


def deploy_dir() -> Path:
    path = Path(os.environ.get("ML_DEPLOY_DIR") or ML_ROOT / "deploy")
    path.mkdir(parents=True, exist_ok=True)
    return path


def models_dir() -> Path:
    path = deploy_dir() / "models"
    path.mkdir(parents=True, exist_ok=True)
    return path


def exports_dir() -> Path:
    path = deploy_dir() / "exports"
    path.mkdir(parents=True, exist_ok=True)
    return path


def model_dir(concept: str, version: str) -> Path:
    return models_dir() / concept / version


def latest_version(concept: str) -> str:
    pointer = models_dir() / concept / "LATEST"
    if not pointer.exists():
        raise FileNotFoundError(f"No hay modelo desplegado para {concept}: corre `fieldshift-ml deploy train --concept {concept}`")
    return pointer.read_text(encoding="utf-8").strip()
