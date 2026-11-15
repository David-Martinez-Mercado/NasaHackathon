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
    n_boot: Annotated[int | None, typer.Option(
        help="Remuestreos para el intervalo de confianza (por defecto 200; 50 con --fast; 0 = sin intervalo)")] = None,
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
        table = run(dataset, split=split, fast=fast, models=models.split(",") if models else None, tune=tune,
                    n_boot=n_boot)
        primary = table["primary"][0]
        keep = [c for c in ("model", "family", primary, f"{primary}_lo", f"{primary}_hi", "skill", "r2", "rmse",
                            "mae", "f1_macro",
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


# ------------------------------------------------------------------------------------------------ deploy
deploy_app = typer.Typer(add_completion=False, pretty_exceptions_enable=False,
                         help="Modelos para deploy: entrenamiento final, export para el backend y esquema.")
app.add_typer(deploy_app, name="deploy")


@deploy_app.command("list")
def deploy_list() -> None:
    """Qué se despliega por concepto y por qué."""
    from fieldshift_ml.deploy.registry import DEPLOY, NOT_DEPLOYED

    rows = [{"concepto": s.concept, "rol": s.role, "algoritmo": s.algorithm, "motivo": s.reason}
            for s in DEPLOY.values()]
    rows += [{"concepto": c, "rol": "—", "algoritmo": "no se despliega", "motivo": why}
             for c, why in NOT_DEPLOYED.items()]
    with pl.Config(fmt_str_lengths=110, tbl_width_chars=260):
        print(pl.DataFrame(rows).sort("concepto"))


@deploy_app.command("train")
def deploy_train(
    concept: Annotated[str | None, typer.Option(help="Id del concepto; sin él se entrenan todos")] = None,
    version: Annotated[str | None, typer.Option(help="Versión (por defecto fecha y commit)")] = None,
) -> None:
    """Entrena con el 100 % de las filas y guarda el modelo con su manifiesto y su ficha."""
    from fieldshift_ml.deploy.train import train, train_many

    _setup_logging()
    manifests = [train(concept, version)] if concept else train_many(None, version)
    for m in manifests:
        size = m.artifact.size_bytes / 1e6 if m.artifact else 0
        has = m.metrics is not None and m.metrics.value is not None
        value = f"{m.metrics.primary}={m.metrics.value:.3f}" if has else "sin métricas"
        print(f"{m.concept:5s} {m.name:20s} {m.role:10s} {m.trained_rows:>8,} filas  {size:6.1f} MB  {value}  "
              f"v{m.version}")


@deploy_app.command("export")
def deploy_export(
    version: Annotated[str | None, typer.Option(help="Versión del export (por defecto fecha y commit)")] = None,
) -> None:
    """Predice con los modelos desplegados y escribe el export que importa el backend."""
    from fieldshift_ml.deploy.export import build_export

    _setup_logging()
    path = build_export(version)
    print(f"Export escrito en {path}")


@deploy_app.command("validate")
def deploy_validate(path: Annotated[str, typer.Argument(help="Carpeta del export")]) -> None:
    """Revisa un export como lo leerá el backend: hashes, esquema y tamaños de rejilla."""
    from pathlib import Path

    from fieldshift_ml.deploy.validate import validate_export

    manifest = validate_export(Path(path))
    print(f"OK: {manifest.version}, {len(manifest.files)} archivos, datos al {manifest.data_as_of}")


@deploy_app.command("schema")
def deploy_schema() -> None:
    """Regenera ml/deploy/export.schema.json (el backend valida el export con él)."""
    import json

    from fieldshift_ml.deploy import paths
    from fieldshift_ml.deploy.schema import json_schema

    out = paths.deploy_dir() / "export.schema.json"
    out.write_text(json.dumps(json_schema(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Esquema escrito en {out}")




@app.command("windows")
def windows_cmd(
    concept: Annotated[str | None, typer.Option(help="Id del concepto, p. ej. c05b")] = None,
    all_: Annotated[bool, typer.Option("--all", help="Todos los conceptos con historia larga")] = False,
    windows: Annotated[str, typer.Option(help="Años de historia, separados por comas; 'all' = toda")] = (
        "1,3,5,10,15,20,all"),
    modes: Annotated[str, typer.Option(help="recent | old | random, separados por comas")] = "recent",
    models: Annotated[str | None, typer.Option(help="Modelos (por defecto, el desplegado y las bases)")] = None,
    n_boot: Annotated[int, typer.Option(help="Remuestreos del intervalo de confianza")] = 200,
    reps: Annotated[int, typer.Option(help="Repeticiones del modo random")] = 5,
    fast: Annotated[bool, typer.Option(help="Menos árboles, sin modelos lentos")] = False,
) -> None:
    """¿Cuántos años de historia hacen falta? Entrena con ventanas del pasado y mide en la MISMA prueba reciente."""
    from fieldshift_ml.evaluation import windows as W

    _setup_logging()
    if not concept and not all_:
        raise typer.BadParameter("Indica --concept o --all")
    years = tuple(None if w.strip() == "all" else int(w) for w in windows.split(","))
    kinds = tuple(m.strip() for m in modes.split(","))
    for concept_id in (list(W.MEASURABLE) if all_ else [concept]):
        try:
            table = W.run_windows(concept_id, years, kinds, models.split(",") if models else None, n_boot, reps, fast)
        except (DataNotReady, ValueError) as exc:
            print(f"[omitido] {concept_id}: {exc}")
            continue
        best, note = W.shortest_equivalent(table, W.focus_models(concept_id)[0], "recent")
        print(f"{concept_id}: ventana más corta equivalente = {best} años {note}")


@app.command("windows-report")
def windows_report_cmd() -> None:
    """Arma ml/reports/ventanas.md y las gráficas con lo que dejó el estudio de ventanas."""
    from fieldshift_ml.evaluation.windows_report import build_report

    _setup_logging()
    print(build_report())


@app.command("serve")
def serve(
    host: Annotated[str, typer.Option(help="Dirección (por defecto solo local: el servicio es interno)")] = "127.0.0.1",
    port: Annotated[int, typer.Option(help="Puerto")] = 8001,
) -> None:
    """Servicio de predicciones en vivo (FastAPI): consulta NASA POWER y predice con los modelos desplegados."""
    import uvicorn

    from fieldshift_ml.service.app import create_app

    _setup_logging()
    uvicorn.run(create_app(), host=host, port=port, log_level="info")


global_app = typer.Typer(help="Entrenamiento con celdas de todo el mundo (NASA POWER)")
app.add_typer(global_app, name="global")


@global_app.command("download")
def global_download(
    limit: Annotated[int | None, typer.Option(help="Solo las primeras N celdas (prueba)")] = None,
    workers: Annotated[int, typer.Option(help="Consultas en paralelo")] = 6,
    per_band: Annotated[int, typer.Option(help="Celdas por cada 10° de latitud")] = 45,
) -> None:
    """Baja el historial diario 1981-hoy de las celdas candidatas (se puede repetir: salta las que ya están)."""
    from fieldshift_ml.global_train import download

    _setup_logging()
    print(download.run(limit, workers, per_band))


@global_app.command("eval")
def global_eval(
    concept: Annotated[str, typer.Option(help="c05b, c08a o c04")],
    n_boot: Annotated[int, typer.Option(help="Remuestreos del intervalo")] = 100,
) -> None:
    """Entrena con celdas de todo el mundo y mide en años futuros, en regiones apartadas y en Weld."""
    _setup_logging()
    if concept == "c04":
        from fieldshift_ml.global_train import forecast as g

        rows, info = g.evaluate(n_boot)
    else:
        from fieldshift_ml.global_train import tabular as g

        rows, info = g.evaluate(concept, n_boot)
    import pandas as pd

    table = pd.DataFrame([r.__dict__ for r in rows])
    out = get_settings().subdir("results") / "global"
    out.mkdir(parents=True, exist_ok=True)
    table.to_csv(out / f"{concept}.csv", index=False)
    print(table.to_string(index=False))
    print({k: v for k, v in info.items() if k not in ("pipeline", "model")})


if __name__ == "__main__":
    app()
