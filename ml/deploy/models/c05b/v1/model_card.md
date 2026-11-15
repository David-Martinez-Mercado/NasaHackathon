# c05b · logistica

- **Algoritmo:** Regresión logística (modelo)
- **Versión:** `v1` · entrenado el 2026-11-15 con 14,076 filas hasta 2026
- **Por qué este:** ROC-AUC 0.871 [0.81–0.92] contra 0.557 de la persistencia
- **Variables:** T2M_MAX, T2M_MIN, T2M, RH2M, WS2M, PS, ALLSKY_SFC_SW_DWN, GWETTOP, GWETROOT, tmax_minus_threshold, tmax_mean_3, tmax_mean_7, tmax_max_7, tmin_mean_7, hot_days_7, rain_sum_14, rain_sum_30, doy_sin, doy_cos, site, heatwave_now
- **Evaluación 80/20** (time): roc_auc = 0.871 [0.808, 0.919]; mejor base `base_persistencia` = 0.557; skill = +0.235

## Límites
- Entrenado con datos de Weld, Colorado (EE. UU.); no está validado en otras zonas (por ejemplo, Durango).
- Las variables de clima son reanálisis (NASA POWER, ERA5) de ~25–50 km, no mediciones en la parcela.
- Apoya la decisión del agricultor y del técnico; no la reemplaza.

El modelo desplegado se reentrena con el 100 % de las filas: sus métricas son las de la evaluación 80/20, no se pueden recalcular sobre datos que ya vio.
