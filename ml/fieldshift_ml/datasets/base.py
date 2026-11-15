"""Common types for the concept datasets."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Literal

import polars as pl

Task = Literal["regression", "classification", "forecast", "unsupervised"]
SplitKind = Literal["time", "group", "random", "none"]


class DataNotReady(RuntimeError):
    """Raised when a concept cannot be built because a source is missing."""

    def __init__(self, concept: str, missing: list[str]):
        self.concept = concept
        self.missing = missing
        super().__init__(f"{concept}: faltan datos -> " + "; ".join(missing))


@dataclass
class Dataset:
    """A modelling table plus everything the evaluator needs to split and score it."""

    concept: str
    task: Task
    frame: pl.DataFrame
    target: str | None = None
    features: list[str] = field(default_factory=list)
    categorical: list[str] = field(default_factory=list)
    # split
    split: SplitKind = "time"
    time_col: str | None = None
    group_col: str | None = None
    # optional column holding a domain reference prediction (a formula, a historical mean...)
    baseline_feature: str | None = None
    # label of that baseline in the results (default: base_referencia / base_markov)
    baseline_name: str | None = None
    # more baselines, {name: column}; each one is scored and the skill is taken against the best of all
    extra_baselines: dict[str, str] = field(default_factory=dict)
    # ordered categorical columns (oldest -> newest) for the recurrent models
    sequence_cols: list[str] = field(default_factory=list)
    # forecast only (frame is long: unique_id, ds, y [+ exog_cols])
    # same-period weather columns; the models that use them shift them by at least `horizon` periods
    exog_cols: list[str] = field(default_factory=list)
    freq: str | None = None
    horizon: int | None = None
    season_length: int | None = None
    # documentation shown in the notebook and the reports
    notes: list[str] = field(default_factory=list)

    @property
    def n_rows(self) -> int:
        return self.frame.height


@dataclass(frozen=True)
class Concept:
    id: str
    number: int
    name: str
    question: str
    task: Task
    sources: tuple[str, ...]
    build: Callable[[], Dataset]
    phase: int = 1
