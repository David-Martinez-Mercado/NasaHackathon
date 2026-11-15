# c07 · xgboost

- **Algoritmo:** XGBoost (regresión) (modelo)
- **Versión:** `v1` · entrenado el 2026-11-15 con 1,028 filas hasta 2026
- **Por qué este:** Error de ~8 días contra 10.5 de la duración habitual
- **Variables:** plant_doy, temp_month_0, temp_month_1, temp_month_2, temp_month_3, temp_month_4, temp_season, gdd_formula_days, usual_days, year, crop, state
- **Evaluación 80/20** (time): r2 = 0.983; mejor base `base_referencia` = 0.973; skill = +0.205

## Límites
- Entrenado con datos de Weld, Colorado (EE. UU.); no está validado en otras zonas (por ejemplo, Durango).
- Las variables de clima son reanálisis (NASA POWER, ERA5) de ~25–50 km, no mediciones en la parcela.
- Apoya la decisión del agricultor y del técnico; no la reemplaza.

El modelo desplegado se reentrena con el 100 % de las filas: sus métricas son las de la evaluación 80/20, no se pueden recalcular sobre datos que ya vio.
