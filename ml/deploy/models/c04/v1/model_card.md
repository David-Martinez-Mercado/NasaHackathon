# c04 · patchtst

- **Algoritmo:** PatchTST (pronóstico a 4 semanas) (modelo)
- **Versión:** `v1` · entrenado el 2026-11-15 con 4,784 filas hasta 2026-11-02
- **Por qué este:** Mejor MASE (0.353), pero su intervalo se traslapa con el de la persistencia (0.396): ventaja no concluyente
- **Variables:** unique_id, ds, y
- **Evaluación 80/20** (time): mase = 0.353 [0.310, 0.409]; mejor base `base_persistencia` = 0.396; skill = +0.110

## Límites
- Entrenado con datos de Weld, Colorado (EE. UU.); no está validado en otras zonas (por ejemplo, Durango).
- Las variables de clima son reanálisis (NASA POWER, ERA5) de ~25–50 km, no mediciones en la parcela.
- Apoya la decisión del agricultor y del técnico; no la reemplaza.

El modelo desplegado se reentrena con el 100 % de las filas: sus métricas son las de la evaluación 80/20, no se pueden recalcular sobre datos que ya vio.
