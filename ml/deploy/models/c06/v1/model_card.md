# c06 · indice_experto

- **Algoritmo:** Índice experto (promedio de variables orientadas y estandarizadas) (indice)
- **Versión:** `v1` · entrenado el 2026-11-15 con 11,964 filas
- **Por qué este:** Sin etiqueta real; el índice experto y PCA son igual de estables y el primero se explica en una frase
- **Variables:** slope_pct, available_water_cm, capability_class, hydro_group, ppt_annual_mm, tmax_july_c, vpdmax_july_hpa, max_streak, distinct_crops, fallow_share, row_crop_share, perennial_share
- **Evaluación 80/20** (none): stability = 1.000; mejor base `indice_experto` = 1.000

## Límites
- Entrenado con datos de Weld, Colorado (EE. UU.); no está validado en otras zonas (por ejemplo, Durango).
- Las variables de clima son reanálisis (NASA POWER, ERA5) de ~25–50 km, no mediciones en la parcela.
- Apoya la decisión del agricultor y del técnico; no la reemplaza.

El modelo desplegado se reentrena con el 100 % de las filas: sus métricas son las de la evaluación 80/20, no se pueden recalcular sobre datos que ya vio.
