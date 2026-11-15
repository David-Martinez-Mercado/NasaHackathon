"""MLflow logging. Tracking is best effort: if MLflow fails, the evaluation still finishes."""

from __future__ import annotations

import logging
import os

from fieldshift_ml.config import get_settings

log = logging.getLogger("fieldshift_ml")
_ready = False


def tracking_uri() -> str:
    return "sqlite:///" + (get_settings().work / "mlflow.db").as_posix()


def _setup() -> bool:
    global _ready
    if _ready:
        return True
    try:
        import mlflow

        os.environ.setdefault("MLFLOW_ENABLE_SYSTEM_METRICS_LOGGING", "false")
        mlflow.set_tracking_uri(tracking_uri())
        _ready = True
    except Exception as exc:  # pragma: no cover - depends on the environment
        log.warning("MLflow no disponible: %s", exc)
    return _ready


def log_run(result, fast: bool) -> None:
    if result.error or not _setup():
        return
    try:
        import mlflow

        mlflow.set_experiment(result.concept)
        with mlflow.start_run(run_name=result.model):
            mlflow.log_params({
                "model": result.model, "family": result.family, "split": result.split,
                "n_train": result.n_train, "n_test": result.n_test, "fast": fast,
                "baseline": result.is_baseline,
            })
            mlflow.log_metrics({k: v for k, v in result.metrics.items() if v == v})
            if result.skill is not None:
                mlflow.log_metric("skill", result.skill)
            mlflow.log_metric("fit_seconds", result.fit_seconds)
    except Exception as exc:  # pragma: no cover
        log.warning("No se pudo registrar %s en MLflow: %s", result.model, exc)
