# c08a · catboost

- **Algoritmo:** CatBoost (clasificación) (modelo)
- **Versión:** `v1` · entrenado el 2026-11-15 con 33,440 filas hasta 2026
- **Por qué este:** ROC-AUC 0.77 contra 0.50 de la frecuencia histórica
- **Variables:** T2M, T2M_MAX, T2M_MIN, T2MDEW, T2MWET, RH2M, QV2M, WS2M, PS, TS, ALLSKY_SFC_SW_DWN, GWETTOP, PRECTOTCORR, rain_sum_3, rain_sum_7, rain_sum_30, wet_days_7, ps_change_1, ps_change_3, t2m_change_1, rh_change_1, dew_depression, doy_sin, doy_cos, site
- **Evaluación 80/20** (time): roc_auc = 0.773; mejor base `base_frecuencia` = 0.500; skill = +0.172

## Límites
- Entrenado con datos de Weld, Colorado (EE. UU.); no está validado en otras zonas (por ejemplo, Durango).
- Las variables de clima son reanálisis (NASA POWER, ERA5) de ~25–50 km, no mediciones en la parcela.
- Apoya la decisión del agricultor y del técnico; no la reemplaza.

El modelo desplegado se reentrena con el 100 % de las filas: sus métricas son las de la evaluación 80/20, no se pueden recalcular sobre datos que ya vio.
