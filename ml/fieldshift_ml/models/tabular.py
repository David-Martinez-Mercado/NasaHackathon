"""Registry of tabular models (regression and classification).

Every entry builds a scikit-learn pipeline: imputation, encoding and, for models that need it, scaling.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np
from catboost import CatBoostClassifier, CatBoostRegressor
from lightgbm import LGBMClassifier, LGBMRegressor
from sklearn.base import BaseEstimator, ClassifierMixin, RegressorMixin
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier, DummyRegressor
from sklearn.ensemble import (
    ExtraTreesClassifier,
    ExtraTreesRegressor,
    HistGradientBoostingClassifier,
    HistGradientBoostingRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.gaussian_process import GaussianProcessRegressor
from sklearn.gaussian_process.kernels import RBF, ConstantKernel, WhiteKernel
from sklearn.impute import SimpleImputer
from sklearn.linear_model import ElasticNetCV, LinearRegression, LogisticRegression, RidgeCV
from sklearn.naive_bayes import GaussianNB
from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor
from sklearn.neural_network import MLPClassifier, MLPRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, OrdinalEncoder, StandardScaler
from sklearn.svm import SVC, SVR
from xgboost import XGBClassifier, XGBRegressor


@dataclass(frozen=True)
class ModelSpec:
    name: str
    family: str
    factory: Callable[[bool, int], object]  # (fast, seed) -> estimator
    scale: bool = False  # standardize numeric columns and one-hot the categorical ones
    max_rows: int | None = None  # skip above this training size (cost grows too fast)
    baseline: bool = False
    slow: bool = False  # left out with --fast


class ColumnBaseline(RegressorMixin, BaseEstimator):
    """Predicts with a column that already holds a domain reference (a formula, a historical mean)."""

    def __init__(self, column: str):
        self.column = column

    def fit(self, X, y=None):
        self.fallback_ = float(np.nanmean(y)) if y is not None else 0.0
        return self

    def predict(self, X):
        values = np.asarray(X[self.column], dtype=float)
        return np.where(np.isfinite(values), values, self.fallback_)


class ConditionalFrequency(ClassifierMixin, BaseEstimator):
    """First-order Markov chain: the class distribution observed in training for each value of one column."""

    def __init__(self, column: str):
        self.column = column

    def fit(self, X, y):
        self.classes_ = np.unique(y)
        index = np.searchsorted(self.classes_, y)
        self.prior_ = np.bincount(index, minlength=len(self.classes_)) / len(index)
        keys = np.asarray(X[self.column])
        self.table_ = {}
        for key in np.unique(keys):
            counts = np.bincount(index[keys == key], minlength=len(self.classes_)).astype(float) + 0.5
            self.table_[key] = counts / counts.sum()
        return self

    def predict_proba(self, X):
        return np.vstack([self.table_.get(key, self.prior_) for key in np.asarray(X[self.column])])

    def predict(self, X):
        return self.classes_[self.predict_proba(X).argmax(axis=1)]


def reference_spec(column: str, task: str = "regression", name: str | None = None) -> ModelSpec:
    """Baseline built from one column that already holds the reference (a formula, the previous state...).

    `name` lets a concept label it after what the column means (`base_persistencia`, `base_markov2`...).
    """
    if task == "classification":
        return ModelSpec(name or "base_markov", "base", lambda fast, seed: ConditionalFrequency(column),
                         baseline=True)
    return ModelSpec(name or "base_referencia", "base", lambda fast, seed: ColumnBaseline(column), baseline=True)


def sequence_specs(sequence_cols: list[str]) -> list[ModelSpec]:
    """LSTM and GRU over an ordered categorical sequence (PyTorch, GPU when available)."""
    from fieldshift_ml.models.deep import SequenceClassifier

    def make(cell: str):
        return lambda fast, seed: SequenceClassifier(sequence_cols, cell=cell, epochs=3 if fast else 10, seed=seed)

    return [ModelSpec("lstm_secuencia", "red_neuronal", make("lstm")),
            ModelSpec("gru_secuencia", "red_neuronal", make("gru"))]


def build_pipeline(spec: ModelSpec, numeric: list[str], categorical: list[str], fast: bool, seed: int) -> Pipeline:
    if spec.scale:
        numeric_steps = Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler())])
        categorical_steps = Pipeline([
            ("impute", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False, min_frequency=5)),
        ])
    else:
        numeric_steps = SimpleImputer(strategy="median")
        categorical_steps = OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1,
                                           encoded_missing_value=-1)
    transformers = [("num", numeric_steps, numeric)]
    if categorical:
        transformers.append(("cat", categorical_steps, categorical))
    preprocess = ColumnTransformer(transformers, verbose_feature_names_out=False)
    preprocess.set_output(transform="pandas")
    return Pipeline([("prep", preprocess), ("model", spec.factory(fast, seed))])


def _trees(fast: bool) -> int:
    return 120 if fast else 500


REGRESSORS: list[ModelSpec] = [
    ModelSpec("base_media", "base", lambda fast, seed: DummyRegressor(strategy="mean"), baseline=True),
    ModelSpec("lineal", "lineal", lambda fast, seed: LinearRegression(), scale=True),
    ModelSpec("ridge", "lineal", lambda fast, seed: RidgeCV(alphas=np.logspace(-3, 3, 13)), scale=True),
    ModelSpec("elasticnet", "lineal",
              lambda fast, seed: ElasticNetCV(l1_ratio=[0.1, 0.5, 0.9], cv=5, max_iter=5000, random_state=seed),
              scale=True),
    ModelSpec("knn", "vecinos", lambda fast, seed: KNeighborsRegressor(n_neighbors=15, weights="distance"),
              scale=True, max_rows=200_000),
    ModelSpec("svr", "svm", lambda fast, seed: SVR(C=10.0, epsilon=0.05), scale=True, max_rows=20_000, slow=True),
    ModelSpec("random_forest", "arboles",
              lambda fast, seed: RandomForestRegressor(n_estimators=_trees(fast), min_samples_leaf=5,
                                                       n_jobs=-1, random_state=seed),
              max_rows=60_000),
    ModelSpec("extra_trees", "arboles",
              lambda fast, seed: ExtraTreesRegressor(n_estimators=_trees(fast), min_samples_leaf=5,
                                                     n_jobs=-1, random_state=seed),
              max_rows=60_000),
    ModelSpec("hist_gb", "boosting", lambda fast, seed: HistGradientBoostingRegressor(random_state=seed)),
    ModelSpec("xgboost", "boosting",
              lambda fast, seed: XGBRegressor(n_estimators=_trees(fast), learning_rate=0.05, max_depth=6,
                                              subsample=0.8, colsample_bytree=0.8, n_jobs=-1,
                                              random_state=seed)),
    ModelSpec("lightgbm", "boosting",
              lambda fast, seed: LGBMRegressor(n_estimators=_trees(fast), learning_rate=0.05, num_leaves=31,
                                               subsample=0.8, subsample_freq=1, colsample_bytree=0.8,
                                               n_jobs=-1, random_state=seed, verbose=-1)),
    ModelSpec("catboost", "boosting",
              lambda fast, seed: CatBoostRegressor(iterations=_trees(fast), learning_rate=0.05, depth=6,
                                                   random_seed=seed, verbose=False,
                                                   allow_writing_files=False)),
    ModelSpec("mlp", "red_neuronal",
              lambda fast, seed: MLPRegressor(hidden_layer_sizes=(64, 32), early_stopping=True,
                                              max_iter=150 if fast else 500, random_state=seed),
              scale=True, slow=True),
    ModelSpec("proceso_gaussiano", "bayesiano",
              lambda fast, seed: GaussianProcessRegressor(
                  kernel=ConstantKernel() * RBF() + WhiteKernel(), normalize_y=True, random_state=seed),
              scale=True, max_rows=2_000, slow=True),
]

CLASSIFIERS: list[ModelSpec] = [
    ModelSpec("base_frecuencia", "base", lambda fast, seed: DummyClassifier(strategy="prior"), baseline=True),
    ModelSpec("logistica", "lineal",
              lambda fast, seed: LogisticRegression(max_iter=2000, C=1.0), scale=True),
    ModelSpec("naive_bayes", "bayesiano", lambda fast, seed: GaussianNB(), scale=True),
    ModelSpec("knn", "vecinos", lambda fast, seed: KNeighborsClassifier(n_neighbors=25, weights="distance"),
              scale=True, max_rows=200_000),
    ModelSpec("svm", "svm", lambda fast, seed: SVC(C=1.0, probability=True, random_state=seed),
              scale=True, max_rows=15_000, slow=True),
    ModelSpec("random_forest", "arboles",
              lambda fast, seed: RandomForestClassifier(n_estimators=_trees(fast), min_samples_leaf=5,
                                                        n_jobs=-1, random_state=seed),
              max_rows=60_000),
    ModelSpec("extra_trees", "arboles",
              lambda fast, seed: ExtraTreesClassifier(n_estimators=_trees(fast), min_samples_leaf=5,
                                                      n_jobs=-1, random_state=seed),
              max_rows=60_000),
    ModelSpec("hist_gb", "boosting", lambda fast, seed: HistGradientBoostingClassifier(random_state=seed)),
    ModelSpec("xgboost", "boosting",
              lambda fast, seed: XGBClassifier(n_estimators=_trees(fast), learning_rate=0.05, max_depth=6,
                                               subsample=0.8, colsample_bytree=0.8, n_jobs=-1,
                                               random_state=seed)),
    ModelSpec("lightgbm", "boosting",
              lambda fast, seed: LGBMClassifier(n_estimators=_trees(fast), learning_rate=0.05, num_leaves=31,
                                                subsample=0.8, subsample_freq=1, colsample_bytree=0.8,
                                                n_jobs=-1, random_state=seed, verbose=-1)),
    ModelSpec("catboost", "boosting",
              lambda fast, seed: CatBoostClassifier(iterations=_trees(fast), learning_rate=0.05, depth=6,
                                                    random_seed=seed, verbose=False,
                                                    allow_writing_files=False)),
    ModelSpec("mlp", "red_neuronal",
              lambda fast, seed: MLPClassifier(hidden_layer_sizes=(64, 32), early_stopping=True,
                                               max_iter=150 if fast else 500, random_state=seed),
              scale=True, slow=True),
]


def tabular_models(task: str) -> list[ModelSpec]:
    return REGRESSORS if task == "regression" else CLASSIFIERS
