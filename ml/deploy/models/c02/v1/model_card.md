# c02 · xgboost

- **Algoritmo:** XGBoost (clasificación, 17 clases) (modelo)
- **Versión:** `v1` · entrenado el 2026-11-15 con 156,753 filas hasta 2023
- **Por qué este:** Gana a la cadena de Markov de 2.º orden (F1 macro 0.31 contra 0.22); versión compacta de 120 árboles
- **Variables:** prev5, prev4, prev3, prev2, prev1, streak, distinct_crops, n_maiz, n_trigo_invierno, n_barbecho, n_alfalfa, x_km, y_km, prev1_streak
- **Evaluación 80/20** (time): f1_macro = 0.310 [0.273, 0.339]; mejor base `base_markov2` = 0.221; skill = +0.181

## Límites
- Entrenado con datos de Weld, Colorado (EE. UU.); no está validado en otras zonas (por ejemplo, Durango).
- Las variables de clima son reanálisis (NASA POWER, ERA5) de ~25–50 km, no mediciones en la parcela.
- Apoya la decisión del agricultor y del técnico; no la reemplaza.

El modelo desplegado se reentrena con el 100 % de las filas: sus métricas son las de la evaluación 80/20, no se pueden recalcular sobre datos que ya vio.
