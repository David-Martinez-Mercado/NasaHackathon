"""Regenerate the notebooks from source so they stay small and reviewable in git.

    python scripts/make_notebooks.py
"""

from __future__ import annotations

from pathlib import Path

import nbformat as nbf

OUT = Path(__file__).resolve().parents[1] / "notebooks"
KERNEL = {"display_name": "Field Shift ML", "language": "python", "name": "fieldshift-ml"}


def notebook(cells: list[tuple[str, str] | tuple[str, str, list[str]]]) -> nbf.NotebookNode:
    nb = nbf.v4.new_notebook(metadata={"kernelspec": KERNEL, "language_info": {"name": "python"}})
    for cell in cells:
        kind, source = cell[0], cell[1].strip("\n")
        node = nbf.v4.new_markdown_cell(source) if kind == "md" else nbf.v4.new_code_cell(source)
        if len(cell) == 3:
            node.metadata["tags"] = cell[2]
        nb.cells.append(node)
    return nb


EVALUATION = [
    ("md", """
# Field Shift — evaluación de modelos de IA

Este notebook compara todos los algoritmos candidatos de **un concepto** con 80 % de los datos para
entrenar y 20 % para probar. Cambia `CONCEPT` en la primera celda y ejecuta todo.

- El 20 % de prueba son siempre los **últimos** periodos: un modelo que adivina el pasado no sirve.
- Cada modelo se compara con un **modelo base** ingenuo (el promedio, la persistencia, la fórmula).
  `skill > 0` significa que le gana al mejor modelo base.
- El ML entrega insumos al motor de reglas; no decide la recomendación.
- La tabla trae un **intervalo de confianza al 95 %** de la métrica principal (`<métrica>_lo`, `<métrica>_hi`),
  calculado remuestreando bloques completos de tiempo (años o ventanas de pronóstico). Si dos modelos tienen
  intervalos que se traslapan mucho, la diferencia entre ellos no es concluyente.

> **`FAST = True` es solo para probar que todo corre.** Usa menos árboles, deja fuera las redes neuronales y los
> modelos lentos, y calcula los intervalos con menos remuestreos. **No saques conclusiones de una corrida rápida:**
> para cifras finales pon `FAST = False`.
"""),
    ("code", """
CONCEPT = "c08a"   # c01 c02 c03 c04 c05a c05b c06 c07 c08a c08b c10
FAST = True        # SOLO PARA PROBAR: menos árboles, sin redes neuronales. Para conclusiones usa False.
SPLIT = None       # None = el del concepto ("time"); "random" o "group" para comparar
MODELS = None      # None = todos; o una lista, p. ej. ["lightgbm", "xgboost"]
TUNE = 0           # pruebas de Optuna por modelo (0 = sin búsqueda de hiperparámetros)
N_BOOT = None      # remuestreos del intervalo de confianza: None = 200 (50 si FAST), 0 = sin intervalo
""", ["parameters"]),
    ("code", """
import logging
import warnings

import matplotlib.pyplot as plt
import polars as pl
from IPython.display import Markdown, display

from fieldshift_ml.datasets import registry
from fieldshift_ml.datasets.base import DataNotReady
from fieldshift_ml.evaluation import explain, plots, report
from fieldshift_ml.evaluation.runner import evaluate

warnings.filterwarnings("ignore")
logging.basicConfig(level=logging.WARNING)
plots.style()
pl.Config.set_tbl_rows(30)
pl.Config.set_fmt_str_lengths(80)
pl.Config.set_float_precision(4)
"""),
    ("md", "## Conceptos disponibles"),
    ("code", """
pl.DataFrame([
    {"id": c.id, "n": c.number, "concepto": c.name, "pregunta": c.question, "tarea": c.task,
     "fuentes": ", ".join(c.sources)}
    for c in registry.CONCEPTS.values()
])
"""),
    ("md", "## 1. Datos del concepto"),
    ("code", """
concept = registry.get_concept(CONCEPT)
try:
    dataset = registry.build(CONCEPT)
except DataNotReady as exc:
    raise SystemExit(f"Este concepto aún no se puede evaluar. Falta: {'; '.join(exc.missing)}") from exc

display(Markdown(f"### {concept.number}. {concept.name}\\n**{concept.question}**\\n\\n"
                 f"Tarea: `{dataset.task}` · {dataset.n_rows:,} filas · objetivo: `{dataset.target}`\\n\\n"
                 + "\\n".join(f"- {note}" for note in dataset.notes)))
dataset.frame.head(8)
"""),
    ("code", """
# ¿Cómo se ve lo que queremos predecir?
if dataset.task == "regression":
    display(dataset.frame.select(dataset.target).describe())
elif dataset.task == "classification":
    display(dataset.frame.group_by(dataset.target).len().with_columns(
        (pl.col("len") / dataset.n_rows).alias("proporcion")).sort("len", descending=True))
elif dataset.task == "forecast":
    display(dataset.frame.group_by("unique_id").agg(
        pl.len().alias("periodos"), pl.col("ds").min().alias("desde"), pl.col("ds").max().alias("hasta"),
        pl.col("y").mean().alias("media"), pl.col("y").std().alias("desv")))
else:
    display(dataset.frame.select(dataset.features).describe())
"""),
    ("md", "## 2. Partición 80 / 20"),
    ("code", """
fig = plots.plot_split(dataset)
if fig is None:
    print("Concepto sin etiqueta: no hay partición entrenamiento/prueba.")
plt.show()
"""),
    ("md", """
## 3. Entrenar y evaluar

Una fila por modelo, del mejor al peor según la métrica principal del concepto.
"""),
    ("code", """
if FAST:
    display(Markdown("> ⚠️ **Corrida rápida (`FAST = True`)**: sirve para comprobar que todo corre, no para "
                     "sacar conclusiones. Los modelos lentos no participan y los intervalos usan pocos remuestreos."))
table = evaluate(dataset, split=SPLIT, fast=FAST, models=MODELS, tune=TUNE, n_boot=N_BOOT)
primary = table["primary"][0]
tag = CONCEPT if SPLIT in (None, dataset.split) else f"{CONCEPT}__{SPLIT}"
shown = [c for c in ("model", "family", primary, f"{primary}_lo", f"{primary}_hi", "skill", "r2", "rmse", "mae",
                     "roc_auc", "f1_macro", "brier",
                     "balanced_accuracy", "mase", "smape", "silhouette", "agreement_expert", "n_train",
                     "n_test", "fit_seconds", "note", "error") if c in table.columns]
table.select(list(dict.fromkeys(shown)))
"""),
    ("md", "## 4. Comparación"),
    ("code", """
plots.plot_ranking(table, f"{concept.name}: {primary} en el 20 % de prueba")
plt.show()

ok = table.filter((pl.col("error").is_null() | (pl.col("error") == "")) & ~pl.col("is_baseline"))
best = ok.row(0, named=True) if ok.height else None
if best is None:
    print("Ningún modelo terminó sin error.")
elif best["skill"] is None:
    print(f"Mejor modelo: {best['model']} ({primary} = {best[primary]:.3f}).")
elif best["skill"] > 0.02:
    print(f"Mejor modelo: {best['model']} ({primary} = {best[primary]:.3f}); "
          f"reduce el error del mejor modelo base en {best['skill']:.0%}.")
else:
    print(f"Ningún modelo supera con claridad al modelo base (mejor: {best['model']}, skill = {best['skill']:.1%}). "
          "Con estos datos conviene usar la regla simple.")
"""),
    ("md", "## 5. Predicho contra observado (mejor modelo)"),
    ("code", """
if best is not None and dataset.task != "unsupervised":
    predictions = report.load_predictions(tag)
    fig = plots.plot_predictions(predictions, best["model"], dataset.task)
    if fig is None:
        print("Sin gráfica para este tipo de salida (clasificación de varias clases): ver la tabla.")
    plt.show()
"""),
    ("md", "## 6. Variables que más pesan"),
    ("code", """
if dataset.task in ("regression", "classification") and best is not None:
    try:
        name, pipeline = explain.load_best_model(tag)
        importance = explain.importance(dataset, name, pipeline)
        plots.plot_importance(importance, f"{name}: variables que más pesan")
        plt.show()
    except Exception as exc:
        print(f"No se pudo calcular la importancia: {exc}")
else:
    print("No aplica a pronósticos de una sola variable ni a índices sin etiqueta.")
"""),
    ("md", """
## 7. ¿Por qué no una partición aleatoria?

Con datos en el tiempo, mezclar al azar deja que el modelo vea días o años vecinos a los de la prueba.
La celda repite el mejor modelo con partición aleatoria para ver cuánto se infla el resultado.
"""),
    ("code", """
if dataset.task in ("regression", "classification") and best is not None and dataset.split == "time":
    random_table = evaluate(dataset, split="random", fast=True, models=[best["model"].replace("_optuna", "")],
                            save=False)
    row = random_table.filter(~pl.col("is_baseline")).row(0, named=True)
    display(pl.DataFrame({
        "particion": ["temporal (la correcta)", "aleatoria"], "modelo": [best["model"], row["model"]],
        primary: [best[primary], row[primary]],
    }))
"""),
    ("md", "## 8. Resumen de todos los conceptos evaluados"),
    ("code", "report.leaderboard()"),
    ("md", """
## Cómo leer las métricas

| Métrica | Qué dice | Referencia |
|---|---|---|
| **R²** | Parte de la variación que explica el modelo | 1 perfecto · 0 igual que el promedio · negativo es peor |
| **RMSE / MAE** | Error típico en las unidades del objetivo | Más bajo es mejor |
| **ROC-AUC** | Qué tan bien ordena los casos de mayor a menor riesgo | 0.5 azar · 1 perfecto |
| **Brier** | Error de las probabilidades | Más bajo es mejor |
| **F1 macro** | Aciertos promediando todas las clases por igual | 1 perfecto |
| **MASE** | Error frente a repetir el valor de hace un año | < 1 le gana a esa regla |
| **skill** | Reducción del error frente al mejor modelo base | > 0 aporta algo |

Registro de experimentos: `uv run mlflow ui --backend-store-uri sqlite:///<ML_WORK_DIR>/mlflow.db`.
"""),
]

INVENTORY = [
    ("md", """
# Field Shift — inventario de datos

Qué hay descargado, qué falta y qué conceptos se pueden evaluar ya. No entrena nada.
"""),
    ("code", """
import matplotlib.pyplot as plt
import polars as pl

from fieldshift_ml.datasets import registry
from fieldshift_ml.evaluation import plots
from fieldshift_ml.io import inventory, power

plots.style()
pl.Config.set_tbl_rows(40)
pl.Config.set_fmt_str_lengths(90)
"""),
    ("md", "## Fuentes en disco"),
    ("code", "inventory.inventory()"),
    ("md", """
## Conceptos: ¿se pueden construir?

Esta celda arma la tabla de cada concepto. La primera vez tarda (lee rasters y deja copias en caché).
"""),
    ("code", "registry.status()"),
    ("md", "## Un vistazo: clima diario de NASA POWER"),
    ("code", """
daily = power.read_daily_all()
yearly = daily.group_by("site", pl.col("date").dt.year().alias("year")).agg(
    pl.col("PRECTOTCORR").sum().alias("lluvia_mm"), pl.col("T2M").mean().alias("temp_c"), pl.len().alias("dias"),
).filter(pl.col("dias") >= 360).sort("year")

fig, axes = plt.subplots(2, 1, figsize=(8, 5), sharex=True)
for site, color in zip(yearly["site"].unique().sort(), (plots.BLUE, plots.ORANGE), strict=False):
    part = yearly.filter(pl.col("site") == site)
    axes[0].plot(part["year"], part["lluvia_mm"], color=color, linewidth=1.8, label=site)
    axes[1].plot(part["year"], part["temp_c"], color=color, linewidth=1.8)
axes[0].set_title("Lluvia anual (mm)")
axes[1].set_title("Temperatura media anual (°C)")
axes[0].legend(ncols=2, loc="upper left")
for ax in axes:
    ax.grid(axis="x", visible=False)
fig.tight_layout()
plt.show()
"""),
]


def main() -> None:
    OUT.mkdir(exist_ok=True)
    nbf.write(notebook(EVALUATION), OUT / "01_evaluacion_modelos.ipynb")
    nbf.write(notebook(INVENTORY), OUT / "00_inventario_datos.ipynb")
    print(f"Notebooks escritos en {OUT}")


if __name__ == "__main__":
    main()
