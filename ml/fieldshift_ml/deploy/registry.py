"""What gets deployed for each concept, and why.

The choice follows the 80/20 evaluation (`ml/README.md`, `docs/decisiones.md`): a model is deployed only where it
clearly beats the best baseline; otherwise the baseline RULE is deployed and labelled as such, so the app never
presents a rule as if it were a learned model. Where several algorithms tie, the compact one wins (a 626 MB
Extra Trees for c03 against a 2 MB XGBoost 0.004 R² lower).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from fieldshift_ml.deploy.schema import Role

Kind = Literal["tabular", "forecast", "index"]


@dataclass(frozen=True)
class DeploySpec:
    concept: str
    kind: Kind
    role: Role
    algorithm: str  # human readable
    model: str  # key in the model registry (tabular / forecast) or the index name
    reason: str
    fast: bool = False  # smaller ensembles: keeps the artifact compact
    scenario_applies: bool = False


DEPLOY: dict[str, DeploySpec] = {s.concept: s for s in [
    DeploySpec("c01", "tabular", "modelo", "XGBoost (regresión)", "xgboost",
               "R² 0.899 contra 0.900 de Extra Trees (160 MB); el R² de la anomalía respecto al historial del condado es ~0.48",
               scenario_applies=True),
    DeploySpec("c02", "tabular", "modelo", "XGBoost (clasificación, 17 clases)", "xgboost",
               "Gana a la cadena de Markov de 2.º orden (F1 macro 0.31 contra 0.22); versión compacta de 120 árboles",
               fast=True),
    DeploySpec("c03", "tabular", "modelo", "XGBoost (regresión)", "xgboost",
               "R² 0.251 contra 0.255 de Extra Trees (626 MB); prueba de solo ~15 fechas de una temporada"),
    DeploySpec("c04", "forecast", "modelo", "PatchTST (pronóstico a 4 semanas)", "patchtst",
               "Mejor MASE (0.353), pero su intervalo se traslapa con el de la persistencia (0.396): ventaja no concluyente"),
    DeploySpec("c05a", "tabular", "regla-base", "Persistencia: P(sequía en 3 meses | ¿sequía ahora?)", "base_persistencia",
               "Ningún modelo supera a la persistencia (el mejor, k-vecinos, 0.567 contra 0.539, intervalos traslapados)"),
    DeploySpec("c05b", "tabular", "modelo", "Regresión logística", "logistica",
               "ROC-AUC 0.871 [0.81–0.92] contra 0.557 de la persistencia", scenario_applies=True),
    DeploySpec("c06", "index", "indice", "Índice experto (promedio de variables orientadas y estandarizadas)", "indice_experto",
               "Sin etiqueta real; el índice experto y PCA son igual de estables y el primero se explica en una frase"),
    DeploySpec("c07", "tabular", "modelo", "XGBoost (regresión)", "xgboost",
               "Error de ~8 días contra 10.5 de la duración habitual"),
    DeploySpec("c08a", "tabular", "modelo", "CatBoost (clasificación)", "catboost",
               "ROC-AUC 0.77 contra 0.50 de la frecuencia histórica", scenario_applies=True),
    DeploySpec("c08b", "forecast", "regla-base", "Climatología mensual (promedio de cada mes)", "base_climatologia",
               "AutoTheta (0.657) y la climatología (0.686) no se distinguen; se despliega la regla simple"),
    DeploySpec("c10", "forecast", "modelo", "AutoTheta (pronóstico a 6 meses)", "auto_theta",
               "MASE 0.711 contra 0.848 de la persistencia"),
]}

NOT_DEPLOYED = {
    "c09": "Falta una serie larga de NDVI (MODIS/Landsat)",
    "c11": "Falta una serie larga de NDVI (MODIS/Landsat)",
}


def get_spec(concept: str) -> DeploySpec:
    if concept in NOT_DEPLOYED:
        raise ValueError(f"{concept} no se despliega: {NOT_DEPLOYED[concept]}")
    if concept not in DEPLOY:
        raise KeyError(f"Concepto sin despliegue: {concept}. Opciones: {', '.join(DEPLOY)}")
    return DEPLOY[concept]
