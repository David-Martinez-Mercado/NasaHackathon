# c10 · auto_theta

- **Algoritmo:** AutoTheta (pronóstico a 6 meses) (modelo)
- **Versión:** `v1` · entrenado el 2026-11-15 con 3,087 filas hasta 2026-09-01
- **Por qué este:** MASE 0.711 contra 0.848 de la persistencia
- **Variables:** unique_id, ds, y
- **Evaluación 80/20** (time): mase = 0.711; mejor base `base_persistencia` = 0.848; skill = +0.159

## Límites
- Entrenado con datos de Weld, Colorado (EE. UU.); no está validado en otras zonas (por ejemplo, Durango).
- Las variables de clima son reanálisis (NASA POWER, ERA5) de ~25–50 km, no mediciones en la parcela.
- Apoya la decisión del agricultor y del técnico; no la reemplaza.

El modelo desplegado se reentrena con el 100 % de las filas: sus métricas son las de la evaluación 80/20, no se pueden recalcular sobre datos que ya vio.
