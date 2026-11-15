"""Command line: fieldshift-ml status | build | eval | report."""

from __future__ import annotations

import logging
import sys
from typing import Annotated

import polars as pl
import typer

from fieldshift_ml.config import get_settings
from fieldshift_ml.datasets import registry
from fieldshift_ml.datasets.base import DataNotReady

app = typer.Typer(add_completion=False, pretty_exceptions_enable=False,
                  help="Evaluación de modelos de IA de Field Shift.")
if hasattr(sys.stdout, "reconfigure"):  # Windows consoles default to cp1252 and break on accents
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
pl.Config.set_tbl_rows(40)
pl.Config.set_tbl_cols(14)
pl.Config.set_fmt_str_lengths(60)


def _setup_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")


@app.command()
def status() -> None:
    """Muestra qué conceptos tienen datos listos."""
    print(registry.status())


@app.command()
def build(concept: Annotated[str, typer.Option(help="Id del concepto, p. ej. c08a")]) -> None:
    """Arma la tabla de entrenamiento de un concepto."""
    _setup_logging()
    dataset = registry.build(concept)
    print(f"{concept}: {dataset.n_rows:,} filas, tarea {dataset.task} -> {registry.cache_path(concept)}")
    for note in dataset.notes:
        print("  -", note)


@app.command("eval")
def evaluate(
    concept: Annotated[str | None, typer.Option(help="Id del concepto")] = None,
    all_: Annotated[bool, typer.Option("--all", help="Todos los conceptos con datos")] = False,
    fast: Annotated[bool, typer.Option(help="Menos árboles, sin modelos lentos")] = False,
    split: Annotated[str | None, typer.Option(help="time | group | random (por defecto, el del concepto)")] = None,
    models: Annotated[str | None, typer.Option(help="Lista separada por comas")] = None,
    tune: Annotated[int, typer.Option(help="Pruebas de Optuna por modelo (0 = sin búsqueda)")] = 0,
) -> None:
    """Entrena y evalúa los modelos candidatos (80 % entrenamiento, 20 % prueba)."""
    from fieldshift_ml.evaluation.runner import evaluate as run

    _setup_logging()
    if not concept and not all_:
        raise typer.BadParameter("Indica --concept o --all")
    targets = list(registry.CONCEPTS) if all_ else [concept]
    for concept_id in targets:
        try:
            dataset = registry.build(concept_id)
        except DataNotReady as exc:
            print(f"[pendiente] {exc}")
            continue
        table = run(dataset, split=split, fast=fast, models=models.split(",") if models else None, tune=tune)
        keep = [c for c in ("model", "family", table["primary"][0], "skill", "r2", "rmse", "mae", "f1_macro",
                            "brier", "fit_seconds", "error") if c in table.columns]
        print(f"\n== {concept_id}: {registry.get_concept(concept_id).name} ({dataset.n_rows:,} filas)")
        print(table.select(list(dict.fromkeys(keep))))


@app.command()
def report() -> None:
    """Junta los resultados guardados en una sola tabla (leaderboard.csv)."""
    from fieldshift_ml.evaluation.report import leaderboard

    table = leaderboard()
    out = get_settings().work / "leaderboard.csv"
    table.write_csv(out)
    print(table)
    print(f"\nGuardado en {out}")


if __name__ == "__main__":
    app()
