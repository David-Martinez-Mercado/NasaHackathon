"""Charts for the notebooks (matplotlib). One blue for models, gray for baselines, orange for the test set."""

from __future__ import annotations

import matplotlib.pyplot as plt
import numpy as np
import polars as pl

from fieldshift_ml.datasets.base import Dataset
from fieldshift_ml.evaluation.splits import split_dataset

SURFACE, INK, INK_2, MUTED = "#fcfcfb", "#0b0b0b", "#52514e", "#898781"
GRID, AXIS = "#e1e0d9", "#c3c2b7"
BLUE, ORANGE = "#2a78d6", "#eb6834"

METRIC_LABELS = {
    "r2": "R² (más alto es mejor)", "roc_auc": "ROC-AUC (más alto es mejor)",
    "f1_macro": "F1 macro (más alto es mejor)", "mase": "MASE (más bajo es mejor; 1 = ingenuo estacional)",
    "stability": "Estabilidad (más alto es mejor)",
}


def style() -> None:
    plt.rcParams.update({
        "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE,
        "axes.edgecolor": AXIS, "axes.labelcolor": INK_2, "text.color": INK, "axes.titlecolor": INK,
        "xtick.color": MUTED, "ytick.color": INK_2, "xtick.labelcolor": INK_2,
        "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.8, "axes.axisbelow": True,
        "axes.spines.top": False, "axes.spines.right": False, "axes.spines.left": False,
        "axes.titlesize": 12, "axes.titleweight": "bold", "axes.titlelocation": "left",
        "axes.labelsize": 10, "font.size": 10, "figure.dpi": 110, "legend.frameon": False,
    })


def plot_ranking(table: pl.DataFrame, title: str = ""):
    """Horizontal bars of the primary metric, best on top. Baselines in gray; the line marks the best one."""
    ok = table.filter(pl.col("error").is_null() | (pl.col("error") == ""))
    primary = ok["primary"][0]
    ok = ok.filter(pl.col(primary).is_not_null())
    names, values = ok["model"].to_list()[::-1], ok[primary].to_list()[::-1]
    is_base = ok["is_baseline"].to_list()[::-1]
    fig, ax = plt.subplots(figsize=(7.5, 0.34 * len(names) + 1.3))
    ax.barh(names, values, color=[MUTED if b else BLUE for b in is_base], height=0.62)
    base_values = [v for v, b in zip(values, is_base, strict=True) if b]
    if base_values:
        higher_is_better = primary != "mase"
        reference = max(base_values) if higher_is_better else min(base_values)
        ax.axvline(reference, color=INK_2, linewidth=1, linestyle=(0, (4, 3)))
        ax.annotate("mejor modelo base", (reference, len(names) - 0.4), xytext=(4, 0),
                    textcoords="offset points", color=INK_2, fontsize=8.5, va="center")
    span = max(values) - min(min(values), 0)
    for index, value in enumerate(values):
        ax.annotate(f"{value:.3f}", (max(value, 0), index), xytext=(4, 0), textcoords="offset points",
                    va="center", fontsize=8.5, color=INK_2)
    ax.set_xlim(min(min(values), 0) - 0.02 * span, max(values) + 0.14 * span)
    ax.grid(axis="y", visible=False)
    ax.set_xlabel(METRIC_LABELS.get(primary, primary))
    ax.set_title(title or "Comparación de modelos")
    fig.tight_layout()
    return fig


def plot_split(dataset: Dataset):
    """How many rows per period go to training (blue) and to testing (orange)."""
    if dataset.task == "forecast":
        counts = dataset.frame.group_by(pl.col("ds").dt.year().alias("p")).len().sort("p")
        periods = counts["p"].to_numpy()
        n_test = max(1, int(round(len(periods) * 0.2)))
        is_test = np.arange(len(periods)) >= len(periods) - n_test
    elif dataset.time_col:
        train, test = split_dataset(dataset)
        column = dataset.frame[dataset.time_col]
        key = column.dt.year() if column.dtype in (pl.Date, pl.Datetime) else column
        frame = pl.DataFrame({"p": key, "test": np.isin(np.arange(dataset.n_rows), test)})
        counts = frame.group_by("p").agg(pl.len(), pl.col("test").mean().alias("share")).sort("p")
        periods, is_test = counts["p"].to_numpy(), counts["share"].to_numpy() > 0.5
    else:
        return None
    fig, ax = plt.subplots(figsize=(7.5, 2.4))
    values = counts["len"].to_numpy()
    ax.bar(periods[~is_test], values[~is_test], color=BLUE, width=0.8, label="entrenamiento (80 %)")
    ax.bar(periods[is_test], values[is_test], color=ORANGE, width=0.8, label="prueba (20 %)")
    ax.grid(axis="x", visible=False)
    ax.set_ylim(0, values.max() * 1.08)
    ax.set_ylabel("filas")
    ax.set_title("Partición en el tiempo: la prueba son los últimos periodos")
    ax.legend(loc="upper left", ncols=2, bbox_to_anchor=(0, -0.18))
    fig.tight_layout()
    return fig


def plot_predictions(predictions: pl.DataFrame, model: str, task: str, max_points: int = 4000):
    """Predicted against observed for one model, in the form that fits the task."""
    data = predictions.filter(pl.col("model") == model)
    if task == "forecast":
        return _plot_forecast(data, model)
    if task == "regression":
        if data.height > max_points:
            data = data.sample(max_points, seed=0)
        fig, ax = plt.subplots(figsize=(4.8, 4.6))
        ax.scatter(data["y_true"], data["y_pred"], s=9, color=BLUE, alpha=0.35, linewidths=0)
        low = min(data["y_true"].min(), data["y_pred"].min())
        high = max(data["y_true"].max(), data["y_pred"].max())
        ax.plot([low, high], [low, high], color=INK_2, linewidth=1, linestyle=(0, (4, 3)))
        ax.annotate("predicción perfecta", (high, high), xytext=(-6, -12), textcoords="offset points",
                    ha="right", color=INK_2, fontsize=8.5)
        ax.set_xlabel("observado")
        ax.set_ylabel("predicho")
        ax.set_title(f"{model}: predicho vs. observado (prueba)")
        fig.tight_layout()
        return fig
    if "proba" in data.columns and data["proba"].null_count() < data.height:
        return _plot_calibration(data, model)
    return None


def _plot_forecast(data: pl.DataFrame, model: str):
    series = data["unique_id"].unique().sort().to_list()[:4]
    fig, axes = plt.subplots(len(series), 1, figsize=(8, 2.1 * len(series) + 0.6), sharex=True, squeeze=False)
    for ax, uid in zip(axes[:, 0], series, strict=True):
        part = data.filter(pl.col("unique_id") == uid).sort("ds")
        ax.plot(part["ds"], part["y"], color=INK, linewidth=1.6, label="observado")
        for _, window in part.group_by("cutoff", maintain_order=True):
            ax.plot(window["ds"], window["yhat"], color=BLUE, linewidth=1.6)
        ax.plot([], [], color=BLUE, linewidth=1.6, label=f"pronóstico ({model})")
        ax.set_title(str(uid), fontsize=10)
        ax.grid(axis="x", visible=False)
    axes[0, 0].legend(loc="upper left", ncols=2, fontsize=8.5)
    fig.suptitle("Pronósticos en el periodo de prueba (cada tramo azul es un origen distinto)",
                 x=0.01, ha="left", fontsize=11, fontweight="bold")
    fig.tight_layout()
    return fig


def _plot_calibration(data: pl.DataFrame, model: str):
    proba, truth = data["proba"].to_numpy(), data["y_true"].to_numpy()
    edges = np.linspace(0, 1, 11)
    bins = np.clip(np.digitize(proba, edges) - 1, 0, 9)
    x = [proba[bins == b].mean() for b in range(10) if (bins == b).sum() >= 20]
    y = [truth[bins == b].mean() for b in range(10) if (bins == b).sum() >= 20]
    fig, ax = plt.subplots(figsize=(4.8, 4.6))
    ax.plot([0, 1], [0, 1], color=INK_2, linewidth=1, linestyle=(0, (4, 3)))
    ax.plot(x, y, color=BLUE, linewidth=2, marker="o", markersize=6, markeredgecolor=SURFACE, markeredgewidth=1.5)
    ax.annotate("calibración perfecta", (1, 1), xytext=(-6, -12), textcoords="offset points", ha="right",
                color=INK_2, fontsize=8.5)
    ax.set_xlabel("probabilidad que dio el modelo")
    ax.set_ylabel("frecuencia con que ocurrió")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.set_title(f"{model}: calibración", fontsize=11)
    fig.tight_layout()
    return fig


def plot_importance(importance: pl.DataFrame, title: str = "Variables que más pesan", top: int = 12):
    data = importance.head(top).reverse()
    fig, ax = plt.subplots(figsize=(7, 0.34 * data.height + 1.2))
    ax.barh(data["feature"].to_list(), data["importance"].to_list(), color=BLUE, height=0.62)
    ax.grid(axis="y", visible=False)
    ax.set_xlabel(importance["method"][0])
    ax.set_title(title)
    fig.tight_layout()
    return fig
