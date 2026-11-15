# c01 · xgboost

- **Algoritmo:** XGBoost (regresión) (modelo)
- **Versión:** `v1` · entrenado el 2026-11-15 con 82,206 filas hasta 2025
- **Por qué este:** R² 0.899 contra 0.900 de Extra Trees (160 MB); el R² de la anomalía respecto al historial del condado es ~0.48
- **Variables:** year, ppt_preseason, ppt_apr_may, ppt_jun_jul, ppt_aug_sep, ppt_season, tmean_season, tmax_jul_aug, tmin_apr_may, tmean_winter, gdd_season, lat, lon, hist_yield, hist_years, crop, state
- **Evaluación 80/20** (time): r2 = 0.899 [0.888, 0.910]; mejor base `base_referencia` = 0.732; skill = +0.386

## Límites
- Entrenado con datos de Weld, Colorado (EE. UU.); no está validado en otras zonas (por ejemplo, Durango).
- Las variables de clima son reanálisis (NASA POWER, ERA5) de ~25–50 km, no mediciones en la parcela.
- Apoya la decisión del agricultor y del técnico; no la reemplaza.

El modelo desplegado se reentrena con el 100 % de las filas: sus métricas son las de la evaluación 80/20, no se pueden recalcular sobre datos que ya vio.
