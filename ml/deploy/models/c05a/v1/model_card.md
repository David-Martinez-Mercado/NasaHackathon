# c05a · base_persistencia

- **Algoritmo:** Persistencia: P(sequía en 3 meses | ¿sequía ahora?) (regla simple, no aprendida)
- **Versión:** `v1` · entrenado el 2026-11-15 con 30,840 filas hasta 2026
- **Por qué este:** Ningún modelo supera a la persistencia (el mejor, k-vecinos, 0.567 contra 0.539, intervalos traslapados)
- **Variables:** spi_1, spi_3, spi_6, spi_12, spi_3_change, water_balance_3, temp_anomaly_3, soil_water_top, soil_water_root, month_sin, month_cos, lat, lon, drought_now
- **Evaluación 80/20** (time): roc_auc = 0.539 [0.471, 0.594]; mejor base `base_persistencia` = 0.539; skill = +0.000

## Límites
- Entrenado con datos de Weld, Colorado (EE. UU.); no está validado en otras zonas (por ejemplo, Durango).
- Las variables de clima son reanálisis (NASA POWER, ERA5) de ~25–50 km, no mediciones en la parcela.
- Apoya la decisión del agricultor y del técnico; no la reemplaza.

El modelo desplegado se reentrena con el 100 % de las filas: sus métricas son las de la evaluación 80/20, no se pueden recalcular sobre datos que ya vio.
