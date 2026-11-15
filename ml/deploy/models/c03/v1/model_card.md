# c03 · xgboost

- **Algoritmo:** XGBoost (regresión) (modelo)
- **Versión:** `v1` · entrenado el 2026-11-15 con 92,658 filas hasta 2026-10-15
- **Por qué este:** R² 0.251 contra 0.255 de Extra Trees (626 MB); prueba de solo ~15 fechas de una temporada
- **Variables:** T2M_MAX, T2M_MIN, RH2M, WS2M, ALLSKY_SFC_SW_DWN, GWETTOP, GWETROOT, rain_sum_7, rain_sum_14, rain_sum_30, tmax_mean_7, et_mean_7, dew_depression, hour, doy_sin, doy_cos, slope_pct, available_water_cm, x_km, y_km, esi_hist, crop, site
- **Evaluación 80/20** (time): r2 = 0.251 [0.139, 0.360]; mejor base `base_referencia` = 0.028; skill = +0.122

## Límites
- Entrenado con datos de Weld, Colorado (EE. UU.); no está validado en otras zonas (por ejemplo, Durango).
- Las variables de clima son reanálisis (NASA POWER, ERA5) de ~25–50 km, no mediciones en la parcela.
- Apoya la decisión del agricultor y del técnico; no la reemplaza.

El modelo desplegado se reentrena con el 100 % de las filas: sus métricas son las de la evaluación 80/20, no se pueden recalcular sobre datos que ya vio.
