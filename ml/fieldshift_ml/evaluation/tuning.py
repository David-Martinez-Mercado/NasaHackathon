"""Hyper-parameter search with Optuna. The validation fold is the last 20 % of the training rows,
so the test set is never used to choose parameters."""

from __future__ import annotations

import numpy as np
import optuna
from lightgbm import LGBMClassifier, LGBMRegressor
from sklearn import metrics as skm
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from xgboost import XGBClassifier, XGBRegressor

from fieldshift_ml.models.tabular import ModelSpec, build_pipeline

optuna.logging.set_verbosity(optuna.logging.WARNING)


def _space(name: str, trial: optuna.Trial) -> dict:
    if name == "lightgbm":
        return dict(
            n_estimators=trial.suggest_int("n_estimators", 150, 900),
            learning_rate=trial.suggest_float("learning_rate", 0.01, 0.2, log=True),
            num_leaves=trial.suggest_int("num_leaves", 7, 127, log=True),
            min_child_samples=trial.suggest_int("min_child_samples", 5, 100),
            subsample=trial.suggest_float("subsample", 0.5, 1.0), subsample_freq=1,
            colsample_bytree=trial.suggest_float("colsample_bytree", 0.4, 1.0),
            reg_lambda=trial.suggest_float("reg_lambda", 1e-3, 10, log=True),
        )
    if name == "xgboost":
        return dict(
            n_estimators=trial.suggest_int("n_estimators", 150, 900),
            learning_rate=trial.suggest_float("learning_rate", 0.01, 0.2, log=True),
            max_depth=trial.suggest_int("max_depth", 2, 10),
            min_child_weight=trial.suggest_float("min_child_weight", 1, 20, log=True),
            subsample=trial.suggest_float("subsample", 0.5, 1.0),
            colsample_bytree=trial.suggest_float("colsample_bytree", 0.4, 1.0),
            reg_lambda=trial.suggest_float("reg_lambda", 1e-3, 10, log=True),
        )
    return dict(
        n_estimators=trial.suggest_int("n_estimators", 200, 800),
        max_depth=trial.suggest_int("max_depth", 3, 30),
        min_samples_leaf=trial.suggest_int("min_samples_leaf", 1, 20),
        max_features=trial.suggest_float("max_features", 0.2, 1.0),
    )


_ESTIMATORS = {
    ("lightgbm", "regression"): lambda p, seed: LGBMRegressor(**p, random_state=seed, verbose=-1, n_jobs=-1),
    ("lightgbm", "classification"): lambda p, seed: LGBMClassifier(**p, random_state=seed, verbose=-1, n_jobs=-1),
    ("xgboost", "regression"): lambda p, seed: XGBRegressor(**p, random_state=seed, n_jobs=-1),
    ("xgboost", "classification"): lambda p, seed: XGBClassifier(**p, random_state=seed, n_jobs=-1),
    ("random_forest", "regression"): lambda p, seed: RandomForestRegressor(**p, random_state=seed, n_jobs=-1),
    ("random_forest", "classification"): lambda p, seed: RandomForestClassifier(**p, random_state=seed, n_jobs=-1),
}


def tuned_specs(task: str, X_train, y_train, numeric: list[str], categorical: list[str], n_trials: int,
                seed: int, only: set[str] | None = None) -> list[ModelSpec]:
    """Return extra specs named `<model>_optuna` with the best parameters found."""
    cut = int(len(X_train) * 0.8)
    X_fit, X_val = X_train.iloc[:cut], X_train.iloc[cut:]
    y_fit, y_val = y_train[:cut], y_train[cut:]
    if task == "classification" and np.unique(y_fit).size < np.unique(y_train).size:
        return []  # a class is absent from the inner fold; tuning would be unreliable
    specs: list[ModelSpec] = []
    for name in ("lightgbm", "xgboost", "random_forest"):
        if only and name not in only:
            continue
        make = _ESTIMATORS[(name, task)]

        def objective(trial: optuna.Trial, name=name, make=make) -> float:
            params = _space(name, trial)
            spec = ModelSpec(name, "boosting", lambda fast, s, p=params: make(p, s))
            pipeline = build_pipeline(spec, numeric, categorical, False, seed).fit(X_fit, y_fit)
            if task == "regression":
                return float(np.sqrt(skm.mean_squared_error(y_val, pipeline.predict(X_val))))
            labels = np.unique(y_train)
            return float(skm.log_loss(y_val, pipeline.predict_proba(X_val), labels=labels))

        study = optuna.create_study(direction="minimize", sampler=optuna.samplers.TPESampler(seed=seed))
        study.optimize(objective, n_trials=n_trials, show_progress_bar=False)
        best = study.best_params
        if name == "lightgbm":
            best["subsample_freq"] = 1
        family = "arboles" if name == "random_forest" else "boosting"
        specs.append(ModelSpec(f"{name}_optuna", family, lambda fast, s, p=best, make=make: make(p, s)))
    return specs
