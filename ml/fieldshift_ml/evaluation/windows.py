"""How many years of history does a model need? Train on a window of the past and score on the SAME recent test set.

The test set is the usual last 20 % in time (`splits.time_split`) and never moves. Only the training rows change:

* `recent`: the last W years before the test period.
* `old`:    W years that END `OLD_GAP` years before the test period (do old data still help on their own?).
* `random`: W years drawn at random from the whole training history (separates "more data" from "recent data").

For every window the deployed model and the concept's baselines are fitted again (baselines that learn from the
training rows are recomputed with the window; the MASE scale stays fixed so errors remain comparable). Each window is
compared with training on ALL the history through a paired block bootstrap on the same test blocks.

Label definitions (heat-wave threshold, SPI calibration) are fixed on purpose: they define the question, not the model.
`hist_yield` (c01) and the GDD reference (c07) ARE model inputs learned from the past, so they are recomputed per window.
"""

from __future__ import annotations

import importlib
import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import polars as pl

from fieldshift_ml.config import get_settings
from fieldshift_ml.datasets import registry
from fieldshift_ml.datasets.base import Dataset
from fieldshift_ml.deploy.registry import DEPLOY
from fieldshift_ml.evaluation import metrics as M
from fieldshift_ml.evaluation.runner import _run_forecast, _run_tabular
from fieldshift_ml.evaluation.splits import split_dataset
from fieldshift_ml.models.forecast import DS, ID

log = logging.getLogger("fieldshift_ml")

DEFAULT_WINDOWS: tuple[int | None, ...] = (1, 3, 5, 10, 15, 20, None)  # None = all the history
MODES = ("recent", "old", "random")
OLD_GAP = 10  # years between the end of an "old" window and the start of the test period
MARGIN_ABS = 0.02  # R² / ROC-AUC: a window is "equivalent" if it is not worse than this (95 % interval)
MARGIN_REL = 0.05  # forecasts: relative MAE
MIN_OVERLAP = 0.98  # share of the full-history test rows a window must be scored on to count
# Concepts whose builder learns a reference from the training years: it must be rebuilt for every window.
STRICT_BUILDERS = {"c01": ("yield_concepts", "build_yield"), "c07": ("yield_concepts", "build_cycle_length")}
# Concepts with enough history to measure anything (the others have < 10 years of training data or none).
MEASURABLE = ("c01", "c04", "c05a", "c05b", "c07", "c08a", "c08b", "c10")


def to_years(values) -> np.ndarray:
    """Time values (integer years or datetimes) as fractional years."""
    array = np.asarray(values)
    if np.issubdtype(array.dtype, np.datetime64):
        return array.astype("datetime64[D]").astype("int64") / 365.2425 + 1970.0
    return array.astype(float)


@dataclass(frozen=True)
class Plan:
    """Where the test period starts and how many years of history there are before it."""

    test_start: float
    first_year: float

    @property
    def span(self) -> float:
        return self.test_start - self.first_year


def make_plan(dataset: Dataset) -> Plan:
    settings = get_settings()
    if dataset.task == "forecast":
        dates = np.sort(dataset.frame.get_column(DS).unique().to_numpy())
        first = len(dates) - int(round(len(dates) * settings.test_fraction))
        return Plan(float(to_years(dates[first])), float(to_years(dates[0])))
    train_idx, test_idx = split_dataset(dataset, None, settings.test_fraction, settings.seed)
    times = to_years(dataset.frame.get_column(dataset.time_col).to_numpy())
    return Plan(float(times[test_idx].min()), float(times[train_idx].min()))


def make_keep(plan: Plan, window: int | None, mode: str, rng: np.random.Generator | None = None):
    """The `train_keep` function for one window, or None for "all the history". Raises ValueError if it cannot exist."""
    if window is None:
        return None
    if window >= plan.span:
        raise ValueError(f"la ventana de {window} años cubre toda la historia ({plan.span:.0f} años)")
    if mode == "recent":
        return lambda t: to_years(t) >= plan.test_start - window
    if mode == "old":
        lo, hi = plan.test_start - OLD_GAP - window, plan.test_start - OLD_GAP
        if lo < plan.first_year:
            raise ValueError(f"no hay {window} años de historia que terminen {OLD_GAP} años antes de la prueba")
        return lambda t: (to_years(t) >= lo) & (to_years(t) < hi)
    if mode == "random":
        years = np.arange(int(np.floor(plan.first_year)), int(np.floor(plan.test_start)))
        chosen = (rng or np.random.default_rng(0)).choice(years, size=int(window), replace=False)
        return lambda t: np.isin(np.floor(to_years(t)), chosen)
    raise ValueError(f"modo desconocido: {mode}")


def _build(concept: str, window: int | None) -> Dataset:
    """The dataset for a window; c01/c07 recompute their training-years reference with the window."""
    if concept in STRICT_BUILDERS and window is not None:
        module, function = STRICT_BUILDERS[concept]
        return getattr(importlib.import_module(f"fieldshift_ml.datasets.{module}"), function)(window_years=window)
    return registry.get_concept(concept).build()


def _fit(dataset: Dataset, keep, models: list[str] | None, n_boot: int, fast: bool, history_years: int | None):
    settings = get_settings()
    only = set(models) if models else None
    if dataset.task == "forecast":
        return _run_forecast(dataset, fast, only, settings.seed, settings.test_fraction, n_boot, keep, history_years)
    return _run_tabular(dataset, dataset.split, fast, only, 0, settings.seed, settings.test_fraction, n_boot, keep)


# ------------------------------------------------------------------------------------------------ paired difference
def _quality_fn(dataset: Dataset, sub_w: pl.DataFrame, sub_f: pl.DataFrame):
    """Returns (delta(idx), blocks): the window's quality minus the full-history quality on the same test rows."""
    if dataset.task == "forecast":
        error_w = np.abs(sub_w["yhat"].to_numpy() - sub_w["y"].to_numpy())
        error_f = np.abs(sub_f["yhat"].to_numpy() - sub_f["y"].to_numpy())
        # relative MAE improvement: > 0 means the window forecasts better than the full history
        return (lambda idx: float(1 - error_w[idx].mean() / max(error_f[idx].mean(), 1e-12))), None
    y = sub_w["y_true"].to_numpy()
    n_classes = int(np.unique(y).size) if dataset.task == "classification" else None

    def build(sub: pl.DataFrame):
        proba = None
        if "proba" in sub.columns:
            p = sub["proba"].to_numpy()
            proba = np.column_stack([1 - p, p])
        return M.primary_metric_fn(dataset.task, sub["y_true"].to_numpy(), sub["y_pred"].to_numpy(), proba,
                                   n_classes=n_classes)

    fn_w, fn_f = build(sub_w), build(sub_f)
    return (lambda idx: fn_w(idx) - fn_f(idx)), None


def paired_delta(dataset: Dataset, preds_w: pl.DataFrame, preds_f: pl.DataFrame, model: str, n_boot: int, seed: int):
    """(delta, low, high, n_rows) of one model: window minus full history, same rows, block bootstrap."""
    if preds_w.is_empty() or preds_f.is_empty():
        return float("nan"), float("nan"), float("nan"), 0
    keys = [ID, DS, "cutoff"] if dataset.task == "forecast" else ["row"]
    a = preds_w.filter(pl.col("model") == model).sort(keys)
    b = preds_f.filter(pl.col("model") == model).sort(keys)
    common = a.select(keys).join(b.select(keys), on=keys, how="inner")
    if common.is_empty():
        return float("nan"), float("nan"), float("nan"), 0
    a, b = a.join(common, on=keys, how="inner").sort(keys), b.join(common, on=keys, how="inner").sort(keys)
    delta_fn, _ = _quality_fn(dataset, a, b)
    if dataset.task == "forecast":
        blocks = M.time_blocks(a["cutoff"].to_numpy())
    else:
        times = dataset.frame.get_column(dataset.time_col).to_numpy()[a["row"].to_numpy()]
        blocks = M.time_blocks(times)
    delta = delta_fn(np.arange(a.height))
    low, high = M.block_bootstrap_ci(delta_fn, blocks, n_boot=n_boot, seed=seed)
    return delta, low, high, a.height


def verdict(dataset: Dataset, low: float, high: float) -> str:
    margin = MARGIN_REL if dataset.task == "forecast" else MARGIN_ABS
    if not np.isfinite(low):
        return "sin intervalo"
    if low > 0:
        return "mejor"
    if low > -margin:
        return "equivalente"
    return "peor" if high < 0 else "no concluyente"


# ------------------------------------------------------------------------------------------------------- the study
def focus_models(concept: str, extra: list[str] | None = None) -> list[str]:
    return sorted({DEPLOY[concept].model, *(extra or [])})


def run_windows(concept: str, windows: tuple[int | None, ...] = DEFAULT_WINDOWS, modes: tuple[str, ...] = ("recent",),
                models: list[str] | None = None, n_boot: int = 200, reps: int = 5, fast: bool = False,
                save: bool = True) -> pl.DataFrame:
    """Run the study for one concept. One row per (mode, window, repetition, model)."""
    if concept not in MEASURABLE:
        raise ValueError(f"{concept} no tiene historia suficiente para este estudio (medibles: {', '.join(MEASURABLE)})")
    settings = get_settings()
    models = models or focus_models(concept)
    full = registry.get_concept(concept).build()
    plan = make_plan(full)
    log.info("%s: prueba desde %.1f, %.0f años de historia antes", concept, plan.test_start, plan.span)
    full_results, full_preds, extra = _fit(full, None, models, n_boot, fast, None)
    primary = full_results[0].primary
    n_test_full = {r.model: r.n_test for r in full_results}
    rows: list[dict] = []

    def add(result, mode, window, rep, dataset, preds, delta=(float("nan"),) * 3, note="", overlap=1.0):
        rows.append({
            "concept": concept, "mode": mode, "window_years": window if window is not None else float("nan"),
            "rep": rep, "model": result.model, "is_baseline": result.is_baseline, "n_train": result.n_train,
            "n_test": result.n_test, "metric": primary, "value": result.metrics.get(primary, float("nan")),
            "lo": result.metrics.get(f"{primary}_lo", float("nan")), "hi": result.metrics.get(f"{primary}_hi", float("nan")),
            "skill": result.skill if result.skill is not None else float("nan"),
            "delta": delta[0], "delta_lo": delta[1], "delta_hi": delta[2],
            "verdict": verdict(dataset, delta[1], delta[2]) if np.isfinite(delta[1]) else ("referencia" if window is None else "sin intervalo"),
            # rebuilt datasets (c01, c07) can lose a couple of test rows; the paired comparison uses the common rows only
            "same_test": overlap >= MIN_OVERLAP, "test_overlap": overlap, "note": note or result.error,
        })

    for result in full_results:
        add(result, "all", None, 0, full, full_preds, delta=(0.0, 0.0, 0.0))

    for mode in modes:
        for window in [w for w in windows if w is not None]:
            repetitions = reps if mode == "random" else 1
            for rep in range(repetitions):
                try:
                    rng = np.random.default_rng(settings.seed + 1000 * (window or 0) + rep)
                    keep = make_keep(plan, window, mode, rng)
                    dataset = _build(concept, window) if concept in STRICT_BUILDERS else full
                    ci = 0 if mode == "random" else n_boot  # random repetitions: point estimates, averaged later
                    results, preds, _ = _fit(dataset, keep, models, ci, fast,
                                             window if (full.task == "forecast" and mode == "recent") else None)
                except ValueError as exc:
                    log.info("%s %s %s años: omitida (%s)", concept, mode, window, exc)
                    break
                for result in results:
                    d = paired_delta(dataset, preds, full_preds, result.model, 0 if mode == "random" else n_boot,
                                     settings.seed)
                    add(result, mode, window, rep, dataset, preds, d[:3],
                        overlap=d[3] / max(n_test_full.get(result.model, 0), 1))
                log.info("%s %s %s años rep %d: %s", concept, mode, window, rep,
                         {r.model: round(r.metrics.get(primary, float("nan")), 3) for r in results})
    table = pl.DataFrame(rows, infer_schema_length=None)
    if save:
        folder = settings.subdir("results") / "ventanas"
        folder.mkdir(parents=True, exist_ok=True)
        table.write_csv(folder / f"{concept}__{'-'.join(modes)}.csv")
    return table


# --------------------------------------------------------------------------------------------------------- summary
def shortest_equivalent(table: pl.DataFrame, model: str, mode: str = "recent") -> tuple[float | None, str]:
    """Smallest window W such that W and every larger window are equivalent (or better) than all the history."""
    sub = table.filter((pl.col("model") == model) & (pl.col("mode") == mode) & pl.col("same_test")).sort("window_years")
    if sub.is_empty():
        return None, "no hay ventanas medibles"
    ok = [v in ("equivalente", "mejor") for v in sub["verdict"].to_list()]
    windows = sub["window_years"].to_list()
    best = None
    for i in range(len(ok) - 1, -1, -1):
        if not ok[i]:
            break
        best = windows[i]
    if best is None:
        return None, "ninguna ventana corta alcanza a la historia completa"
    unclear = sub.filter(pl.col("verdict").is_in(["no concluyente", "sin intervalo"])).height
    return best, ("" if not unclear else f"{unclear} ventana(s) no concluyentes")


def load_tables(folder: Path | None = None) -> dict[str, list[pl.DataFrame]]:
    folder = folder or get_settings().subdir("results") / "ventanas"
    out: dict[str, list[pl.DataFrame]] = {}
    for path in sorted(folder.glob("*.csv")):
        table = pl.read_csv(path, infer_schema_length=None)
        out.setdefault(table["concept"][0], []).append(table)
    return out


def random_summary(table: pl.DataFrame, model: str) -> pl.DataFrame:
    """Mean and spread over the random repetitions, per window."""
    return (table.filter((pl.col("mode") == "random") & (pl.col("model") == model))
            .group_by("window_years").agg(pl.col("value").mean().alias("mean"), pl.col("value").std().alias("sd"),
                                          pl.col("delta").mean().alias("delta_mean"), pl.len().alias("reps"))
            .sort("window_years"))


__all__ = ["DEFAULT_WINDOWS", "MEASURABLE", "MODES", "run_windows", "shortest_equivalent", "verdict"]
