"""Read saved results and summarise them across concepts."""

from __future__ import annotations

import json

import polars as pl

from fieldshift_ml.config import get_settings
from fieldshift_ml.datasets.registry import CONCEPTS


def load_results(tag: str) -> pl.DataFrame:
    return pl.read_csv(get_settings().subdir("results") / f"{tag}.csv", infer_schema_length=None)


def load_predictions(tag: str) -> pl.DataFrame:
    return pl.read_parquet(get_settings().subdir("results") / f"{tag}__predicciones.parquet")


def load_meta(tag: str) -> dict:
    return json.loads((get_settings().subdir("results") / f"{tag}.json").read_text(encoding="utf-8"))


def leaderboard() -> pl.DataFrame:
    """Best model and best baseline per concept, with the gain between them."""
    rows = []
    for path in sorted(get_settings().subdir("results").glob("*.json")):
        meta = json.loads(path.read_text(encoding="utf-8"))
        table = load_results(path.stem).filter(pl.col("error").is_null() | (pl.col("error") == ""))
        primary = meta["primary"]
        if table.height == 0 or primary not in table.columns:
            continue
        candidates = table.filter(~pl.col("is_baseline"))
        baselines = table.filter(pl.col("is_baseline"))
        best = candidates.row(0, named=True) if candidates.height else None
        base = baselines.row(0, named=True) if baselines.height else None
        concept = CONCEPTS.get(meta["concept"])
        rows.append({
            "concepto": path.stem, "nombre": concept.name if concept else "", "tarea": meta["task"],
            "particion": meta["split"], "filas": meta["rows"], "metrica": primary,
            "mejor_modelo": best["model"] if best else None,
            "valor": round(best[primary], 4) if best and best[primary] is not None else None,
            "mejor_base": base["model"] if base else None,
            "valor_base": round(base[primary], 4) if base and base[primary] is not None else None,
            "skill": best["skill"] if best else None,
            "rapido": meta.get("fast"), "corrida": meta["run_at"],
        })
    return pl.DataFrame(rows, infer_schema_length=None)
