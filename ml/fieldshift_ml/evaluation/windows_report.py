"""Turn the window-study tables into `ml/reports/ventanas.md` and one chart per concept."""

from __future__ import annotations

import logging
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import polars as pl  # noqa: E402

from fieldshift_ml.datasets import registry  # noqa: E402
from fieldshift_ml.deploy.registry import DEPLOY  # noqa: E402
from fieldshift_ml.evaluation import windows as W  # noqa: E402

log = logging.getLogger("fieldshift_ml")

METRIC_NAME = {"roc_auc": "ROC-AUC", "r2": "R²", "mase": "MASE (menor es mejor)"}
VERDICT_TEXT = {
    "equivalente": "equivalente", "mejor": "mejor", "peor": "PEOR", "no concluyente": "no concluyente",
    "sin intervalo": "sin intervalo", "referencia": "referencia",
}


def _f(value, digits: int = 3) -> str:
    return "—" if value is None or value != value else f"{value:.{digits}f}"


def _ci(value, lo, hi) -> str:
    return _f(value) if lo is None or lo != lo else f"{_f(value)} [{_f(lo, 2)}–{_f(hi, 2)}]"


def _merge(tables: list[pl.DataFrame]) -> pl.DataFrame:
    return pl.concat(tables, how="diagonal_relaxed").unique(
        subset=["mode", "window_years", "rep", "model"], keep="last", maintain_order=True)


def chart(concept: str, table: pl.DataFrame, out: Path) -> Path:
    model = DEPLOY[concept].model
    metric = table["metric"][0]
    fig, ax = plt.subplots(figsize=(7.5, 4.2))
    full = table.filter((pl.col("mode") == "all") & (pl.col("model") == model))
    if not full.is_empty():
        ax.axhline(full["value"][0], color="#555", ls="--", lw=1, label="toda la historia")
    base = table.filter((pl.col("mode") == "all") & pl.col("is_baseline")).sort("value", descending=metric != "mase")
    if not base.is_empty():
        ax.axhline(base["value"][0], color="#c0392b", ls=":", lw=1, label=f"mejor base ({base['model'][0]})")
    recent = table.filter((pl.col("mode") == "recent") & (pl.col("model") == model)).sort("window_years")
    if not recent.is_empty():
        x = recent["window_years"].to_numpy()
        ax.errorbar(x, recent["value"].to_numpy(), yerr=[recent["value"].to_numpy() - recent["lo"].to_numpy(),
                                                          recent["hi"].to_numpy() - recent["value"].to_numpy()],
                    fmt="o-", color="#1e6433", capsize=3, label="últimos N años")
    old = table.filter((pl.col("mode") == "old") & (pl.col("model") == model)).sort("window_years")
    if not old.is_empty():
        ax.plot(old["window_years"], old["value"], "s--", color="#d98a00", label=f"N años de hace {W.OLD_GAP}+ años")
    rnd = W.random_summary(table, model)
    if not rnd.is_empty():
        ax.errorbar(rnd["window_years"], rnd["mean"], yerr=rnd["sd"].fill_null(0), fmt="^:", color="#4464e8", capsize=3,
                    label="N años al azar (media ± sd)")
    ax.set_xlabel("años de historia usados para entrenar")
    ax.set_ylabel(METRIC_NAME.get(metric, metric))
    ax.set_title(f"{concept}: {registry.get_concept(concept).name} · modelo {model}")
    ax.grid(alpha=0.25)
    ax.legend(fontsize=8)
    fig.tight_layout()
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, dpi=130)
    plt.close(fig)
    return out


def _section(concept: str, table: pl.DataFrame, png: str) -> tuple[list[str], dict]:
    spec = DEPLOY[concept]
    metric = table["metric"][0]
    lines = [f"## {concept} · {registry.get_concept(concept).name}", "",
             f"Modelo desplegado: **{spec.algorithm}** (`{spec.model}`, rol: {spec.role}). Métrica: **{METRIC_NAME.get(metric, metric)}**.", "",
             f"![{concept}]({png})", ""]
    full = table.filter((pl.col("mode") == "all") & (pl.col("model") == spec.model))
    base = table.filter((pl.col("mode") == "all") & pl.col("is_baseline")).sort("value", descending=metric != "mase")
    if not full.is_empty():
        row = full.row(0, named=True)
        lines.append(f"- Con **toda la historia** ({row['n_train']:,} filas de entrenamiento): {_ci(row['value'], row['lo'], row['hi'])}"
                     + (f"; la mejor base ({base['model'][0]}) saca {_f(base['value'][0])}." if not base.is_empty() else "."))
    summary = {"concept": concept, "model": spec.model, "metric": metric}
    for mode, title in (("recent", "Últimos N años"), ("old", f"N años de hace {W.OLD_GAP}+ años")):
        sub = table.filter((pl.col("mode") == mode) & (pl.col("model") == spec.model)).sort("window_years")
        if sub.is_empty():
            continue
        lines += ["", f"**{title}** (misma prueba reciente en todas las filas)", "",
                  f"| Años | Filas de entrenamiento | {METRIC_NAME.get(metric, metric)} [IC 95 %] | Skill | Diferencia con toda la historia [IC 95 %] | Veredicto |",
                  "|---|---|---|---|---|---|"]
        for r in sub.iter_rows(named=True):
            same = "" if r["same_test"] else " ⚠ prueba distinta"
            lines.append(f"| {r['window_years']:.0f} | {r['n_train']:,} | {_ci(r['value'], r['lo'], r['hi'])} | {_f(r['skill'], 2)} | "
                         f"{_ci(r['delta'], r['delta_lo'], r['delta_hi'])} | {VERDICT_TEXT.get(r['verdict'], r['verdict'])}{same} |")
        if mode == "recent":
            best, note = W.shortest_equivalent(table, spec.model, "recent")
            summary["shortest"], summary["note"] = best, note
            lines += ["", ("**Lectura:** " + (f"desde **{best:.0f} años** de historia el modelo es equivalente a usar todo lo que hay"
                                              if best is not None else "ninguna ventana corta alcanza a la historia completa")
                           + (f" ({note})." if note else "."))]
    rnd = W.random_summary(table, spec.model)
    if not rnd.is_empty():
        lines += ["", "**N años al azar de todo el historial** (media y desviación de las repeticiones; separa «más datos» de «datos recientes»)", "",
                  "| Años | Repeticiones | Media | Desv. | Diferencia media con toda la historia |", "|---|---|---|---|---|"]
        for r in rnd.iter_rows(named=True):
            lines.append(f"| {r['window_years']:.0f} | {r['reps']} | {_f(r['mean'])} | {_f(r['sd'])} | {_f(r['delta_mean'])} |")
    unfair = table.filter(~pl.col("same_test"))
    if not unfair.is_empty():
        lines += ["", f"⚠ {unfair.height} fila(s) tuvieron una prueba distinta a la de toda la historia y no cuentan para el veredicto."]
    return lines + [""], summary


def build_report(folder: Path | None = None) -> Path:
    tables = W.load_tables(folder)
    root = Path(__file__).resolve().parents[2]
    out = root / "reports"
    sections, summaries = [], []
    for concept in W.MEASURABLE:
        if concept not in tables:
            continue
        merged = _merge(tables[concept])
        png = chart(concept, merged, out / "ventanas" / f"{concept}.png")
        lines, summary = _section(concept, merged, f"ventanas/{png.name}")
        sections += lines
        summaries.append(summary)
    head = [
        "# ¿Cuántos años de historia hacen falta?", "",
        "Cada modelo desplegado se entrenó de nuevo con ventanas distintas del pasado y se midió **en la misma prueba reciente** "
        "(el último 20 % en el tiempo). Así, una diferencia solo puede venir de qué datos vio al entrenar.", "",
        f"**Criterio de «equivalente»:** el intervalo de confianza al 95 % de la diferencia con la historia completa queda por encima de "
        f"−{W.MARGIN_ABS} (ROC-AUC y R²) o −{W.MARGIN_REL:.0%} del error (pronósticos). «No concluyente» significa que la prueba es demasiado "
        "corta para decidir, no que las ventanas sean iguales.", "",
        "**Límites:** solo habla de Weld, Colorado y de estos modelos; no dice nada sobre Durango ni sobre el clima futuro. "
        "Las definiciones de la etiqueta (umbral de ola de calor, calibración del SPI) se dejaron fijas; `hist_yield` (c01) y los GDD de referencia "
        "(c07) se recalcularon con cada ventana. Los pronósticos solo se midieron con «últimos N años».", "",
        "## Resumen", "", "| Concepto | Modelo | Ventana más corta equivalente | Observación |", "|---|---|---|---|",
    ]
    for s in summaries:
        shortest = "no hay" if s.get("shortest") is None else f"{s['shortest']:.0f} años"
        head.append(f"| {s['concept']} | {s['model']} | {shortest} | {s.get('note', '')} |")
    report = out / "ventanas.md"
    report.write_text("\n".join(head + [""] + sections) + "\n", encoding="utf-8")
    log.info("Informe escrito en %s", report)
    return report
