"""Checks run on every dataset before training (pandera schemas over Polars)."""

from __future__ import annotations

import pandera.polars as pa
import polars as pl

from fieldshift_ml.datasets.base import Dataset


def validate(dataset: Dataset) -> None:
    """Fail early on an unusable table: missing columns, empty target, constant or non-numeric features."""
    frame = dataset.frame
    if frame.height == 0:
        raise ValueError(f"{dataset.concept}: la tabla quedó vacía")
    columns: dict[str, pa.Column] = {}
    if dataset.task == "forecast":
        columns = {
            "unique_id": pa.Column(nullable=False),
            "ds": pa.Column(nullable=False),
            "y": pa.Column(pl.Float64, nullable=False),
        }
        duplicated = frame.select(pl.struct("unique_id", "ds").is_duplicated().any()).item()
        if duplicated:
            raise ValueError(f"{dataset.concept}: hay fechas repetidas dentro de una serie")
    else:
        numeric = [c for c in dataset.features if c not in dataset.categorical]
        finite = pa.Check(
            lambda data: data.lazyframe.select(
                pl.col(data.key).cast(pl.Float64).is_finite() | pl.col(data.key).is_null()
            ),
            error="valores infinitos o NaN",
        )
        for name in numeric:
            columns[name] = pa.Column(nullable=True, checks=finite)
        for name in dataset.categorical:
            columns[name] = pa.Column(nullable=True)
        if dataset.target:
            columns[dataset.target] = pa.Column(nullable=False)
        non_numeric = [c for c in numeric if not frame.schema[c].is_numeric()]
        if non_numeric:
            raise ValueError(f"{dataset.concept}: variables no numéricas sin declarar como categóricas: {non_numeric}")
        constant = [c for c in numeric if frame.get_column(c).n_unique() <= 1]
        if constant:
            raise ValueError(f"{dataset.concept}: variables constantes: {constant}")
    pa.DataFrameSchema(columns, strict=False).validate(frame)
