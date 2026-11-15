"""Which variables drive the best model: SHAP for tree models, permutation importance otherwise."""

from __future__ import annotations

import joblib
import numpy as np
import polars as pl
from sklearn.inspection import permutation_importance

from fieldshift_ml.config import get_settings
from fieldshift_ml.datasets.base import Dataset
from fieldshift_ml.evaluation.splits import split_dataset

TREE_MODELS = ("lightgbm", "xgboost", "catboost", "random_forest", "extra_trees")


def load_best_model(tag: str):
    """Return (name, fitted pipeline) of the best non-baseline model saved by the last evaluation."""
    files = sorted(get_settings().subdir("models").glob(f"{tag}__*.joblib"), key=lambda p: p.stat().st_mtime)
    if not files:
        raise FileNotFoundError(f"No hay modelo guardado para {tag}; corre primero la evaluación")
    return files[-1].stem.split("__", 1)[1], joblib.load(files[-1])


def importance(dataset: Dataset, model_name: str, pipeline, sample: int = 2000) -> pl.DataFrame:
    """Feature importance on the test rows, most important first."""
    settings = get_settings()
    _, test = split_dataset(dataset, None, settings.test_fraction, settings.seed)
    rng = np.random.default_rng(settings.seed)
    rows = rng.choice(test, min(sample, len(test)), replace=False)
    X = dataset.frame.select(dataset.features)[rows].to_pandas()
    for column in dataset.categorical:
        X[column] = X[column].astype("object")
    prepared = pipeline.named_steps["prep"].transform(X)
    model = pipeline.named_steps["model"]
    if model_name.split("_optuna")[0] in TREE_MODELS:
        import shap

        values = shap.TreeExplainer(model).shap_values(prepared)
        values = np.asarray(values[-1] if isinstance(values, list) else values)
        axes = tuple(i for i in range(values.ndim) if i != 1)  # keep the feature axis
        scores = np.abs(values).mean(axis=axes)
        method = "SHAP: efecto medio absoluto sobre la predicción"
    else:
        y = dataset.frame[dataset.target][rows].to_numpy()
        if dataset.task == "classification":
            y = np.searchsorted(model.classes_, y) if y.dtype.kind in "OU" else y
        result = permutation_importance(model, prepared, y, n_repeats=5, random_state=settings.seed)
        scores = result.importances_mean
        method = "Importancia por permutación (caída del puntaje)"
    return pl.DataFrame({"feature": list(prepared.columns), "importance": scores,
                         "method": method}).sort("importance", descending=True)
